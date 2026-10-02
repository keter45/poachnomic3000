import { attendancePct, type ScoreResult, tenureMonths } from "@/lib/score";
import type { Candidate } from "@/lib/types";

export interface Filters {
  q: string;
  classes: string[];
  roles: string[];
  /** faixas [mín, máx]; máx null = sem limite. Faixa ausente = filtro desligado */
  ranges: Partial<Record<RangeKey, [number, number | null]>>;
  onlyCE: boolean;
  realms: string[];
  guild: string;
  onlySocials: boolean;
  onlyOutsideRoster: boolean;
  onlyRecruiting: boolean;
  /** uma linha por conta (o personagem de maior score); filtros de classe olham a conta toda */
  groupAccounts: boolean;
  view: "all" | "guild" | "standalone" | "targets";
}

export const DEFAULT_FILTERS: Filters = {
  q: "",
  classes: [],
  roles: [],
  ranges: {},
  onlyCE: false,
  realms: [],
  guild: "",
  onlySocials: false,
  onlyOutsideRoster: false,
  onlyRecruiting: false,
  groupAccounts: true,
  view: "all",
};

export function activeFilterCount(f: Filters) {
  let n = 0;
  if (f.q) n++;
  if (f.classes.length) n++;
  if (f.roles.length) n++;
  n += Object.values(f.ranges ?? {}).filter((r) => r && (r[0] > 0 || r[1] !== null)).length;
  if (f.onlyCE) n++;
  if (f.realms.length) n++;
  if (f.guild) n++;
  if (f.onlySocials) n++;
  if (f.onlyOutsideRoster) n++;
  if (f.onlyRecruiting) n++;
  return n;
}

export type RangeKey = "score" | "logs" | "progress" | "mplus" | "history" | "attendance" | "schedule" | "tenure";

/** Valor de cada faixa filtrável (em unidades da própria métrica: %, bosses, score de M+, meses…). */
export function rangeValue(key: RangeKey, c: Candidate, s: ScoreResult): number | null {
  switch (key) {
    case "score":
      return s.total;
    case "logs":
      return s.parts.logs;
    case "progress":
      return c.mythicKilled === null && !c.account ? null : Math.max(c.mythicKilled ?? 0, c.account?.bestMythic ?? 0);
    case "mplus":
      return c.mplusScore === null && !c.account ? null : Math.max(c.mplusScore ?? 0, c.account?.bestMplus ?? 0);
    case "history":
      return s.parts.history;
    case "attendance":
      return attendancePct(c);
    case "schedule":
      return s.parts.schedule;
    case "tenure": {
      const m = tenureMonths(c);
      return m === null ? null : Math.floor(m);
    }
  }
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
  return rows.filter(({ c, s }) => {
    if (f.view === "targets" && !c.target) return false;
    if (f.view === "guild" && c.kind !== "guild") return false;
    if (f.view === "standalone" && c.kind !== "standalone") return false;
    if (q && !`${c.name} ${c.guildName ?? ""} ${c.rioGuild?.name ?? ""} ${c.realmName ?? ""}`.toLowerCase().includes(q)) return false;
    if (f.classes.length) {
      const plays = f.groupAccounts && c.account ? [c.class ?? "", ...c.account.classes] : [c.class ?? ""];
      if (!plays.some((cl) => f.classes.includes(cl))) return false;
    }
    if (f.roles.length && !f.roles.includes(c.role ?? "")) return false;
    for (const [key, range] of Object.entries(f.ranges ?? {}) as [RangeKey, [number, number | null]][]) {
      if (!range || (range[0] <= 0 && range[1] === null)) continue;
      const v = rangeValue(key, c, s);
      // com a faixa ligada, quem não tem o dado fica de fora
      if (v === null || v < range[0] || (range[1] !== null && v > range[1])) return false;
    }
    if (f.onlyCE && !c.history?.some((h) => h.ce)) return false;
    if (f.realms.length && !f.realms.includes(c.guildRealm ?? c.realmName ?? "")) return false;
    if (f.guild && c.guildId !== f.guild) return false;
    if (f.onlySocials && !hasSocials(c)) return false;
    if (f.onlyOutsideRoster && (c.kind !== "guild" || c.inRoster)) return false;
    if (f.onlyRecruiting && !c.recruiting) return false;
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

/** Mantém uma linha por conta: a de maior score entre as que passaram nos filtros. */
export function groupByAccount(rows: Row[]): Row[] {
  const best = new Map<string, Row>();
  const out: Row[] = [];
  for (const r of rows) {
    const key = r.c.account?.key;
    if (!key) {
      out.push(r);
      continue;
    }
    const cur = best.get(key);
    if (!cur || (r.s.total ?? -1) > (cur.s.total ?? -1)) best.set(key, r);
  }
  return [...out, ...best.values()];
}
