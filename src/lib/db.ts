import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");

declare global {
  var __poachDb: Database.Database | undefined;
}

export function db(): Database.Database {
  if (!globalThis.__poachDb) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const d = new Database(path.join(DATA_DIR, "poach.db"));
    d.pragma("journal_mode = WAL");
    d.pragma("foreign_keys = ON");
    globalThis.__poachDb = d;
  }
  // roda a migração uma vez por carga do módulo (o hot reload do dev mantém a conexão no globalThis)
  if (!migrated) {
    migrate(globalThis.__poachDb);
    migrated = true;
  }
  return globalThis.__poachDb;
}
let migrated = false;

function migrate(d: Database.Database) {
  d.exec(`
    create table if not exists cache (
      key text primary key,
      value text not null,
      fetched_at integer not null
    );

    create table if not exists guilds (
      id text primary key,             -- us/azralon/perma desvantagem
      region text not null,
      realm_slug text not null,
      realm_name text not null,
      name text not null,
      faction text,
      raid_slug text,
      mythic_killed integer,
      total_bosses integer,
      region_rank integer,
      profile_url text,
      wcl_guild_id integer,
      logs_source text,                -- 'wcl' | 'raiderio'
      mythic_nights integer,           -- noites de raid mítica no tier atual (WCL)
      schedule text,                   -- JSON number[168], hora-da-semana em UTC
      bio text,
      scanned_at integer
    );

    create table if not exists characters (
      id text primary key,             -- us/azralon/nome
      name text not null,
      realm_slug text not null,
      realm_name text,
      region text not null,
      class text,
      spec text,
      role text,
      ilvl real,
      thumbnail text,
      profile_url text,
      rio_guild text,                  -- guilda in-game segundo o Raider.io: "Nome|realm-slug"
      mplus_score real,
      rio_mythic_killed integer,
      wcl_hidden integer,
      wcl text,                        -- JSON resumo do zoneRankings
      socials text,                    -- JSON {battletag,twitch,youtube,twitter,discord}
      main_character text,             -- JSON {name, realm}
      bio text,
      recruiting integer,
      seen_samples text,               -- JSON number[] (timestamps de logout vistos no Raider.io)
      updated_at integer
    );

    create table if not exists guild_members (
      guild_id text not null references guilds(id) on delete cascade,
      char_id text not null,
      in_roster integer not null default 0,
      guild_rank integer,
      nights integer not null default 0,       -- noites míticas presentes (tier atual)
      kills integer not null default 0,        -- kills míticos presentes (tier atual)
      bosses text,                             -- JSON encounterIDs mortos com a guilda
      first_seen integer,                      -- primeiro boss com a guilda (logs)
      last_seen integer,
      activity text,                           -- JSON number[168] (UTC): horas em que aparece nos logs da guilda
      source text not null,                    -- 'wcl' | 'raiderio'
      primary key (guild_id, char_id)
    );
    create index if not exists gm_char on guild_members(char_id);

    create table if not exists targets (
      char_id text primary key,
      status text not null default 'watch',    -- watch | contacted | talking | recruited | rejected
      note text,
      updated_at integer
    );

    create table if not exists settings (
      key text primary key,
      value text not null
    );
  `);
  addColumn(d, "guilds", "history_since integer"); // início da janela de logs consultada (tempo de casa)
  addColumn(d, "characters", "history text"); // JSON RaidHistory[]: progressão nos tiers anteriores

  d.exec(`
    -- jogadores que fazem mítico fora de um raid team escaneado (pugs, guildas não míticas, logs importados)
    create table if not exists standalone (
      char_id text not null,
      raid_slug text not null,
      sources text not null,            -- JSON string[]: wcl | roster | report
      log_guilds text,                  -- JSON string[]: guildas dos logs dos kills
      bosses text,                      -- JSON encounterIDs (WCL) mortos no mítico
      rio_killed integer,               -- bosses míticos segundo o roster do Raider.io
      kill_times text,                  -- JSON number[]: horários dos kills (atividade)
      reports text,                     -- JSON string[]: códigos de logs importados
      last_kill integer,
      found_at integer,
      primary key (char_id, raid_slug)
    );
  `);
}

function addColumn(d: Database.Database, table: string, def: string) {
  const name = def.split(" ")[0];
  const cols = d.prepare(`pragma table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === name)) d.exec(`alter table ${table} add column ${def}`);
}

export function getSetting<T>(key: string, fallback: T): T {
  const row = db().prepare("select value from settings where key = ?").get(key) as
    | { value: string }
    | undefined;
  return row ? (JSON.parse(row.value) as T) : fallback;
}

export function setSetting(key: string, value: unknown) {
  db()
    .prepare(
      "insert into settings(key, value) values(?, ?) on conflict(key) do update set value = excluded.value",
    )
    .run(key, JSON.stringify(value));
}

/** Cache persistente em SQLite. ttlMs = Infinity para dados imutáveis (reports antigos). */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const row = db().prepare("select value, fetched_at from cache where key = ?").get(key) as
    | { value: string; fetched_at: number }
    | undefined;
  if (row && Date.now() - row.fetched_at < ttlMs) return JSON.parse(row.value) as T;
  const value = await fn();
  putCache(key, value);
  return value;
}

export function putCache(key: string, value: unknown) {
  db()
    .prepare(
      "insert into cache(key, value, fetched_at) values(?, ?, ?) on conflict(key) do update set value = excluded.value, fetched_at = excluded.fetched_at",
    )
    .run(key, JSON.stringify(value), Date.now());
}

export function peekCache<T>(key: string, ttlMs: number): T | undefined {
  const row = db().prepare("select value, fetched_at from cache where key = ?").get(key) as
    | { value: string; fetched_at: number }
    | undefined;
  if (row && Date.now() - row.fetched_at < ttlMs) return JSON.parse(row.value) as T;
  return undefined;
}
