import { db, getSetting, setSetting } from "./db";
import * as rio from "./raiderio";
import { addPoint, addSpan, emptyWeek } from "./schedule";
import { DEFAULT_SCAN, type RaidHistory, type ScanLogLine, type ScanParams, type ScanState, type TierInfo } from "./types";
import * as wcl from "./wcl";

const DAY = 24 * 3600_000;

declare global {
  var __scan: { state: ScanState; stop: boolean } | undefined;
}

const job = (globalThis.__scan ??= {
  stop: false,
  state: {
    status: "idle",
    phase: "",
    params: null,
    startedAt: null,
    finishedAt: null,
    guildsTotal: 0,
    guildsDone: 0,
    charsDone: 0,
    current: null,
    waitingUntil: null,
    log: [],
  },
});

export function scanState(): ScanState {
  return job.state;
}

function log(level: ScanLogLine["level"], msg: string) {
  job.state.log.push({ ts: Date.now(), level, msg });
  if (job.state.log.length > 300) job.state.log.splice(0, job.state.log.length - 300);
  if (level !== "info") console[level === "error" ? "error" : "warn"]("[scan]", msg);
}

class Stopped extends Error {}
function checkStop() {
  if (job.stop) throw new Stopped();
}

export function startScan(params: ScanParams) {
  if (job.state.status === "running" || job.state.status === "stopping") throw new Error("Já existe um scan rodando");
  job.stop = false;
  job.state = {
    status: "running",
    phase: "Preparando",
    params,
    startedAt: Date.now(),
    finishedAt: null,
    guildsTotal: 0,
    guildsDone: 0,
    charsDone: 0,
    current: null,
    waitingUntil: null,
    log: [],
  };
  wcl.onBudgetWait((until) => {
    job.state.waitingUntil = until;
    if (until === null) return;
    log("warn", `Cota da Warcraft Logs quase no fim — pausando até ${new Date(until).toLocaleTimeString("pt-BR")}`);
  });
  run(params)
    .then(() => {
      job.state.status = job.stop ? "stopped" : "done";
      log("info", job.stop ? "Scan interrompido" : "Scan concluído");
    })
    .catch((e) => {
      if (e instanceof Stopped) {
        job.state.status = "stopped";
        log("info", "Scan interrompido");
      } else {
        job.state.status = "error";
        log("error", e instanceof Error ? e.message : String(e));
      }
    })
    .finally(() => {
      job.state.finishedAt = Date.now();
      job.state.current = null;
      job.state.waitingUntil = null;
      job.state.phase = "";
    });
}

export function stopScan() {
  if (job.state.status === "running") {
    job.stop = true;
    job.state.status = "stopping";
  }
}

// ---------------------------------------------------------------------------

export async function loadTier(): Promise<TierInfo> {
  const existing = getSetting<TierInfo | null>("tier", null);
  // sem zone da WCL no cache mas com chave configurada agora: recarrega (a chave pode ter sido adicionada depois)
  const stale = existing && existing.wclZoneId === null && wcl.wclConfigured();
  if (existing?.historyRaids && !stale && Date.now() - existing.updatedAt < 6 * 3600_000) return existing;
  const [raid] = await rio.currentRaids("us");
  if (!raid) throw new Error("Nenhum raid ativo encontrado no Raider.io");
  const history = (await rio.tierRaids("us"))
    .filter((r) => r.slug !== raid.slug && Date.parse(r.starts.us) < Date.parse(raid.starts.us))
    .slice(0, 4)
    .map((r) => ({ slug: r.slug, name: r.name, total: r.encounters.length }));
  const season = await rio.currentSeason("us");
  const zone = wcl.wclConfigured() ? await wcl.zoneForRaid(raid.name) : null;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const raidBosses = new Set(raid.encounters.map((e) => norm(e.name)));
  const tier: TierInfo = {
    raidSlug: raid.slug,
    raidName: raid.name,
    totalBosses: raid.encounters.length,
    tierStart: Date.parse(raid.starts.us),
    wclZoneId: zone?.id ?? null,
    wclEncounterIds: zone?.encounters.filter((e) => raidBosses.has(norm(e.name))).map((e) => e.id) ?? [],
    historyRaids: history,
    seasonSlug: season?.slug ?? null,
    cutoffs: season ? await rio.mplusCutoffs(season.slug, "us") : null,
    updatedAt: Date.now(),
  };
  setSetting("tier", tier);
  return tier;
}

