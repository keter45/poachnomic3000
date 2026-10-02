import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import type { RioAccountCharacter } from "@/lib/raiderio";
import { characterGuildHistory, wclConfigured } from "@/lib/wcl";

/**
 * Histórico de guildas de um personagem: linha do tempo pelos logs da WCL + trocas vistas pelo app.
 * ?id=us/realm/nome  ·  &alts=1 inclui até 4 alts relevantes da mesma conta (custa pontos da WCL).
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const withAlts = req.nextUrl.searchParams.get("alts") === "1";
  const [, realm, name] = id.split("/");
  if (!realm || !name) return Response.json({ error: "id inválido" }, { status: 400 });

  const d = db();
  const row = d.prepare("select name, realm_slug, rio_user from characters where id = ?").get(id) as
    | { name: string; realm_slug: string; rio_user: string | null }
    | undefined;
  const chars: { id: string; name: string; realm: string }[] = [{ id, name: row?.name ?? name, realm: row?.realm_slug ?? realm }];

  if (withAlts && row?.rio_user) {
    const acc = d.prepare("select characters from accounts where rio_user = ?").get(row.rio_user) as { characters: string | null } | undefined;
    const roster = (acc?.characters ? JSON.parse(acc.characters) : []) as RioAccountCharacter[];
    const alts = roster
      .filter((c) => !(c.name.toLowerCase() === chars[0].name.toLowerCase() && c.realm === chars[0].realm))
      .filter((c) => c.mythic > 0 || c.mplus > 1500)
      .sort((a, b) => b.mythic - a.mythic || b.ilvl - a.ilvl)
      .slice(0, 4);
    for (const a of alts) chars.push({ id: `us/${a.realm}/${a.name.toLowerCase()}`, name: a.name, realm: a.realm });
  }

  const result = [];
  for (const c of chars) {
    const stints = wclConfigured() ? await characterGuildHistory(c.name, c.realm).catch(() => null) : null;
    result.push({ ...c, stints });
  }
  const snapshots = (
    d.prepare("select guild, seen_at from guild_snapshots where char_id = ? order by seen_at").all(id) as { guild: string | null; seen_at: number }[]
  ).map((s) => ({ guild: s.guild, seenAt: s.seen_at }));

  return Response.json({ characters: result, snapshots, wcl: wclConfigured() });
}
