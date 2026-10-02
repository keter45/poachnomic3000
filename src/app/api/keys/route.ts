import { getKeys, hint, saveKeys, wclKeySource } from "@/lib/keys";
import { resetWclAuth, testWclCredentials } from "@/lib/wcl";

function status() {
  const k = getKeys();
  return {
    wcl: { configured: Boolean(k.wclClientId && k.wclClientSecret), source: wclKeySource(), clientIdHint: hint(k.wclClientId) },
    raiderio: { configured: Boolean(k.raiderioKey), hint: hint(k.raiderioKey) },
  };
}

export async function GET() {
  return Response.json(status());
}

/**
 * Salva as chaves. A da WCL é testada antes de salvar.
 * Corpo: { wclClientId?, wclClientSecret?, raiderioKey? } — campo ausente fica como está, "" apaga.
 */
export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { wclClientId?: string; wclClientSecret?: string; raiderioKey?: string };
  if (body.wclClientId !== undefined || body.wclClientSecret !== undefined) {
    const id = (body.wclClientId ?? "").trim();
    const secret = (body.wclClientSecret ?? "").trim();
    if (id || secret) {
      if (!id || !secret) return Response.json({ error: "Preencha o Client ID e o Client Secret." }, { status: 400 });
      const problem = await testWclCredentials(id, secret);
      if (problem) return Response.json({ error: problem }, { status: 400 });
    }
    saveKeys({ wclClientId: id, wclClientSecret: secret });
    resetWclAuth();
  }
  if (body.raiderioKey !== undefined) saveKeys({ raiderioKey: body.raiderioKey });
  return Response.json(status());
}
