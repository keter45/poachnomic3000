import { cached } from "./db";
import { createLimiter, fetchJson } from "./http";
import { getKeys } from "./keys";

const BASE = "https://raider.io";
const H = 3600_000;
// com chave o Raider.io aceita bem mais requisições por minuto
const limit = createLimiter(() => (getKeys().raiderioKey ? 120 : 250));

function url(path: string, params: Record<string, string | number | undefined>) {
  const u = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") u.searchParams.set(k, String(v));
  const key = getKeys().raiderioKey;
  if (path.startsWith("/api/v1") && key) u.searchParams.set("access_key", key);
  return u.toString();
}

const get = <T>(path: string, params: Record<string, string | number | undefined> = {}) =>
  limit(() => fetchJson<T>(url(path, params)));

// ---------- static data ----------

export interface RioRaid {
  id: number;
  slug: string;
  name: string;
  short_name: string;
  starts: Record<string, string>;
  ends: Record<string, string>;
  encounters: { id: number; slug: string; name: string }[];
}

export interface RioSeason {
  slug: string;
  name: string;
  is_main_season: boolean;
  starts: Record<string, string>;
  ends: Record<string, string>;
}

/** Descobre a expansão atual tentando IDs decrescentes. */
async function staticData<T>(kind: "raiding" | "mythic-plus"): Promise<T & { expansionId: number }> {
  return cached(`rio:static2:${kind}`, 24 * H, async () => {
    for (let exp = 14; exp >= 9; exp--) {
      try {
        const data = await get<T>(`/api/v1/${kind}/static-data`, { expansion_id: exp });
        const list = data as { raids?: unknown[]; seasons?: unknown[] } | null;
        if (list && ((list.raids?.length ?? 0) > 0 || (list.seasons?.length ?? 0) > 0)) return { ...(data as T), expansionId: exp };
      } catch {
        /* expansão inexistente */
      }
    }
    throw new Error("Não consegui carregar static-data do Raider.io");
  });
}

/** Raids ativos agora na região (o "tier atual" é o de mais bosses). */
export async function currentRaids(region = "us"): Promise<RioRaid[]> {
  const { raids } = await staticData<{ raids: RioRaid[] }>("raiding");
  const now = Date.now();
  return raids
    .filter((r) => Date.parse(r.starts[region]) <= now && now < Date.parse(r.ends[region]))
    .sort((a, b) => b.encounters.length - a.encounters.length);
}

/** Raids de tier da expansão atual e da anterior, do mais recente ao mais antigo (sem eventos como o BRD). */
export async function tierRaids(region = "us"): Promise<RioRaid[]> {
  const { raids: current, expansionId } = await staticData<{ raids: RioRaid[] }>("raiding");
  const previous = await cached(`rio:static:raiding:${expansionId - 1}`, 24 * H, async () => {
    const data = await get<{ raids: RioRaid[] }>("/api/v1/raiding/static-data", { expansion_id: expansionId - 1 }).catch(() => null);
    return data?.raids ?? [];
  });
  const all = [...current, ...previous].filter((r) => r.encounters.length >= 4);
  const start = (r: RioRaid) => Date.parse(r.starts[region]);
  const end = (r: RioRaid) => Date.parse(r.ends[region]);
  // um evento (ex.: BRD) cabe inteiro na janela de outro raid que começou antes
  return all
    .filter((r) => !all.some((o) => o !== r && start(o) < start(r) && end(r) <= end(o)))
    .sort((a, b) => start(b) - start(a));
}

export async function currentSeason(region = "us"): Promise<RioSeason | undefined> {
  const { seasons } = await staticData<{ seasons: RioSeason[] }>("mythic-plus");
  const now = Date.now();
  return seasons.find(
    (s) => s.is_main_season && Date.parse(s.starts[region]) <= now && now < Date.parse(s.ends[region]),
  );
}

export interface MplusCutoffs {
  p999: number;
  p990: number;
  p900: number;
  p750: number;
  p600: number;
}

