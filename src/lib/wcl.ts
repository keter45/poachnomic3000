import { cached, peekCache, putCache } from "./db";
import { HttpError, sleep } from "./http";
import type { WclSummary } from "./types";

const API = "https://www.warcraftlogs.com/api/v2/client";
const TOKEN_URL = "https://www.warcraftlogs.com/oauth/token";
const H = 3600_000;
/** Pontos que deixamos de reserva antes de pausar e esperar o reset da hora. */
const RESERVE = 60;

export interface Budget {
  limitPerHour: number;
  spent: number;
  resetAt: number; // epoch ms
}

declare global {
  var __wcl: { token?: string; tokenExp?: number; budget?: Budget; onWait?: (until: number | null) => void } | undefined;
}
const state = (globalThis.__wcl ??= {});

export function wclConfigured() {
  return Boolean(process.env.WCL_CLIENT_ID && process.env.WCL_CLIENT_SECRET);
}

export function wclBudget(): Budget | undefined {
  return state.budget;
}

/** Callback para o scanner saber quando estamos parados esperando a cota. */
export function onBudgetWait(fn: ((until: number | null) => void) | undefined) {
  state.onWait = fn;
}

async function token(): Promise<string> {
  if (state.token && state.tokenExp && Date.now() < state.tokenExp - 60_000) return state.token;
  if (!wclConfigured()) throw new Error("WCL_CLIENT_ID / WCL_CLIENT_SECRET não configurados no .env.local");
  const basic = Buffer.from(`${process.env.WCL_CLIENT_ID}:${process.env.WCL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new HttpError(res.status, TOKEN_URL, await res.text());
  const j = (await res.json()) as { access_token: string; expires_in: number };
  state.token = j.access_token;
  state.tokenExp = Date.now() + j.expires_in * 1000;
  return j.access_token;
}

const RL = "rateLimitData { limitPerHour pointsSpentThisHour pointsResetIn }";

let chain: Promise<unknown> = Promise.resolve();

/** Executa uma query GraphQL serializada, respeitando a cota de pontos por hora. */
export function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const run = chain.then(() => gqlNow<T>(query, variables));
  chain = run.catch(() => {});
  return run;
}

async function gqlNow<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const b = state.budget;
  if (b && b.spent >= b.limitPerHour - RESERVE && Date.now() < b.resetAt) {
    state.onWait?.(b.resetAt);
    await sleep(b.resetAt - Date.now() + 5_000);
    state.budget = undefined;
    state.onWait?.(null);
  }
  // injeta rateLimitData na raiz da query
  const q = query.replace(/\{/, `{ ${RL} `);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API, {
      method: "POST",
      headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, variables }),
    });
    if (res.status === 429 && attempt < 3) {
      const until = Date.now() + 60_000 * (attempt + 1);
      state.onWait?.(until);
      await sleep(until - Date.now());
      state.onWait?.(null);
      continue;
    }
    if (res.status === 401 && attempt < 1) {
      state.token = undefined;
      continue;
    }
    if (!res.ok) throw new HttpError(res.status, API, await res.text());
    const j = (await res.json()) as {
      data?: T & { rateLimitData?: { limitPerHour: number; pointsSpentThisHour: number; pointsResetIn: number } };
      errors?: { message: string }[];
    };
    const rl = j.data?.rateLimitData;
    if (rl) state.budget = { limitPerHour: rl.limitPerHour, spent: rl.pointsSpentThisHour, resetAt: Date.now() + rl.pointsResetIn * 1000 };
    if (j.errors?.length && !j.data) throw new Error("WCL: " + j.errors.map((e) => e.message).join("; "));
    return j.data as T;
  }
}

export async function refreshBudget() {
  if (!wclConfigured()) return undefined;
  await gql<unknown>("{ worldData { region(id: 1) { id } } }");
  return state.budget;
}

// ---------- world data ----------

export interface WclZone {
  id: number;
  name: string;
  frozen: boolean;
  encounters: { id: number; name: string }[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function recentZones(): Promise<WclZone[]> {
  return cached("wcl:zones", 24 * H, async () => {
    const d = await gql<{ worldData: { expansions: { id: number; zones: WclZone[] }[] } }>(
      "{ worldData { expansions { id zones { id name frozen encounters { id name } } } } }",
    );
    const latest = d.worldData.expansions.sort((a, b) => b.id - a.id).slice(0, 2);
    return latest.flatMap((e) => e.zones);
  });
}

/** IDs de zones de raid (exclui Mythic+ e dummies) — usados para não gastar pontos com logs de M+. */
export async function raidZoneIds(): Promise<Set<number>> {
  const zones = await recentZones();
  return new Set(zones.filter((z) => !/mythic\+|dummy/i.test(z.name)).map((z) => z.id));
}

/** Acha a zone da WCL correspondente ao raid do Raider.io (pelo nome). */
export async function zoneForRaid(raidName: string): Promise<WclZone | null> {
  const zones = await recentZones();
  const target = norm(raidName);
  const candidates = zones.filter(
    (z) => norm(z.name) === target && !/ptr|beta/i.test(z.name) && z.encounters.length > 0,
  );
  return candidates.sort((a, b) => Number(a.frozen) - Number(b.frozen) || b.id - a.id)[0] ?? null;
}

/** Mapa normalizedName ("TolBarad", "Area52") → slug ("tol-barad", "area-52"). */
export async function serverSlugMap(): Promise<Record<string, string>> {
  return cached("wcl:servers:us", 7 * 24 * H, async () => {
    const d = await gql<{ worldData: { region: { servers: { data: { normalizedName: string; slug: string; name: string }[] } } } }>(
      "{ worldData { region(id: 1) { servers(limit: 1000) { data { name normalizedName slug } } } } }",
    );
    const map: Record<string, string> = {};
    for (const s of d.worldData.region.servers.data) {
      map[s.normalizedName] = s.slug;
      map[s.name] = s.slug;
    }
    return map;
  });
}

export function slugifyServer(server: string, map: Record<string, string>) {
  return (
    map[server] ??
    server
      .replace(/'/g, "")
      .replace(/([a-z])([A-Z0-9])/g, "$1-$2")
      .toLowerCase()
  );
}

// ---------- reports ----------

export interface ReportSummary {
  code: string;
  startTime: number;
  endTime: number;
  zoneId: number | null;
}

export interface ReportDetail extends ReportSummary {
  fights: { encounterID: number; kill: boolean; difficulty: number; friendlyPlayers: number[] }[];
  players: { id: number; name: string; server: string; cls: string }[];
}

/** Lista barata de reports da guilda (sem detalhes). */
export async function guildReports(guild: string, serverSlug: string, startTime: number): Promise<ReportSummary[]> {
  const key = `wcl:guildreports:${serverSlug}:${guild.toLowerCase()}:${Math.floor(startTime / (24 * H))}`;
  return cached(key, 6 * H, async () => {
    const out: ReportSummary[] = [];
    for (let page = 1; page <= 10; page++) {
      const d = await gql<{
        reportData: {
          reports: {
            has_more_pages: boolean;
            data: { code: string; startTime: number; endTime: number; zone: { id: number } | null }[];
          } | null;
        };
      }>(
        `query($n: String, $s: String, $st: Float, $p: Int) { reportData { reports(guildName: $n, guildServerSlug: $s, guildServerRegion: "us", startTime: $st, limit: 100, page: $p) { has_more_pages data { code startTime endTime zone { id } } } } }`,
        { n: guild, s: serverSlug, st: startTime, p: page },
      );
      const r = d.reportData.reports;
      if (!r) break;
      out.push(...r.data.map((x) => ({ code: x.code, startTime: x.startTime, endTime: x.endTime, zoneId: x.zone?.id ?? null })));
      if (!r.has_more_pages) break;
    }
    return out;
  });
}

/** Detalhes (lutas de boss + jogadores) — cacheados para sempre quando o report já terminou. */
export async function reportDetails(reports: ReportSummary[]): Promise<ReportDetail[]> {
  const out: ReportDetail[] = [];
  const missing: ReportSummary[] = [];
  for (const r of reports) {
    const hit = peekCache<ReportDetail>(`wcl:report:${r.code}:${r.endTime}`, Infinity);
    if (hit) out.push(hit);
    else missing.push(r);
  }
  const BATCH = 8;
  for (let i = 0; i < missing.length; i += BATCH) {
    const chunk = missing.slice(i, i + BATCH);
    const body = chunk
      .map(
        (r, j) =>
          `r${j}: report(code: "${r.code}") { fights(killType: Encounters) { encounterID kill difficulty friendlyPlayers } masterData { actors(type: "Player") { id name server subType } } }`,
      )
      .join("\n");
    const d = await gql<{
      reportData: Record<
        string,
        {
          fights: { encounterID: number; kill: boolean | null; difficulty: number | null; friendlyPlayers: number[] | null }[] | null;
          masterData: { actors: { id: number; name: string; server: string | null; subType: string }[] } | null;
        } | null
      >;
    }>(`{ reportData { ${body} } }`);
    chunk.forEach((r, j) => {
      const raw = d.reportData[`r${j}`];
      const fights = (raw?.fights ?? []).map((f) => ({
        encounterID: f.encounterID,
        kill: Boolean(f.kill),
        difficulty: f.difficulty ?? 0,
        friendlyPlayers: f.friendlyPlayers ?? [],
      }));
      const inFights = new Set(fights.flatMap((f) => f.friendlyPlayers));
      const players = (raw?.masterData?.actors ?? [])
        .filter((a) => inFights.has(a.id) && a.server)
        .map((a) => ({ id: a.id, name: a.name, server: a.server as string, cls: a.subType }));
      const detail: ReportDetail = { ...r, fights, players };
      // report ainda pode estar sendo logado: só cacheia "para sempre" se terminou há mais de 12h
      if (Date.now() - r.endTime > 12 * H) putCache(`wcl:report:${r.code}:${r.endTime}`, detail);
      out.push(detail);
    });
  }
  return out.sort((a, b) => a.startTime - b.startTime);
}

// ---------- character rankings ----------

export type WclRankingSummary = WclSummary;

export interface CharRef {
  name: string;
  serverSlug: string;
  /** healers são rankeados por HPS; o padrão da WCL é DPS para todos */
  metric: "dps" | "hps";
}

/** zoneRankings míticos em lote (chave do resultado: "realm/nome") (aliases GraphQL), cache de 24h por personagem. */
export async function characterRankings(chars: CharRef[], zoneId: number): Promise<Map<string, WclRankingSummary>> {
  const result = new Map<string, WclRankingSummary>();
  const keyOf = (c: CharRef) => `wcl:rank:${zoneId}:${c.metric}:${c.serverSlug}:${c.name.toLowerCase()}`;
  const missing: CharRef[] = [];
  for (const c of chars) {
    const hit = peekCache<WclRankingSummary>(keyOf(c), 24 * H);
    if (hit) result.set(`${c.serverSlug}/${c.name.toLowerCase()}`, hit);
    else missing.push(c);
  }
  const BATCH = 10;
  for (let i = 0; i < missing.length; i += BATCH) {
    const chunk = missing.slice(i, i + BATCH);
    const body = chunk
      .map(
        (c, j) =>
          `c${j}: character(name: ${JSON.stringify(c.name)}, serverSlug: ${JSON.stringify(c.serverSlug)}, serverRegion: "us") { hidden zoneRankings(zoneID: ${zoneId}, difficulty: 5, metric: ${c.metric}) }`,
      )
      .join("\n");
    const d = await gql<{ characterData: Record<string, { hidden: boolean; zoneRankings: RawZoneRankings | null } | null> }>(
      `{ characterData { ${body} } }`,
    );
    chunk.forEach((c, j) => {
      const raw = d.characterData[`c${j}`];
      const summary = summarize(raw);
      putCache(keyOf(c), summary);
      result.set(`${c.serverSlug}/${c.name.toLowerCase()}`, summary);
    });
  }
  return result;
}

interface RawZoneRankings {
  bestPerformanceAverage?: number | null;
  medianPerformanceAverage?: number | null;
  metric?: string;
  allStars?: { spec: string; rankPercent: number }[];
  rankings?: {
    encounter: { id: number; name: string };
    rankPercent: number | null;
    medianPercent: number | null;
    totalKills: number;
    spec: string | null;
  }[];
}

function summarize(raw: { hidden: boolean; zoneRankings: RawZoneRankings | null } | null): WclRankingSummary {
  if (!raw) return { hidden: false, found: false, bestAvg: null, medianAvg: null, metric: null, allStarsPercent: null, spec: null, encounters: [] };
  const z = raw.zoneRankings ?? {};
  const allStars = [...(z.allStars ?? [])].sort((a, b) => b.rankPercent - a.rankPercent)[0];
  const encounters = (z.rankings ?? []).map((r) => ({
    id: r.encounter.id,
    name: r.encounter.name,
    best: r.rankPercent,
    median: r.medianPercent,
    kills: r.totalKills ?? 0,
  }));
  const specCounts = new Map<string, number>();
  for (const r of z.rankings ?? []) if (r.spec) specCounts.set(r.spec, (specCounts.get(r.spec) ?? 0) + (r.totalKills ?? 0));
  const spec = [...specCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? allStars?.spec ?? null;
  return {
    hidden: raw.hidden,
    found: true,
    bestAvg: encounters.some((e) => e.kills > 0) ? (z.bestPerformanceAverage ?? null) : null,
    medianAvg: encounters.some((e) => e.kills > 0) ? (z.medianPerformanceAverage ?? null) : null,
    metric: z.metric ?? null,
    allStarsPercent: allStars?.rankPercent ?? null,
    spec,
    encounters,
  };
}
