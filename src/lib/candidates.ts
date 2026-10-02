import { db, getSetting } from "./db";
import { addPoint, emptyWeek } from "./schedule";
import type { RioAccountCharacter } from "./raiderio";
import type { AccountCharacter, AccountSummary, Candidate, RaidHistory, Socials, TierInfo, WclSummary } from "./types";

interface CharRow {
  name: string | null;
  realm_slug: string | null;
  realm_name: string | null;
  class: string | null;
  spec: string | null;
  role: string | null;
  ilvl: number | null;
  thumbnail: string | null;
  profile_url: string | null;
  rio_guild: string | null;
  mplus_score: number | null;
  rio_mythic_killed: number | null;
  wcl: string | null;
  socials: string | null;
  main_character: string | null;
  bio: string | null;
  recruiting: number | null;
  seen_samples: string | null;
  history: string | null;
  rio_user: string | null;
  updated_at: number | null;
  t_status: string | null;
  t_note: string | null;
}

interface MemberRow extends CharRow {
  char_id: string;
  guild_id: string;
  in_roster: number;
  guild_rank: number | null;
  nights: number;
  kills: number;
  bosses: string | null;
  first_seen: number | null;
  last_seen: number | null;
  activity: string | null;
  g_name: string;
  g_realm: string;
  g_killed: number | null;
  g_rank: number | null;
  g_schedule: string | null;
  g_source: string | null;
  g_nights: number | null;
  g_since: number | null;
  g_bio: string | null;
}

interface StandaloneRow extends CharRow {
  char_id: string;
  sources: string;
  log_guilds: string | null;
  s_bosses: string | null;
  rio_killed: number | null;
  kill_times: string | null;
  reports: string | null;
  last_kill: number | null;
}

const parse = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);

const CHAR_COLS = `c.name, c.realm_slug, c.realm_name, c.class, c.spec, c.role, c.ilvl, c.thumbnail, c.profile_url, c.rio_guild,
  c.mplus_score, c.rio_mythic_killed, c.wcl, c.socials, c.main_character, c.bio, c.recruiting, c.seen_samples, c.history, c.rio_user, c.updated_at,
  t.status as t_status, t.note as t_note`;

/** Campos do personagem comuns aos dois tipos de linha. */
function characterFields(id: string, c: CharRow, tier: TierInfo | null, extraKilled: number[]) {
  const wcl = parse<WclSummary>(c.wcl);
  // só bosses deste raid: a zone da WCL pode misturar encounters de outro raid
  const inRaid = (e: number) => !tier?.wclEncounterIds?.length || tier.wclEncounterIds.includes(e);
  const wclKilled = wcl ? wcl.encounters.filter((e) => e.kills > 0 && inRaid(e.id)).length : 0;
  const mythicKilled = Math.min(tier?.totalBosses ?? 99, Math.max(wclKilled, c.rio_mythic_killed ?? 0, ...extraKilled));
  const [rgName, rgRealm] = c.rio_guild?.split("|") ?? [];
  return {
    id,
    name: c.name ?? id.split("/")[2],
    realmSlug: c.realm_slug ?? id.split("/")[1],
    realmName: c.realm_name,
    class: c.class,
    spec: c.spec,
    role: c.role,
    ilvl: c.ilvl,
    thumbnail: c.thumbnail,
    profileUrl: c.profile_url,
    mplusScore: c.mplus_score,
    mythicKilled: Number.isFinite(mythicKilled) ? mythicKilled : null,
    wcl,
    socials: parse<Socials>(c.socials),
    main: parse<{ name: string; realm: string }>(c.main_character),
    bio: c.bio,
    recruiting: Boolean(c.recruiting),
    rioGuild: rgName ? { name: rgName, realm: rgRealm } : null,
    history: parse<RaidHistory[]>(c.history),
    rioUser: c.rio_user,
    account: null as AccountSummary | null,
    target: c.t_status ? { status: c.t_status, note: c.t_note } : null,
    updatedAt: c.updated_at,
  };
}

const inRaidOf = (tier: TierInfo | null) => (e: number) => !tier?.wclEncounterIds?.length || tier.wclEncounterIds.includes(e);