export async function mplusCutoffs(season: string, region = "us"): Promise<MplusCutoffs | null> {
  return cached(`rio:cutoffs:${season}:${region}`, 12 * H, async () => {
    const data = await get<{ cutoffs: Record<string, { all?: { quantileMinValue: number } }> }>(
      "/api/v1/mythic-plus/season-cutoffs",
      { season, region },
    );
    if (!data?.cutoffs) return null;
    const v = (k: string) => data.cutoffs[k]?.all?.quantileMinValue ?? 0;
    return { p999: v("p999"), p990: v("p990"), p900: v("p900"), p750: v("p750"), p600: v("p600") };
  });
}

// ---------- guilds ----------

export interface RioRealm {
  slug: string;
  name: string;
}

export interface RioRaidRankingEntry {
  rank: number;
  regionRank: number;
  guild: {
    id: number;
    name: string;
    faction: string;
    realm: RioRealm;
    region: { slug: string };
    path: string;
  };
  encountersDefeated: { slug: string; firstDefeated: string; lastDefeated: string }[];
  encountersPulled?: { slug: string; numPulls: number; pullStartedAt: string; isDefeated: boolean }[];
}

/** Ranking de guildas de um raid. `region` aceita "us" ou sub-região ("brazil"). */
export async function raidRankings(opts: {
  raid: string;
  difficulty: string;
  region: string;
  realm?: string;
  maxPages?: number;
}): Promise<RioRaidRankingEntry[]> {
  const out: RioRaidRankingEntry[] = [];
  for (let page = 0; page < (opts.maxPages ?? 20); page++) {
    const data = await cached(
      `rio:raidrank:${opts.raid}:${opts.difficulty}:${opts.region}:${opts.realm ?? ""}:${page}`,
      6 * H,
      () =>
        get<{ raidRankings: RioRaidRankingEntry[] }>("/api/v1/raiding/raid-rankings", {
          raid: opts.raid,
          difficulty: opts.difficulty,
          region: opts.region,
          realm: opts.realm,
          page,
        }),
    );
    const rows = data?.raidRankings ?? [];
    out.push(...rows);
    if (rows.length < 40) break;
  }
  return out;
}

export interface RioRosterMember {
  rank: number;
  character: {
    name: string;
    class: { name: string };
    spec?: { name: string; role: string };
    itemLevelEquipped: number;
    thumbnail?: string;
    realm: RioRealm;
  };
  raidProgress?: { raid: { slug: string }; totalBosses: number; progress: { normal: number; heroic: number; mythic: number } };
  keystoneScores?: { allScore: number };
}

/** Roster com progresso no raid atual e score de M+ (endpoint interno usado pelo site). */
export async function guildRoster(region: string, realm: string, guild: string): Promise<RioRosterMember[]> {
  return cached(`rio:roster:${region}:${realm}:${guild.toLowerCase()}`, 12 * H, async () => {
    const data = await get<{ guildRoster?: { roster: RioRosterMember[] } }>("/api/guilds/roster", {
      region,
      realm,
      guild,
    });
    return data?.guildRoster?.roster ?? [];
  });
}

export interface RioGuildDetails {
  bio: string | null;
  /** timestamps (ms) de pulls/kills conhecidos — usados para estimar o horário quando não há logs */
  activityTimestamps: number[];
}

export async function guildDetails(region: string, realm: string, guild: string): Promise<RioGuildDetails> {
  return cached(`rio:guilddetails:${region}:${realm}:${guild.toLowerCase()}`, 12 * H, async () => {
    const data = await get<{
      guildDetails?: {
        guildCustomizations?: { biography?: string | null };
        raidAttempt?: { encounters?: Record<string, { pullStartedAt?: string; lastPullAt?: string }[]> }[];
        raidProgress?: { encountersDefeated?: Record<string, { firstDefeated?: string; lastDefeated?: string }[]> }[];
      };
    }>("/api/guilds/details", { region, realm, guild });
    const d = data?.guildDetails;
    const ts: number[] = [];
    const push = (s?: string) => {
      const t = s ? Date.parse(s) : NaN;
      if (Number.isFinite(t)) ts.push(t);
    };
    for (const att of d?.raidAttempt ?? [])
      for (const list of Object.values(att.encounters ?? {})) for (const e of list) {
          push(e.pullStartedAt);
          push(e.lastPullAt);
        }
    for (const p of d?.raidProgress ?? [])
      for (const list of Object.values(p.encountersDefeated ?? {})) for (const e of list) {
          push(e.firstDefeated);
          push(e.lastDefeated);
        }
    return { bio: d?.guildCustomizations?.biography ?? null, activityTimestamps: ts };
  });
}