interface MemberStats {
  id: string;
  name: string;
  realmSlug: string;
  nights: number;
  kills: number;
  bosses: Set<number>;
  firstSeen: number;
  lastSeen: number;
  activity: number[];
}

const charId = (realmSlug: string, name: string) => `us/${realmSlug}/${name.toLowerCase()}`;

async function run(params: ScanParams) {
  job.state.phase = "Carregando tier atual";
  const tier = await loadTier();
  log("info", `Tier: ${tier.raidName} (${tier.totalBosses} bosses)${tier.wclZoneId ? ` · WCL zone ${tier.wclZoneId}` : " · sem WCL"}`);
  checkStop();

  // ---- lista de guildas ----
  job.state.phase = "Buscando guildas";
  const entries: rio.RioRaidRankingEntry[] = [];
  if (params.scope.kind === "subregion") {
    entries.push(...(await rio.raidRankings({ raid: tier.raidSlug, difficulty: "mythic", region: params.scope.value })));
  } else {
    for (const realm of params.scope.realms) {
      checkStop();
      entries.push(...(await rio.raidRankings({ raid: tier.raidSlug, difficulty: "mythic", region: "us", realm })));
    }
  }
  const guilds = entries
    .filter((e) => e.encountersDefeated.length >= params.minBosses && e.encountersDefeated.length <= params.maxBosses)
    .sort((a, b) => a.regionRank - b.regionRank)
    .slice(0, params.maxGuilds);
  job.state.guildsTotal = guilds.length;
  log("info", `${guilds.length} guildas no escopo (de ${entries.length} com progresso mítico)`);

  const useWcl = wcl.wclConfigured() && tier.wclZoneId !== null;
  const serverMap = useWcl ? await wcl.serverSlugMap() : {};
  const raidZones = useWcl ? await wcl.raidZoneIds() : new Set<number>();

  for (const entry of guilds) {
    checkStop();
    const g = entry.guild;
    job.state.current = `${g.name} (${g.realm.name})`;
    job.state.phase = `Guilda ${job.state.guildsDone + 1}/${guilds.length}`;
    try {
      await scanGuild(entry, tier, params, useWcl, serverMap, raidZones);
    } catch (e) {
      if (e instanceof Stopped) throw e;
      log("error", `${g.name}: ${e instanceof Error ? e.message : e}`);
    }
    job.state.guildsDone++;
  }

  if (params.findStandalone) {
    const scanned = new Set(guilds.map((e) => e.guild.name.toLowerCase()));
    const mythicRanked = new Set(entries.map((e) => e.guild.name.toLowerCase()));
    await scanStandalone(tier, params, { scanned, mythicRanked }, useWcl, serverMap);
  }
}

