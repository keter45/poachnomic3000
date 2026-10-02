import { getSetting, setSetting } from "./db";

/**
 * Chaves de API. Ficam no banco local (configuradas pela tela de Configurações);
 * as variáveis de ambiente continuam valendo como alternativa para quem roda em dev.
 */
export interface ApiKeys {
  wclClientId: string;
  wclClientSecret: string;
  raiderioKey: string;
}

export function getKeys(): ApiKeys {
  const saved = getSetting<Partial<ApiKeys>>("keys", {});
  return {
    wclClientId: saved.wclClientId || process.env.WCL_CLIENT_ID || "",
    wclClientSecret: saved.wclClientSecret || process.env.WCL_CLIENT_SECRET || "",
    raiderioKey: saved.raiderioKey || process.env.RAIDERIO_API_KEY || "",
  };
}

export function saveKeys(patch: Partial<ApiKeys>) {
  const saved = getSetting<Partial<ApiKeys>>("keys", {});
  const next = { ...saved };
  for (const [k, v] of Object.entries(patch) as [keyof ApiKeys, string | undefined][]) {
    if (v === undefined) continue;
    next[k] = v.trim();
  }
  setSetting("keys", next);
}

/** Origem da chave da WCL, para a tela saber se dá para editar. */
export function wclKeySource(): "app" | "env" | null {
  const saved = getSetting<Partial<ApiKeys>>("keys", {});
  if (saved.wclClientId && saved.wclClientSecret) return "app";
  if (process.env.WCL_CLIENT_ID && process.env.WCL_CLIENT_SECRET) return "env";
  return null;
}

/** "••••629a" — só o final, para a tela mostrar qual chave está salva sem expor o valor. */
export const hint = (v: string) => (v ? `••••${v.slice(-4)}` : null);
