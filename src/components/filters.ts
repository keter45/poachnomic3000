import type { ScoreResult } from "@/lib/score";
import type { Candidate } from "@/lib/types";

export interface Filters {
  q: string;
  classes: string[];
  roles: string[];
  minScore: number;
  minLogs: number;
  minProgress: number;
  minMplus: number;
  minSchedule: number;
  minHistory: number;
  onlyCE: boolean;
  realms: string[];
  guild: string;
  onlySocials: boolean;
  onlyOutsideRoster: boolean;
  onlyRecruiting: boolean;
  hideAlts: boolean;
  view: "all" | "guild" | "standalone" | "targets";
}

export const DEFAULT_FILTERS: Filters = {
  q: "",
  classes: [],
  roles: [],
  minScore: 0,
  minLogs: 0,
  minProgress: 0,
  minMplus: 0,
  minSchedule: 0,
  minHistory: 0,
  onlyCE: false,
  realms: [],
  guild: "",
  onlySocials: false,
  onlyOutsideRoster: false,
  onlyRecruiting: false,
  hideAlts: true,
  view: "all",
};

export function activeFilterCount(f: Filters) {
  let n = 0;
  if (f.q) n++;
  if (f.classes.length) n++;
  if (f.roles.length) n++;
  if (f.minScore) n++;
  if (f.minLogs) n++;
  if (f.minProgress) n++;
  if (f.minMplus) n++;
  if (f.minSchedule) n++;
  if (f.minHistory) n++;
  if (f.onlyCE) n++;
  if (f.realms.length) n++;
  if (f.guild) n++;
  if (f.onlySocials) n++;
  if (f.onlyOutsideRoster) n++;
  if (f.onlyRecruiting) n++;
  return n;
}

export interface Row {
  c: Candidate;
  s: ScoreResult;
  guildPos: number;
  guildSize: number;
}

export const hasSocials = (c: Candidate) =>
  Boolean(c.socials && Object.values(c.socials).some(Boolean));

export function applyFilters(rows: Row[], f: Filters): Row[] {
  const q = f.q.trim().toLowerCase();
  const present = new Set(rows.map((r) => `${r.c.name.toLowerCase()}|${r.c.realmSlug}`));
  return rows.filter(({ c, s }) => {
    if (f.view === "targets" && !c.target) return false;
    if (f.view === "guild" && c.kind !== "guild") return false;
    if (f.view === "standalone" && c.kind !== "standalone") return false;
    if (q && !`${c.name} ${c.guildName ?? ""} ${c.rioGuild?.name ?? ""} ${c.realmName ?? ""}`.toLowerCase().includes(q)) return false;
    if (f.classes.length && !f.classes.includes(c.class ?? "")) return false;
    if (f.roles.length && !f.roles.includes(c.role ?? "")) return false;
    if (f.minScore && (s.total ?? 0) < f.minScore) return false;
    if (f.minLogs && (s.parts.logs ?? 0) < f.minLogs) return false;
    if (f.minProgress && (c.mythicKilled ?? 0) < f.minProgress) return false;
    if (f.minMplus && (c.mplusScore ?? 0) < f.minMplus) return false;
    if (f.minSchedule && (s.parts.schedule ?? 0) < f.minSchedule) return false;
    if (f.minHistory && (s.parts.history ?? 0) < f.minHistory) return false;
    if (f.onlyCE && !c.history?.some((h) => h.ce)) return false;
    if (f.realms.length && !f.realms.includes(c.guildRealm ?? c.realmName ?? "")) return false;
    if (f.guild && c.guildId !== f.guild) return false;
    if (f.onlySocials && !hasSocials(c)) return false;
    if (f.onlyOutsideRoster && (c.kind !== "guild" || c.inRoster)) return false;
    if (f.onlyRecruiting && !c.recruiting) return false;
    if (f.hideAlts && c.main) {
      const isSelf = c.main.name.toLowerCase() === c.name.toLowerCase() && c.main.realm === c.realmSlug;
      // esconde o alt só se o main também está na lista
      if (!isSelf && present.has(`${c.main.name.toLowerCase()}|${c.main.realm}`)) return false;
    }
    return true;
  });
}

export type SortKey = "score" | "logs" | "progress" | "mplus" | "schedule" | "history" | "ilvl" | "nights" | "tenure" | "name";

export function sortRows(rows: Row[], key: SortKey, dir: "asc" | "desc"): Row[] {
  const val = ({ c, s }: Row): number | string | null => {
    switch (key) {
      case "score":
        return s.total;
      case "logs":
        return s.parts.logs;
      case "progress":
        return c.mythicKilled;
      case "mplus":
        return c.mplusScore;
      case "schedule":
        return s.parts.schedule;
      case "history":
        return s.parts.history;
      case "ilvl":
        return c.ilvl;
      case "nights":
        return c.guildMythicNights ? c.nights / c.guildMythicNights : null;
      case "tenure":
        return c.firstSeen ? -c.firstSeen : null;
      case "name":
        return c.name.toLowerCase();
    }
  };
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    // vazios sempre no fim
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return (va < vb ? -1 : va > vb ? 1 : 0) * mul;
  });
}