export function listCandidates(): Candidate[] {
  const tier = getSetting<TierInfo | null>("tier", null);
  const raid = tier?.raidSlug ?? "";
  const inRaid = inRaidOf(tier);
  const d = db();

  const memberRows = d
    .prepare(
      `select gm.*, ${CHAR_COLS}, g.name as g_name, g.realm_name as g_realm, g.mythic_killed as g_killed, g.region_rank as g_rank,
              g.schedule as g_schedule, g.logs_source as g_source, g.mythic_nights as g_nights, g.history_since as g_since, g.bio as g_bio
         from guild_members gm
         join guilds g on g.id = gm.guild_id
         left join characters c on c.id = gm.char_id
         left join targets t on t.char_id = gm.char_id
        where g.raid_slug = ?`,
    )
    .all(raid) as MemberRow[];

  const byChar = new Map<string, MemberRow[]>();
  for (const r of memberRows) byChar.set(r.char_id, [...(byChar.get(r.char_id) ?? []), r]);

  const out: Candidate[] = [];
  for (const [id, memberships] of byChar) {
    // a guilda "principal" é onde ele mais raida
    memberships.sort((a, b) => b.nights - a.nights || b.kills - a.kills || b.in_roster - a.in_roster);
    const m = memberships[0];
    const logKilled = Math.max(0, ...memberships.map((x) => (parse<number[]>(x.bosses) ?? []).filter(inRaid).length));

    const activity = emptyWeek();
    let hasActivity = false;
    for (const x of memberships) {
      for (const [i, v] of (parse<number[]>(x.activity) ?? []).entries()) {
        activity[i] += v;
        if (v) hasActivity = true;
      }
    }
    for (const ts of parse<number[]>(m.seen_samples) ?? []) {
      addPoint(activity, ts);
      hasActivity = true;
    }

    out.push({
      ...characterFields(id, m, tier, [logKilled]),
      kind: "guild",
      standalone: null,
      guildId: m.guild_id,
      guildName: m.g_name,
      guildRealm: m.g_realm,
      guildProgress: m.g_killed,
      guildRegionRank: m.g_rank,
      guildSchedule: parse<number[]>(m.g_schedule),
      guildLogsSource: m.g_source,
      guildMythicNights: m.g_nights,
      guildHistorySince: m.g_since,
      guildBio: m.g_bio,
      inRoster: Boolean(m.in_roster),
      guildRank: m.guild_rank,
      nights: m.nights,
      kills: m.kills,
      firstSeen: m.first_seen,
      lastSeen: m.last_seen,
      activity: hasActivity ? activity : null,
      otherGuilds: memberships.slice(1).map((x) => x.g_name),
    });
  }

  // avulsos: quem não entrou em nenhum raid team
  const standaloneRows = d
    .prepare(
      `select s.char_id, s.sources, s.log_guilds, s.bosses as s_bosses, s.rio_killed, s.kill_times, s.reports, s.last_kill, ${CHAR_COLS}
         from standalone s
         join characters c on c.id = s.char_id
         left join targets t on t.char_id = s.char_id
        where s.raid_slug = ?`,
    )
    .all(raid) as StandaloneRow[];

  for (const s of standaloneRows) {
    if (byChar.has(s.char_id)) continue;
    const bosses = (parse<number[]>(s.s_bosses) ?? []).filter(inRaid);
    const killTimes = parse<number[]>(s.kill_times) ?? [];
    const activity = emptyWeek();
    for (const ts of [...killTimes, ...(parse<number[]>(s.seen_samples) ?? [])]) addPoint(activity, ts);
    const hasActivity = killTimes.length > 0 || Boolean(parse<number[]>(s.seen_samples)?.length);
    out.push({
      ...characterFields(s.char_id, s, tier, [bosses.length, s.rio_killed ?? 0]),
      kind: "standalone",
      standalone: {
        sources: parse<string[]>(s.sources) ?? [],
        logGuilds: parse<string[]>(s.log_guilds) ?? [],
        bossesKilled: bosses.length,
        lastKill: s.last_kill,
        reports: parse<string[]>(s.reports) ?? [],
      },
      guildId: null,
      guildName: null,
      guildRealm: null,
      guildProgress: null,
      guildRegionRank: null,
      guildSchedule: null,
      guildLogsSource: null,
      guildMythicNights: null,
      guildHistorySince: null,
      guildBio: null,
      inRoster: false,
      guildRank: null,
      nights: 0,
      kills: 0,
      firstSeen: null,
      lastSeen: s.last_kill,
      activity: hasActivity ? activity : null,
      otherGuilds: [],
    });
  }
  return attachAccounts(out as (Candidate & { rioUser: string | null })[]);
}

/**
 * Junta personagens da mesma pessoa (union-find) por: usuário do Raider.io, BattleTag, Discord e main declarado.
 * Cada candidato recebe o resumo da conta, com o roster completo do Raider.io quando existe.
 */
