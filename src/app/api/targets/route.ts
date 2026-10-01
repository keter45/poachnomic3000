import { db } from "@/lib/db";

const STATUSES = new Set(["watch", "contacted", "talking", "recruited", "rejected"]);

/** Marca/atualiza um alvo: { charId, status, note } — status null remove. */
export async function PUT(req: Request) {
  const { charId, status, note } = (await req.json()) as { charId: string; status: string | null; note?: string | null };
  if (!charId) return Response.json({ error: "charId obrigatório" }, { status: 400 });
  if (status === null) {
    db().prepare("delete from targets where char_id = ?").run(charId);
    return Response.json({ ok: true });
  }
  if (!STATUSES.has(status)) return Response.json({ error: "status inválido" }, { status: 400 });
  db()
    .prepare(
      `insert into targets(char_id, status, note, updated_at) values(?, ?, ?, ?)
       on conflict(char_id) do update set status = excluded.status, note = coalesce(excluded.note, targets.note), updated_at = excluded.updated_at`,
    )
    .run(charId, status, note ?? null, Date.now());
  return Response.json({ ok: true });
}
