import { importReportLink } from "@/lib/scanner";

/** Importa um log da WCL (público ou não listado) pelo link: { url } */
export async function POST(req: Request) {
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  try {
    return Response.json(await importReportLink(url ?? ""));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