function attachAccounts(list: (Candidate & { rioUser: string | null })[]): Candidate[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (parent.get(c) !== r) {
      const n = parent.get(c)!;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  const node = (x: string) => {
    if (!parent.has(x)) parent.set(x, x);
    return x;
  };
  const union = (a: string, b: string) => parent.set(find(node(a)), find(node(b)));

  const how = new Map<string, Set<string>>(); // nó de chave → como ligou
  const link = (id: string, key: string, label: string) => {
    union(`char:${id}`, key);
    how.set(key, (how.get(key) ?? new Set()).add(label));
  };
  for (const c of list) {
    node(`char:${c.id}`);
    if (c.rioUser) link(c.id, `rio:${c.rioUser.toLowerCase()}`, "Raider.io");
    if (c.socials?.battletag) link(c.id, `bt:${c.socials.battletag.toLowerCase()}`, "BattleTag");
    if (c.socials?.discord) link(c.id, `dc:${c.socials.discord.toLowerCase()}`, "Discord");
    if (c.main) {
      const mainId = `us/${c.main.realm}/${c.main.name.toLowerCase()}`;
      if (mainId !== c.id) link(c.id, `char:${mainId}`, "main declarado");
    }
  }

  const groups = new Map<string, (Candidate & { rioUser: string | null })[]>();
  for (const c of list) {
    const root = find(`char:${c.id}`);
    groups.set(root, [...(groups.get(root) ?? []), c]);
  }

  const rosterOf = db().prepare("select characters from accounts where rio_user = ?");
  for (const [root, members] of groups) {
    const users = [...new Set(members.map((m) => m.rioUser).filter((u): u is string => Boolean(u)))];
    const linkedBy = new Set<string>();
    for (const [key, labels] of how) if (find(key) === root) labels.forEach((l) => linkedBy.add(l));

    // roster: o do Raider.io (todas as contas do grupo) + os personagens listados
    const chars = new Map<string, AccountCharacter>();
    for (const u of users) {
      const row = rosterOf.get(u) as { characters: string | null } | undefined;
      const roster = (row?.characters ? JSON.parse(row.characters) : []) as RioAccountCharacter[];
      const maxLevel = Math.max(0, ...roster.map((r) => r.level));
      for (const r of roster) {
        if (r.level < maxLevel) continue;
        const id = `us/${r.realm}/${r.name.toLowerCase()}`;
        chars.set(id, { id, name: r.name, realm: r.realm, realmName: r.realmName, class: r.class, spec: r.spec, ilvl: r.ilvl, mythic: r.mythic, mplus: r.mplus, listed: false });
      }
    }
    for (const m of members) {
      const prev = chars.get(m.id);
      chars.set(m.id, {
        id: m.id,
        name: m.name,
        realm: m.realmSlug,
        realmName: m.realmName ?? prev?.realmName ?? null,
        class: m.class ?? prev?.class ?? null,
        spec: m.spec ?? prev?.spec ?? null,
        ilvl: m.ilvl ?? prev?.ilvl ?? null,
        mythic: Math.max(m.mythicKilled ?? 0, prev?.mythic ?? 0),
        mplus: Math.max(m.mplusScore ?? 0, prev?.mplus ?? 0),
        listed: true,
      });
    }
    const all = [...chars.values()];
    const bestIlvl = Math.max(0, ...all.map((c) => c.ilvl ?? 0));
    const relevant = all
      .filter((c) => c.listed || (c.mythic ?? 0) > 0 || (c.mplus ?? 0) >= 1000 || (c.ilvl ?? 0) >= bestIlvl - 15)
      .sort((a, b) => Number(b.listed) - Number(a.listed) || (b.mythic ?? 0) - (a.mythic ?? 0) || (b.ilvl ?? 0) - (a.ilvl ?? 0))
      .slice(0, 16);
    const classes = [
      ...new Set(relevant.filter((c) => c.class && ((c.mythic ?? 0) > 0 || (c.ilvl ?? 0) >= bestIlvl - 15)).map((c) => c.class as string)),
    ];
    const main = members.find((m) => m.main)?.main;
    const account: AccountSummary = {
      key: root,
      rioUser: users[0] ?? null,
      label: users[0] ?? members.find((m) => m.socials?.battletag)?.socials?.battletag ?? (main ? main.name : members[0].name),
      linkedBy: [...linkedBy],
      characters: relevant,
      listed: members.map((m) => m.id),
      bestMythic: Math.max(0, ...all.map((c) => c.mythic ?? 0)),
      bestMplus: Math.max(0, ...all.map((c) => c.mplus ?? 0)),
      classes,
    };
    // só vale chamar de "conta" quando há mais de um personagem conhecido
    for (const m of members) m.account = all.length > 1 ? account : null;
  }
  return list.map(({ rioUser: _drop, ...c }) => {
    void _drop;
    return c;
  });
}

export function guildCount() {
  const tier = getSetting<TierInfo | null>("tier", null);
  return (db().prepare("select count(*) n from guilds where raid_slug = ?").get(tier?.raidSlug ?? "") as { n: number }).n;
}
