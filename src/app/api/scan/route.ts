import { scanState, startScan, stopScan } from "@/lib/scanner";
import { DEFAULT_SCAN, type ScanParams } from "@/lib/types";
import { wclBudget } from "@/lib/wcl";

export async function GET() {
  return Response.json({ ...scanState(), budget: wclBudget() ?? null });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<ScanParams>;
  const params: ScanParams = { ...DEFAULT_SCAN, ...body };
  try {
    startScan(params);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 409 });
  }
  return Response.json(scanState());
}

export async function DELETE() {
  stopScan();
  return Response.json(scanState());
}
