import { nightsToSlots, scheduleCompat, toLocal } from "./schedule";
import type { Candidate, ScoreWeights, Settings, TierInfo } from "./types";

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

export function scoreCandidate(c: Candidate, settings: Settings, tier: TierInfo | null): ScoreResult {
  const parts: Record<ScorePart, number | null> = {
    logs: c.wcl && !c.wcl.hidden && c.wcl.bestAvg !== null ? Math.round(c.wcl.bestAvg) : null,
    progress: c.mythicKilled !== null && tier ? Math.round((c.mythicKilled / tier.totalBosses) * 100) : null,
    mplus: mplusNorm(c.mplusScore, tier?.cutoffs ?? null),
    schedule: c.activity ? scheduleCompat(toLocal(c.activity, settings.tzOffset), nightsToSlots(settings.ourNights)) : null,
  };
  const w = settings.weights;
  let sum = 0;
  let wsum = 0;
  let wall = 0;
  for (const k of Object.keys(parts) as ScorePart[]) {
    wall += w[k];
    if (parts[k] === null) continue;
    sum += (parts[k] as number) * w[k];
    wsum += w[k];
  }
  return { total: wsum > 0 ? Math.round(sum / wsum) : null, parts, coverage: wall > 0 ? wsum / wall : 0 };
}

export const PART_LABEL: Record<ScorePart, string> = {
  logs: "Logs",
  progress: "Progressão",
  mplus: "Mítica+",
  schedule: "Horário",
};
