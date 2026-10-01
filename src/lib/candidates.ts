import { db, getSetting } from "./db";
import { addPoint, emptyWeek } from "./schedule";
import type { Candidate, Socials, TierInfo, WclSummary } from "./types";

interface Row {
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
  // characters
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
  updated_at: number | null;
  // guilds
  g_name: string;
  g_realm: string;
  g_killed: number | null;
  g_rank: number | null;
  g_schedule: string | null;
  g_source: string | null;
  g_nights: number | null;
  g_since: number | null;
  g_bio: string | null;
  // targets
  t_status: string | null;
  t_note: string | null;
}

const parse = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);

export function listCandidates(): Candidate[] {
  const tier = getSetting<TierInfo | null>("tier", null);
  const rows = db()
    .prepare(
      `select gm.*, c.*, g.name as g_name, g.realm_name as g_realm, g.mythic_killed as g_killed, g.region_rank as g_rank,
              g.schedule as g_schedule, g.logs_source as g_source, g.mythic_nights as g_nights, g.history_since as g_since, g.bio as g_bio,
              t.status as t_status, t.note as t_note
         from guild_members gm
         join guilds g on g.id = gm.guild_id
         left join characters c on c.id = gm.char_id
         left join targets t on t.char_id = gm.char_id
        where g.raid_slug = ?`,
    )
    .all(tier?.raidSlug ?? "") as Row[];

  const byChar = new Map<string, Row[]>();
  for (const r of rows) byChar.set(r.char_id, [...(byChar.get(r.char_id) ?? []), r]);

  const out: Candidate[] = [];
  for (const [id, memberships] of byChar) {
    // a guilda "principal" é onde ele mais raida
    memberships.sort((a, b) => b.nights - a.nights || b.kills - a.kills || b.in_roster - a.in_roster);
    const m = memberships[0];
    const wcl = parse<WclSummary>(m.wcl);
    const total = tier?.totalBosses ?? 99;
    // só bosses deste raid: a zone da WCL pode misturar encounters de outro raid
    const inRaid = (id: number) => !tier?.wclEncounterIds?.length || tier.wclEncounterIds.includes(id);
    const wclKilled = wcl ? wcl.encounters.filter((e) => e.kills > 0 && inRaid(e.id)).length : 0;
    const logKilled = memberships.reduce(
      (acc, x) => Math.max(acc, (parse<number[]>(x.bosses) ?? []).filter(inRaid).length),
      0,
    );
    const killedCandidates = [wclKilled, logKilled, m.rio_mythic_killed ?? 0];
    const mythicKilled = Math.min(total, Math.max(...killedCandidates));

    const activity = emptyWeek();
    let hasActivity = false;
    for (const x of memberships) {
      const a = parse<number[]>(x.activity);
      if (!a) continue;
      a.forEach((v, i) => {
        activity[i] += v;
        if (v) hasActivity = true;
      });
    }
    for (const ts of parse<number[]>(m.seen_samples) ?? []) {
      addPoint(activity, ts);
      hasActivity = true;
    }

    const [rgName, rgRealm] = m.rio_guild?.split("|") ?? [];
    const realmSlug = m.realm_slug ?? id.split("/")[1];
    out.push({
      id,
      name: m.name ?? id.split("/")[2],
      realmSlug,
      realmName: m.realm_name,
      class: m.class,
      spec: m.spec,
      role: m.role,
      ilvl: m.ilvl,
      thumbnail: m.thumbnail,
      profileUrl: m.profile_url,
      mplusScore: m.mplus_score,
      mythicKilled: Number.isFinite(mythicKilled) ? mythicKilled : null,
      wcl,
      socials: parse<Socials>(m.socials),
      main: parse<{ name: string; realm: string }>(m.main_character),
      bio: m.bio,
      recruiting: Boolean(m.recruiting),
      rioGuild: rgName ? { name: rgName, realm: rgRealm } : null,
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
      target: m.t_status ? { status: m.t_status, note: m.t_note } : null,
      updatedAt: m.updated_at,
    });
  }
  return out;
}

export function guildCount() {
  const tier = getSetting<TierInfo | null>("tier", null);
  return (db().prepare("select count(*) n from guilds where raid_slug = ?").get(tier?.raidSlug ?? "") as { n: number }).n;
}
