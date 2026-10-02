import { nightsToSlots, scheduleCompat, toLocal } from "./schedule";
import type { Candidate, RaidHistory, ScoreWeights, Settings, TierInfo } from "./types";

export type ScorePart = keyof ScoreWeights;

export interface ScoreResult {
  total: number | null;
  parts: Record<ScorePart, number | null>;
  /** fração do peso total que tinha dados (0–1) */
  coverage: number;
}

/** Score de M+ → 0–100 pelos percentis da season (top 0,1% = 100). */
export function mplusNorm(score: number | null, cutoffs: TierInfo["cutoffs"]): number | null {
  if (score === null || score === undefined) return null;
  if (!cutoffs || !cutoffs.p999) return Math.min(100, (score / 3500) * 100);
  const steps: [number, number][] = [
    [0, 0],
    [cutoffs.p600, 35],
    [cutoffs.p750, 50],
    [cutoffs.p900, 70],
    [cutoffs.p990, 90],
    [cutoffs.p999, 100],
  ];
  if (score >= cutoffs.p999) return 100;
  for (let i = 1; i < steps.length; i++) {
    const [x1, y1] = steps[i];
    const [x0, y0] = steps[i - 1];
    if (score < x1) return Math.round(y0 + ((score - x0) / (x1 - x0)) * (y1 - y0));
  }
  return 100;
}

/**
 * Potencial pelo histórico (0–100): Cutting Edge vale 100; senão a fração de bosses míticos deste
 * personagem (até 90); AOTC sem mítico vale 30. Tiers mais recentes pesam mais (4, 3, 2, 1).
 */
export function historyScore(history: RaidHistory[] | null): number | null {
  if (!history?.length) return null;
  let sum = 0;
  let wsum = 0;
  history.forEach((r, i) => {
    const w = Math.max(1, 4 - i);
    const value = r.ce ? 100 : Math.max(r.total ? (r.mythic / r.total) * 90 : 0, r.aotc ? 30 : 0);
    sum += value * w;
    wsum += w;
  });
  return Math.round(sum / wsum);
}

const MONTH = 30 * 24 * 3600_000;

/** Presença (%) nas noites míticas logadas da guilda; null sem logs (avulsos, guildas que não logam). */
export function attendancePct(c: Candidate): number | null {
  if (c.kind !== "guild" || c.guildLogsSource !== "wcl" || !c.guildMythicNights) return null;
  return Math.round((Math.min(c.nights, c.guildMythicNights) / c.guildMythicNights) * 100);
}

/** Meses desde o primeiro boss com a guilda nos logs (limite inferior quando ele já aparece no log mais antigo). */
export function tenureMonths(c: Candidate): number | null {
  if (c.kind !== "guild" || !c.firstSeen) return null;
  return Math.max(0, (Date.now() - c.firstSeen) / MONTH);
}

/** Pouco tempo na guilda pontua alto (100 com menos de um mês) e cai até 0 com um ano ou mais. */
export function tenureScore(months: number | null): number | null {
  if (months === null) return null;
  return Math.max(0, Math.round(100 - (months / 12) * 100));
}

export function scoreCandidate(c: Candidate, settings: Settings, tier: TierInfo | null): ScoreResult {
  const killed = c.mythicKilled === null && !c.account ? null : Math.max(c.mythicKilled ?? 0, c.account?.bestMythic ?? 0);
  const mplus = c.mplusScore === null && !c.account ? null : Math.max(c.mplusScore ?? 0, c.account?.bestMplus ?? 0);
  const parts: Record<ScorePart, number | null> = {
    logs: c.wcl && !c.wcl.hidden && c.wcl.bestAvg !== null ? Math.round(c.wcl.bestAvg) : null,
    // progressão e M+ olham a conta inteira: um alt na lista não esconde o main 8/8
    progress: killed !== null && tier ? Math.round((killed / tier.totalBosses) * 100) : null,
    mplus: mplusNorm(mplus, tier?.cutoffs ?? null),
    schedule: c.activity ? scheduleCompat(toLocal(c.activity, settings.tzOffset), nightsToSlots(settings.ourNights)) : null,
    history: historyScore(c.history),
    attendance: attendancePct(c),
    tenure: tenureScore(tenureMonths(c)),
  };
  const w = settings.weights;
  let sum = 0;
  let wsum = 0;
  let wall = 0;
  for (const k of Object.keys(parts) as ScorePart[]) {
    const weight = w[k] ?? 0;
    wall += weight;
    if (parts[k] === null || !weight) continue;
    sum += (parts[k] as number) * weight;
    wsum += weight;
  }
  return { total: wsum > 0 ? Math.round(sum / wsum) : null, parts, coverage: wall > 0 ? wsum / wall : 0 };
}

export const PART_LABEL: Record<ScorePart, string> = {
  logs: "Logs",
  progress: "Progressão",
  mplus: "Mítica+",
  schedule: "Horário",
  history: "Histórico",
  attendance: "Presença",
  tenure: "Pouco tempo na guilda",
};