// ---------- characters ----------

export interface RioCharacterProfile {
  name: string;
  class: string;
  active_spec_name: string;
  active_spec_role: string;
  thumbnail_url: string;
  profile_url: string;
  realm: string;
  gear?: { item_level_equipped: number };
  guild?: { name: string; realm: string } | null;
  mythic_plus_scores_by_season?: { season: string; scores: { all: number } }[];
  raid_progression?: Record<string, { mythic_bosses_killed: number; heroic_bosses_killed: number; total_bosses: number }>;
  raid_achievement_curve?: { raid: string; aotc?: string; cutting_edge?: string }[];
}

/**
 * Perfil público com progressão da expansão atual e da anterior, mais AOTC/CE dos raids pedidos.
 * AOTC/CE são conquistas da conta: aparecem mesmo que o raid tenha sido feito em outro personagem.
 */
export async function characterProfile(region: string, realm: string, name: string, curveRaids: string[] = []) {
  const curve = curveRaids.length ? `,raid_achievement_curve:${curveRaids.join(":")}` : "";
  return cached(`rio:char2:${region}:${realm}:${name.toLowerCase()}`, 12 * H, () =>
    get<RioCharacterProfile>("/api/v1/characters/profile", {
      region,
      realm,
      name,
      fields: `mythic_plus_scores_by_season:current,raid_progression:previous-expansion:current-expansion,guild,gear${curve}`,
    }),
  );
}

export interface RioCharacterSocial {
  battletag: string | null;
  twitch: string | null;
  youtube: string | null;
  twitter: string | null;
  discord: string | null;
  bio: string | null;
  main: { name: string; realm: string } | null;
  recruiting: boolean;
  loggedOutAt: number | null;
}

/** Dados do perfil público (redes sociais, main, bio) — endpoint interno do site. */
export async function characterSocial(region: string, realm: string, name: string, season?: string) {
  return cached(`rio:charsocial:${region}:${realm}:${name.toLowerCase()}`, 24 * H, async () => {
    const data = await get<{
      characterDetails?: {
        character?: { recruitmentProfiles?: unknown[] };
        characterCustomizations?: {
          bnet_battletag?: string | null;
          twitch_profile?: string;
          youtube_profile?: string;
          twitter_profile?: string;
          discord_profile?: string;
          biography?: string | null;
          main_character?: { name: string; realm: { slug: string } } | null;
        };
        meta?: { loggedOutAt?: string | null };
      };
    }>(`/api/characters/${region}/${realm}/${encodeURIComponent(name)}`, { season });
    const d = data?.characterDetails;
    if (!d) return null;
    const c = d.characterCustomizations ?? {};
    const s = (v?: string | null) => (v && v.trim() ? v.trim() : null);
    const result: RioCharacterSocial = {
      battletag: s(c.bnet_battletag),
      twitch: s(c.twitch_profile),
      youtube: s(c.youtube_profile),
      twitter: s(c.twitter_profile),
      discord: s(c.discord_profile),
      bio: s(c.biography),
      main: c.main_character ? { name: c.main_character.name, realm: c.main_character.realm.slug } : null,
      recruiting: (d.character?.recruitmentProfiles?.length ?? 0) > 0,
      loggedOutAt: d.meta?.loggedOutAt ? Date.parse(d.meta.loggedOutAt) : null,
    };
    return result;
  });
}
