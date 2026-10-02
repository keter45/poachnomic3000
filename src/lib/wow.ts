// Constantes do jogo e helpers de links/formatação usados pela interface.

export const CLASSES = [
  "Death Knight",
  "Demon Hunter",
  "Druid",
  "Evoker",
  "Hunter",
  "Mage",
  "Monk",
  "Paladin",
  "Priest",
  "Rogue",
  "Shaman",
  "Warlock",
  "Warrior",
] as const;

export const CLASS_PT: Record<string, string> = {
  "Death Knight": "Cavaleiro da Morte",
  "Demon Hunter": "Caçador de Demônios",
  Druid: "Druida",
  Evoker: "Conjurante",
  Hunter: "Caçador",
  Mage: "Mago",
  Monk: "Monge",
  Paladin: "Paladino",
  Priest: "Sacerdote",
  Rogue: "Ladino",
  Shaman: "Xamã",
  Warlock: "Bruxo",
  Warrior: "Guerreiro",
};

/** Cores oficiais das classes — usadas só como marcador ao lado do nome, nunca como única informação. */
export const CLASS_COLOR: Record<string, string> = {
  "Death Knight": "#C41E3A",
  "Demon Hunter": "#A330C9",
  Druid: "#FF7C0A",
  Evoker: "#33937F",
  Hunter: "#AAD372",
  Mage: "#3FC7EB",
  Monk: "#00FF98",
  Paladin: "#F48CBA",
  Priest: "#FFFFFF",
  Rogue: "#FFF468",
  Shaman: "#0070DD",
  Warlock: "#8788EE",
  Warrior: "#C69B6D",
};

export const ROLES = [
  { id: "TANK", label: "Tank" },
  { id: "HEALING", label: "Healer" },
  { id: "DPS", label: "DPS" },
] as const;

/** Faixas de cor de parse da Warcraft Logs (cinza → dourado). */
export function parseTier(p: number | null): string {
  if (p === null) return "none";
  if (p >= 100) return "gold";
  if (p >= 99) return "pink";
  if (p >= 95) return "orange";
  if (p >= 75) return "purple";
  if (p >= 50) return "blue";
  if (p >= 25) return "green";
  return "gray";
}

export const wclCharUrl = (realm: string, name: string) =>
  `https://www.warcraftlogs.com/character/us/${realm}/${encodeURIComponent(name.toLowerCase())}`;
export const armoryUrl = (realm: string, name: string) =>
  `https://worldofwarcraft.blizzard.com/pt-br/character/us/${realm}/${encodeURIComponent(name.toLowerCase())}`;
/** Só link: o WowProgress bloqueia acesso automatizado, então o app não lê o site — o usuário abre no navegador. */
export const wowprogressUrl = (realm: string, name: string) =>
  `https://www.wowprogress.com/character/us/${realm}/${encodeURIComponent(name)}`;
export const rioCharUrl = (realm: string, name: string) =>
  `https://raider.io/characters/us/${realm}/${encodeURIComponent(name)}`;

export function socialLinks(s: {
  twitch: string | null;
  youtube: string | null;
  twitter: string | null;
}): { label: string; href: string; handle: string }[] {
  const out: { label: string; href: string; handle: string }[] = [];
  const clean = (v: string) => v.replace(/^https?:\/\/[^/]+\//, "").replace(/^@/, "");
  if (s.twitch) out.push({ label: "Twitch", handle: clean(s.twitch), href: `https://twitch.tv/${clean(s.twitch)}` });
  if (s.twitter) out.push({ label: "X", handle: "@" + clean(s.twitter), href: `https://x.com/${clean(s.twitter)}` });
  if (s.youtube) {
    const v = s.youtube.replace(/^https?:\/\/[^/]+\//, "");
    out.push({ label: "YouTube", handle: v, href: `https://youtube.com/${v.startsWith("@") || v.includes("/") ? v : "@" + v}` });
  }
  return out;
}

/** Procura @handles e convites de Discord na bio do Raider.io. */
export function contactsInBio(bio: string | null): string[] {
  if (!bio) return [];
  const found = new Set<string>();
  for (const m of bio.matchAll(/(?:^|[\s(])(@[A-Za-z0-9_.]{3,30})/g)) found.add(m[1]);
  for (const m of bio.matchAll(/(discord\.gg\/[A-Za-z0-9-]+|discord\.com\/invite\/[A-Za-z0-9-]+)/gi)) found.add(m[1]);
  for (const m of bio.matchAll(/(twitch\.tv\/[A-Za-z0-9_]+|instagram\.com\/[A-Za-z0-9_.]+)/gi)) found.add(m[1]);
  return [...found];
}

const MONTH = 30 * 24 * 3600_000;

/** "4 meses", "3 semanas", "> 4 meses" quando o primeiro log coincide com o início da janela consultada. */
export function tenureLabel(firstSeen: number | null, windowStart: number | null): { short: string; long: string } | null {
  if (!firstSeen) return null;
  const atWindowEdge = windowStart !== null && firstSeen - windowStart < 10 * 24 * 3600_000;
  const ms = Date.now() - firstSeen;
  const months = ms / MONTH;
  const base =
    months >= 1
      ? `${Math.floor(months)} ${Math.floor(months) === 1 ? "mês" : "meses"}`
      : `${Math.max(1, Math.floor(ms / (7 * 24 * 3600_000)))} sem`;
  const date = new Date(firstSeen).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
  return atWindowEdge
    ? { short: `> ${base}`, long: `Já aparecia no log mais antigo consultado (${date}) — está lá há mais tempo` }
    : { short: base, long: `Primeiro boss com a guilda nos logs: ${new Date(firstSeen).toLocaleDateString("pt-BR")}` };
}

export const fmtInt = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : Math.round(n).toLocaleString("pt-BR");
