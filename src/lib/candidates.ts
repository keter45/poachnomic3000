import { db, getSetting } from "./db";
import { addPoint, emptyWeek } from "./schedule";
import type { Candidate, RaidHistory, Socials, TierInfo, WclSummary } from "./types";

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
  c.mplus_score, c.rio_mythic_killed, c.wcl, c.socials, c.main_character, c.bio, c.recruiting, c.seen_samples, c.history, c.updated_at,
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
  return out;
}

export function guildCount() {
  const tier = getSetting<TierInfo | null>("tier", null);
  return (db().prepare("select count(*) n from guilds where raid_slug = ?").get(tier?.raidSlug ?? "") as { n: number }).n;
}
