import { getSetting, setSetting } from "@/lib/db";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/types";

export async function PUT(req: Request) {
  const body = (await req.json()) as Partial<Settings>;
  const next = { ...DEFAULT_SETTINGS, ...getSetting<Partial<Settings>>("settings", {}), ...body };
  setSetting("settings", next);
  return Response.json(next);
}
