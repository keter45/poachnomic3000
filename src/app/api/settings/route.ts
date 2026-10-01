import { writeSettings } from "@/lib/settings";
import type { Settings } from "@/lib/types";

export async function PUT(req: Request) {
  return Response.json(writeSettings((await req.json()) as Partial<Settings>));
}
