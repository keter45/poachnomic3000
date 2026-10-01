// Tipos compartilhados entre servidor e interface.

export interface TierInfo {
  raidSlug: string;
  raidName: string;
  totalBosses: number;
  tierStart: number;
  wclZoneId: number | null;
  /** encounters da zone WCL que pertencem a este raid (a zone pode incluir bosses de outro raid) */
  wclEncounterIds: number[];
  /** raids de tier anteriores (mais recente primeiro), usados no histórico de progressão */
  historyRaids: { slug: string; name: string; total: number }[];
  seasonSlug: string | null;
  cutoffs: { p999: number; p990: number; p900: number; p750: number; p600: number } | null;
  updatedAt: number;
}

export type ScanScope = { kind: "subregion"; value: string } | { kind: "realms"; realms: string[] };

export interface ScanParams {
  scope: ScanScope;
  /** progresso mítico mínimo/máximo da guilda (bosses) */
  minBosses: number;
  maxBosses: number;
  maxGuilds: number;
  /** quantos dias de logs olhar para trás (tempo de casa) */
  historyDays: number;
  /** % mínimo de presença nas noites míticas para entrar no raid team (0–1) */
  minAttendance: number;
  fetchRankings: boolean;
  fetchSocials: boolean;
  /** procurar jogadores que fazem mítico fora de um raid team (pugs) */
  findStandalone: boolean;
  maxStandalone: number;
}

export const DEFAULT_SCAN: ScanParams = {
  scope: { kind: "subregion", value: "brazil" },
  minBosses: 1,
  maxBosses: 99,
  maxGuilds: 60,
  historyDays: 120,
  minAttendance: 0.25,
  fetchRankings: true,
  fetchSocials: true,
  findStandalone: true,
  maxStandalone: 300,
};

export type ScanStatus = "idle" | "running" | "stopping" | "done" | "stopped" | "error";

export interface ScanLogLine {
  ts: number;
  level: "info" | "warn" | "error";
  msg: string;
}

export interface ScanState {
  status: ScanStatus;
  phase: string;
  params: ScanParams | null;
  startedAt: number | null;
  finishedAt: number | null;
  guildsTotal: number;
  guildsDone: number;
  charsDone: number;
  current: string | null;
  waitingUntil: number | null;
  log: ScanLogLine[];
}

export interface Socials {
  battletag: string | null;
  twitch: string | null;
  youtube: string | null;
  twitter: string | null;
  discord: string | null;
}

export interface WclSummary {
  hidden: boolean;
  found: boolean;
  bestAvg: number | null;
  medianAvg: number | null;
  metric: string | null;
  allStarsPercent: number | null;
  spec: string | null;
  encounters: { id: number; name: string; best: number | null; median: number | null; kills: number }[];
}

/** Progressão em um raid de tier anterior. mythic é deste personagem; aotc/ce vêm da conta (conquistas). */
export interface RaidHistory {
  slug: string;
  name: string;
  total: number;
  mythic: number;
  heroic: number;
  aotc: string | null;
  ce: string | null;
}

export interface StandaloneInfo {
  /** de onde veio: "wcl" (rankings por boss), "roster" (guilda não mítica no Raider.io), "report" (log importado) */
  sources: string[];
  /** guilda dele nos kills ranqueados (WCL) ou guilda do log importado; "sem guilda" quando matou sem guilda */
  logGuilds: string[];
  bossesKilled: number;
  lastKill: number | null;
  reports: string[];
}

/** Uma linha da lista principal: personagem + guilda onde ele raida (ou avulso). */
export interface Candidate {
  id: string;
  kind: "guild" | "standalone";
  name: string;
  realmSlug: string;
  realmName: string | null;
  class: string | null;
  spec: string | null;
  role: string | null;
  ilvl: number | null;
  thumbnail: string | null;
  profileUrl: string | null;
  mplusScore: number | null;
  /** bosses míticos do tier mortos (maior valor entre WCL e Raider.io) */
  mythicKilled: number | null;
  wcl: WclSummary | null;
  socials: Socials | null;
  main: { name: string; realm: string } | null;
  bio: string | null;
  recruiting: boolean;
  /** guilda in-game segundo o Raider.io */
  rioGuild: { name: string; realm: string } | null;
  history: RaidHistory[] | null;
  standalone: StandaloneInfo | null;
  // --- vínculo com a guilda onde raida (null para avulsos) ---
  guildId: string | null;
  guildName: string | null;
  guildRealm: string | null;
  guildProgress: number | null;
  guildRegionRank: number | null;
  guildSchedule: number[] | null;
  guildLogsSource: string | null;
  guildMythicNights: number | null;
  /** início da janela de logs consultada — firstSeen perto disso significa "pelo menos desde" */
  guildHistorySince: number | null;
  guildBio: string | null;
  inRoster: boolean;
  guildRank: number | null;
  nights: number;
  kills: number;
  firstSeen: number | null;
  lastSeen: number | null;
  /** atividade (UTC) = horas nos logs + amostras de logout */
  activity: number[] | null;
  /** outras guildas onde também apareceu raidando */
  otherGuilds: string[];
  target: { status: string; note: string | null } | null;
  updatedAt: number | null;
}

export interface ScoreWeights {
  logs: number;
  progress: number;
  mplus: number;
  schedule: number;
  history: number;
}

export interface RaidNight {
  day: number; // 0 = domingo
  from: number;
  to: number;
}

export interface Settings {
  weights: ScoreWeights;
  /** nosso horário de raid, no fuso local. `to` pode passar de 24 (ex.: 25 = 01h do dia seguinte) */
  ourNights: RaidNight[];
  tzOffset: number;
}

export const DEFAULT_SETTINGS: Settings = {
  weights: { logs: 35, progress: 25, mplus: 15, schedule: 10, history: 15 },
  // padrão: Ter/Qua/Qui 20h–00h
  ourNights: [2, 3, 4].map((day) => ({ day, from: 20, to: 24 })),
  tzOffset: -3,
};
