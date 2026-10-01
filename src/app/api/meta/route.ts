import { guildCount } from "@/lib/candidates";
import { getSetting } from "@/lib/db";
import { loadTier } from "@/lib/scanner";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/types";
import { refreshBudget, wclBudget, wclConfigured } from "@/lib/wcl";

export async function GET() {
  let tier = null;
  let error: string | null = null;
  try {
    tier = await loadTier();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  let budget = wclBudget() ?? null;
  if (!budget && wclConfigured()) budget = (await refreshBudget().catch(() => undefined)) ?? null;
  return Response.json({
    tier,
    error,
    wclConfigured: wclConfigured(),
    budget,
    guilds: guildCount(),
    settings: { ...DEFAULT_SETTINGS, ...getSetting<Partial<Settings>>("settings", {}) },
  });
}