async function scanGuild(
  entry: rio.RioRaidRankingEntry,
  tier: TierInfo,
  params: ScanParams,
  useWcl: boolean,
  serverMap: Record<string, string>,
  raidZones: Set<number>,
) {
  const g = entry.guild;
  const realm = g.realm.slug;
  const guildId = `us/${realm}/${g.name.toLowerCase()}`;

  const [roster, details] = await Promise.all([
    rio.guildRoster("us", realm, g.name).catch(() => [] as rio.RioRosterMember[]),
    rio.guildDetails("us", realm, g.name).catch(() => ({ bio: null, activityTimestamps: [] })),
  ]);
  const rosterById = new Map(roster.map((m) => [charId(m.character.realm.slug, m.character.name), m]));

  // ---- raid team pelos logs ----
  const stats = new Map<string, MemberStats>();
  const schedule = emptyWeek();
  let mythicNights = 0;
  if (useWcl) {
    const since = Math.min(tier.tierStart, Date.now() - params.historyDays * DAY);
    // guilda inexistente na WCL vira "sem logs" (cai no roster do Raider.io)
    const list = await wcl.guildReports(g.name, realm, since).catch((e) => {
      if (e instanceof Stopped) throw e;
      log("warn", `${g.name}: sem reports na WCL (${e instanceof Error ? e.message : e})`);
      return [] as wcl.ReportSummary[];
    });
    const raidReports = list.filter((r) => r.zoneId !== null && raidZones.has(r.zoneId));
    checkStop();
    const reports = await wcl.reportDetails(raidReports);
    for (const r of reports) {
      const currentTier = r.zoneId === tier.wclZoneId && r.startTime >= tier.tierStart;
      const mythic = r.fights.filter((f) => f.difficulty === 5);
      if (currentTier && mythic.length) {
        mythicNights++;
        addSpan(schedule, r.startTime, r.endTime);
      }
      for (const p of r.players) {
        const present = r.fights.filter((f) => f.friendlyPlayers.includes(p.id));
        if (!present.length) continue;
        const id = charId(wcl.slugifyServer(p.server, serverMap), p.name);
        let s = stats.get(id);
        if (!s) {
          s = {
            id,
            name: p.name,
            realmSlug: wcl.slugifyServer(p.server, serverMap),
            nights: 0,
            kills: 0,
            bosses: new Set(),
            firstSeen: r.startTime,
            lastSeen: r.endTime,
            activity: emptyWeek(),
          };
          stats.set(id, s);
        }
        s.firstSeen = Math.min(s.firstSeen, r.startTime);
        s.lastSeen = Math.max(s.lastSeen, r.endTime);
        addSpan(s.activity, r.startTime, r.endTime);
        if (currentTier) {
          const myMythic = present.filter((f) => f.difficulty === 5);
          if (myMythic.length) {
            s.nights++;
            for (const f of myMythic) {
              if (!f.kill) continue;
              s.kills++;
              s.bosses.add(f.encounterID);
            }
          }
        }
      }
    }
  }

  const minNights = Math.max(1, Math.ceil(params.minAttendance * mythicNights));
  let team: MemberStats[];
  let source: "wcl" | "raiderio";
  if (mythicNights > 0) {
    source = "wcl";
    team = [...stats.values()].filter((s) => s.nights >= minNights);
  } else {
    // guilda não loga na WCL: usa o roster do Raider.io (só membros com kill mítico no tier)
    source = "raiderio";
    for (const ts of details.activityTimestamps) if (ts >= tier.tierStart) addPoint(schedule, ts);
    team = roster
      .filter((m) => m.raidProgress?.raid.slug === tier.raidSlug && (m.raidProgress.progress.mythic ?? 0) > 0)
      .map((m) => {
        const id = charId(m.character.realm.slug, m.character.name);
        const s = stats.get(id); // pode ter aparecido em logs antigos (tempo de casa)
        return {
          id,
          name: m.character.name,
          realmSlug: m.character.realm.slug,
          nights: 0,
          kills: 0,
          bosses: new Set<number>(),
          firstSeen: s?.firstSeen ?? 0,
          lastSeen: s?.lastSeen ?? 0,
          activity: s?.activity ?? emptyWeek(),
        };
      });
  }
  log(
    "info",
    `${g.name}: ${team.length} raiders (${source === "wcl" ? `${mythicNights} noites míticas logadas` : "sem logs — roster do Raider.io"})`,
  );

  const d = db();
  d.prepare(
    `insert into guilds(id, region, realm_slug, realm_name, name, faction, raid_slug, mythic_killed, total_bosses, region_rank, profile_url, logs_source, mythic_nights, schedule, bio, history_since, scanned_at)
     values(@id, 'us', @realm, @realmName, @name, @faction, @raid, @killed, @total, @rank, @url, @source, @nights, @schedule, @bio, @since, @now)
     on conflict(id) do update set realm_name=excluded.realm_name, name=excluded.name, faction=excluded.faction, raid_slug=excluded.raid_slug,
       mythic_killed=excluded.mythic_killed, total_bosses=excluded.total_bosses, region_rank=excluded.region_rank, profile_url=excluded.profile_url,
       logs_source=excluded.logs_source, mythic_nights=excluded.mythic_nights, schedule=excluded.schedule, bio=excluded.bio, history_since=excluded.history_since, scanned_at=excluded.scanned_at`,
  ).run({
    id: guildId,
    realm,
    realmName: g.realm.name,
    name: g.name,
    faction: g.faction,
    raid: tier.raidSlug,
    killed: entry.encountersDefeated.length,
    total: tier.totalBosses,
    rank: entry.regionRank,
    url: `https://raider.io${g.path}`,
    source,
    nights: mythicNights,
    schedule: JSON.stringify(schedule),
    bio: details.bio,
    since: useWcl ? Math.min(tier.tierStart, Date.now() - params.historyDays * DAY) : null,
    now: Date.now(),
  });
  const insert = d.prepare(
    `insert into guild_members(guild_id, char_id, in_roster, guild_rank, nights, kills, bosses, first_seen, last_seen, activity, source)
     values(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  d.transaction(() => {
    d.prepare("delete from guild_members where guild_id = ?").run(guildId);
    for (const s of team) {
      const r = rosterById.get(s.id);
      insert.run(
        guildId,
        s.id,
        r ? 1 : 0,
        r?.rank ?? null,
        s.nights,
        s.kills,
        JSON.stringify([...s.bosses]),
        s.firstSeen || null,
        s.lastSeen || null,
        JSON.stringify(s.activity),
        source,
      );
    }
  })();

  checkStop();
  await enrichCharacters(team, tier, params, useWcl, rosterById);
}

interface CharKey {
  id: string;
  name: string;
  realmSlug: string;
}

/** Perfil (Raider.io), parses (WCL) e redes sociais de uma lista de personagens, gravando em `characters`. */
async function enrichCharacters(
  chars: CharKey[],
  tier: TierInfo,
  params: ScanParams,
  useWcl: boolean,
  rosterById: Map<string, rio.RioRosterMember> = new Map(),
  onEach?: () => void,
) {
  const curve = [tier.raidSlug, ...tier.historyRaids.map((r) => r.slug)];
  // perfil do Raider.io primeiro: o role decide a métrica dos parses (healer = HPS)
  const profiles = new Map<string, rio.RioCharacterProfile | null>();
  for (const s of chars) {
    checkStop();
    profiles.set(s.id, await rio.characterProfile("us", s.realmSlug, s.name, curve).catch(() => null));
  }
  const roleOf = (s: CharKey) =>
    profiles.get(s.id)?.active_spec_role ?? rosterById.get(s.id)?.character.spec?.role?.toUpperCase() ?? null;
  const rankings =
    useWcl && params.fetchRankings && tier.wclZoneId
      ? await wcl.characterRankings(
          chars.map((s) => ({ name: s.name, serverSlug: s.realmSlug, metric: roleOf(s) === "HEALING" ? "hps" : "dps" })),
          tier.wclZoneId,
        )
      : new Map<string, wcl.WclRankingSummary>();

  for (const s of chars) {
    checkStop();
    try {
      await upsertCharacter(
        s,
        tier,
        params,
        profiles.get(s.id) ?? null,
        rankings.get(`${s.realmSlug}/${s.name.toLowerCase()}`) ?? null,
        rosterById.get(s.id),
      );
    } catch (e) {
      log("warn", `${s.name}-${s.realmSlug}: ${e instanceof Error ? e.message : e}`);
    }
    job.state.charsDone++;
    onEach?.();
  }
}

/** Progressão nos tiers anteriores: kills míticos deste personagem + AOTC/CE da conta. */
function buildHistory(tier: TierInfo, profile: rio.RioCharacterProfile | null): RaidHistory[] | null {
  if (!profile?.raid_progression) return null;
  const curve = new Map((profile.raid_achievement_curve ?? []).map((c) => [c.raid, c]));
  return tier.historyRaids.map((r) => {
    const p = profile.raid_progression?.[r.slug];
    const c = curve.get(r.slug);
    return {
      slug: r.slug,
      name: r.name,
      total: p?.total_bosses ?? r.total,
      mythic: p?.mythic_bosses_killed ?? 0,
      heroic: p?.heroic_bosses_killed ?? 0,
      aotc: c?.aotc ?? null,
      ce: c?.cutting_edge ?? null,
    };
  });
}

async function upsertCharacter(
  s: CharKey,
  tier: TierInfo,
  params: ScanParams,
  profile: rio.RioCharacterProfile | null,
  ranking: wcl.WclRankingSummary | null,
  roster: rio.RioRosterMember | undefined,
) {
  const social = params.fetchSocials
    ? await rio.characterSocial("us", s.realmSlug, s.name, tier.seasonSlug ?? undefined).catch(() => null)
    : null;

  const d = db();
  const prev = d.prepare("select seen_samples, wcl from characters where id = ?").get(s.id) as
    | { seen_samples: string | null; wcl: string | null }
    | undefined;
  const samples: number[] = prev?.seen_samples ? JSON.parse(prev.seen_samples) : [];
  if (social?.loggedOutAt && !samples.includes(social.loggedOutAt)) samples.push(social.loggedOutAt);

  const mplus = profile?.mythic_plus_scores_by_season?.[0]?.scores.all ?? roster?.keystoneScores?.allScore ?? null;
  const rioKilled =
    profile?.raid_progression?.[tier.raidSlug]?.mythic_bosses_killed ??
    (roster?.raidProgress?.raid.slug === tier.raidSlug ? roster.raidProgress.progress.mythic : null);

  d.prepare(
    `insert into characters(id, name, realm_slug, realm_name, region, class, spec, role, ilvl, thumbnail, profile_url, rio_guild, mplus_score,
       rio_mythic_killed, wcl_hidden, wcl, socials, main_character, bio, recruiting, seen_samples, history, updated_at)
     values(@id, @name, @realm, @realmName, 'us', @class, @spec, @role, @ilvl, @thumb, @url, @guild, @mplus, @killed, @hidden, @wcl, @socials, @main, @bio, @recruiting, @samples, @history, @now)
     on conflict(id) do update set name=excluded.name, realm_name=coalesce(excluded.realm_name, characters.realm_name),
       class=coalesce(excluded.class, characters.class), spec=coalesce(excluded.spec, characters.spec), role=coalesce(excluded.role, characters.role),
       ilvl=coalesce(excluded.ilvl, characters.ilvl), thumbnail=coalesce(excluded.thumbnail, characters.thumbnail),
       profile_url=coalesce(excluded.profile_url, characters.profile_url), rio_guild=coalesce(excluded.rio_guild, characters.rio_guild),
       mplus_score=coalesce(excluded.mplus_score, characters.mplus_score), rio_mythic_killed=coalesce(excluded.rio_mythic_killed, characters.rio_mythic_killed),
       wcl_hidden=coalesce(excluded.wcl_hidden, characters.wcl_hidden), wcl=coalesce(excluded.wcl, characters.wcl),
       socials=coalesce(excluded.socials, characters.socials), main_character=coalesce(excluded.main_character, characters.main_character),
       bio=coalesce(excluded.bio, characters.bio), recruiting=coalesce(excluded.recruiting, characters.recruiting),
       history=coalesce(excluded.history, characters.history), seen_samples=excluded.seen_samples, updated_at=excluded.updated_at`,
  ).run({
    id: s.id,
    name: profile?.name ?? s.name,
    realm: s.realmSlug,
    realmName: profile?.realm ?? roster?.character.realm.name ?? null,
    class: profile?.class ?? roster?.character.class.name ?? null,
    spec: profile?.active_spec_name ?? roster?.character.spec?.name ?? ranking?.spec ?? null,
    role: profile?.active_spec_role ?? roster?.character.spec?.role?.toUpperCase() ?? null,
    ilvl: profile?.gear?.item_level_equipped ?? roster?.character.itemLevelEquipped ?? null,
    thumb: profile?.thumbnail_url ?? null,
    url: profile?.profile_url ?? `https://raider.io/characters/us/${s.realmSlug}/${encodeURIComponent(s.name)}`,
    guild: profile?.guild ? `${profile.guild.name}|${profile.guild.realm}` : null,
    mplus,
    killed: rioKilled,
    hidden: ranking ? Number(ranking.hidden) : null,
    wcl: ranking ? JSON.stringify(ranking) : null,
    socials: social
      ? JSON.stringify({
          battletag: social.battletag,
          twitch: social.twitch,
          youtube: social.youtube,
          twitter: social.twitter,
          discord: social.discord,
        })
      : null,
    main: social?.main ? JSON.stringify(social.main) : null,
    bio: social?.bio ?? null,
    recruiting: social ? Number(social.recruiting) : null,
    samples: JSON.stringify(samples.slice(-200)),
    history: (() => {
      const h = buildHistory(tier, profile);
      return h ? JSON.stringify(h) : null;
    })(),
    now: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// Jogadores avulsos: fazem mítico no tier mas não estão em nenhum raid team escaneado

const BR_REALMS = ["azralon", "gallywix", "goldrinn", "nemesis", "tol-barad"];

interface Found {
  id: string;
  name: string;
  realmSlug: string;
  sources: Set<string>;
  /** guilda do personagem em cada kill ranqueado (WCL) ou guilda do log importado */
  logGuilds: Set<string>;
  noGuildKills: number; // kills ranqueados sem guilda
  bosses: Set<number>;
  rioKilled: number | null;
  killTimes: number[];
  reports: Set<string>;
}

function newFound(map: Map<string, Found>, realmSlug: string, name: string): Found {
  const id = charId(realmSlug, name);
  let f = map.get(id);
  if (!f) {
    f = {
      id,
      name,
      realmSlug,
      sources: new Set(),
      logGuilds: new Set(),
      noGuildKills: 0,
      bosses: new Set(),
      rioKilled: null,
      killTimes: [],
      reports: new Set(),
    };
    map.set(id, f);
  }
  return f;
}

async function scanStandalone(
  tier: TierInfo,
  params: ScanParams,
  guildSets: { scanned: Set<string>; mythicRanked: Set<string> },
  useWcl: boolean,
  serverMap: Record<string, string>,
) {
  const realms = params.scope.kind === "realms" ? params.scope.realms : BR_REALMS;
  const found = new Map<string, Found>();

  // 1) rankings por boss da WCL (pega quem loga, inclusive sem guilda)
  if (useWcl) {
    let step = 0;
    const steps = tier.wclEncounterIds.length * realms.length * 2;
    for (const enc of tier.wclEncounterIds) {
      for (const realm of realms) {
        for (const metric of ["dps", "hps"] as const) {
          step++;
          job.state.phase = `Avulsos: rankings da WCL ${step}/${steps}`;
          job.state.current = `${realm} · ${metric.toUpperCase()}`;
          for (let page = 1; page <= 20; page++) {
            checkStop();
            const res = await wcl.encounterRankingsPage(enc, realm, metric, page).catch((e) => {
              log("warn", `Rankings ${enc}/${realm}: ${e instanceof Error ? e.message : e}`);
              return null;
            });
            if (!res) break;
            for (const r of res.rankings) {
              const f = newFound(found, wcl.slugifyServer(r.server.name, serverMap), r.name);
              f.sources.add("wcl");
              f.bosses.add(enc);
              // no ranking, "guild" é a guilda do personagem na hora do kill
              if (r.guild) f.logGuilds.add(r.guild.name);
              else f.noGuildKills++;
              if (r.startTime) f.killTimes.push(r.startTime);
            }
            if (!res.hasMorePages) break;
          }
        }
      }
    }
  }

  // 2) guildas não míticas (heroico) do Raider.io: membros com kill mítico fazem pug
  job.state.phase = "Avulsos: guildas heroicas no Raider.io";
  const heroic: rio.RioRaidRankingEntry[] = [];
  if (params.scope.kind === "subregion") {
    heroic.push(
      ...(await rio.raidRankings({ raid: tier.raidSlug, difficulty: "heroic", region: params.scope.value }).catch(() => [])),
    );
  } else {
    for (const realm of params.scope.realms)
      heroic.push(...(await rio.raidRankings({ raid: tier.raidSlug, difficulty: "heroic", region: "us", realm }).catch(() => [])));
  }
  const heroicOnly = heroic.filter((e) => !guildSets.mythicRanked.has(e.guild.name.toLowerCase()));
  let gi = 0;
  for (const e of heroicOnly) {
    checkStop();
    job.state.current = `${e.guild.name} (${++gi}/${heroicOnly.length})`;
    const roster = await rio.guildRoster("us", e.guild.realm.slug, e.guild.name).catch(() => [] as rio.RioRosterMember[]);
    for (const m of roster) {
      const killed = m.raidProgress?.raid.slug === tier.raidSlug ? (m.raidProgress.progress.mythic ?? 0) : 0;
      if (killed <= 0) continue;
      const f = newFound(found, m.character.realm.slug, m.character.name);
      f.sources.add("roster");
      f.rioKilled = Math.max(f.rioKilled ?? 0, killed);
    }
  }

  // 3) tira quem já está num raid team escaneado e quem só aparece em logs de guildas míticas fora do escopo
  const inTeams = new Set(
    (
      db()
        .prepare("select distinct gm.char_id from guild_members gm join guilds g on g.id = gm.guild_id where g.raid_slug = ?")
        .all(tier.raidSlug) as { char_id: string }[]
    ).map((r) => r.char_id),
  );
  const unscannedMythic = (g: string) => guildSets.mythicRanked.has(g.toLowerCase()) && !guildSets.scanned.has(g.toLowerCase());
  const list = [...found.values()]
    .filter((f) => !inTeams.has(f.id))
    .filter((f) => f.sources.has("roster") || f.noGuildKills > 0 || [...f.logGuilds].some((g) => !unscannedMythic(g)))
    .sort((a, b) => Math.max(b.bosses.size, b.rioKilled ?? 0) - Math.max(a.bosses.size, a.rioKilled ?? 0))
    .slice(0, params.maxStandalone);
  log("info", `Avulsos: ${list.length} jogadores (de ${found.size} encontrados fora dos raid teams)`);

  saveStandalone(list, tier);
  job.state.phase = "Avulsos: perfis e parses";
  let done = 0;
  await enrichCharacters(list, tier, params, useWcl, new Map(), () => {
    job.state.current = `${++done}/${list.length}`;
  });
}

function saveStandalone(list: Found[], tier: TierInfo) {
  const d = db();
  const get = d.prepare("select * from standalone where char_id = ? and raid_slug = ?");
  const put = d.prepare(
    `insert into standalone(char_id, raid_slug, sources, log_guilds, bosses, rio_killed, kill_times, reports, last_kill, found_at)
     values(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict(char_id, raid_slug) do update set sources = excluded.sources, log_guilds = excluded.log_guilds, bosses = excluded.bosses,
       rio_killed = excluded.rio_killed, kill_times = excluded.kill_times, reports = excluded.reports, last_kill = excluded.last_kill,
       found_at = excluded.found_at`,
  );
  const merge = <T>(a: string | null | undefined, b: Iterable<T>): T[] => [...new Set([...((a ? JSON.parse(a) : []) as T[]), ...b])];
  d.transaction(() => {
    for (const f of list) {
      const prev = get.get(f.id, tier.raidSlug) as Record<string, string | null> | undefined;
      const times = merge<number>(prev?.kill_times, f.killTimes);
      put.run(
        f.id,
        tier.raidSlug,
        JSON.stringify(merge(prev?.sources, f.sources)),
        JSON.stringify(merge(prev?.log_guilds, [...f.logGuilds, ...(f.noGuildKills > 0 ? [NO_GUILD_LABEL] : [])])),
        JSON.stringify(merge(prev?.bosses, f.bosses)),
        Math.max(f.rioKilled ?? 0, Number(prev?.rio_killed ?? 0)) || null,
        JSON.stringify(times.slice(-300)),
        JSON.stringify(merge(prev?.reports, f.reports)),
        times.length ? Math.max(...times) : null,
        Date.now(),
      );
    }
  })();
}

const NO_GUILD_LABEL = "sem guilda";

/** Importa um log (público ou não listado) e adiciona quem lutou contra bosses nele como avulso. */
export async function importReportLink(input: string) {
  const code = input.match(/reports\/([A-Za-z0-9]{16})/)?.[1] ?? input.trim().match(/^[A-Za-z0-9]{16}$/)?.[0];
  if (!code) throw new Error("Link inválido: cole um link de report da Warcraft Logs (…/reports/XXXXXXXXXXXXXXXX)");
  if (!wcl.wclConfigured()) throw new Error("Configure a chave da Warcraft Logs em Configurações › Chaves de API para importar logs");
  const tier = await loadTier();
  const rep = await wcl.importReport(code);
  if (!rep) throw new Error("Report não encontrado. A API só lê logs públicos e não listados — privados ficam de fora.");
  const serverMap = await wcl.serverSlugMap();
  const mythic = rep.detail.fights.filter((f) => f.difficulty === 5);
  const fights = mythic.length ? mythic : rep.detail.fights;
  const inRaid = (id: number) => !tier.wclEncounterIds.length || tier.wclEncounterIds.includes(id);
  const found = new Map<string, Found>();
  for (const p of rep.detail.players) {
    const mine = fights.filter((f) => f.friendlyPlayers.includes(p.id));
    if (!mine.length) continue;
    const f = newFound(found, wcl.slugifyServer(p.server, serverMap), p.name);
    f.sources.add("report");
    f.reports.add(code);
    if (rep.guild) f.logGuilds.add(rep.guild.name);
    for (const x of mine) if (x.kill && x.difficulty === 5 && inRaid(x.encounterID)) f.bosses.add(x.encounterID);
    f.killTimes.push(rep.startTime);
  }
  const list = [...found.values()];
  saveStandalone(list, tier);
  await enrichCharacters(list, tier, { ...DEFAULT_SCAN }, true);
  return { title: rep.title, visibility: rep.visibility, players: list.length, mythic: mythic.length > 0 };
}
