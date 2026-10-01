/**
 * Horários são guardados como histograma de 168 posições (hora-da-semana em UTC:
 * índice = diaDaSemana(0=dom) * 24 + hora). A UI desloca pelo fuso escolhido.
 */
export const HOURS_IN_WEEK = 168;
const HOUR = 3600_000;

export const emptyWeek = () => new Array<number>(HOURS_IN_WEEK).fill(0);

export function hourOfWeekUtc(ts: number) {
  const d = new Date(ts);
  return d.getUTCDay() * 24 + d.getUTCHours();
}

/** Soma 1 em cada hora coberta pelo intervalo [start, end] (no máx. 10h, para ignorar logs esquecidos abertos). */
export function addSpan(week: number[], start: number, end: number) {
  const cappedEnd = Math.min(end, start + 10 * HOUR);
  for (let t = Math.floor(start / HOUR) * HOUR; t <= cappedEnd; t += HOUR) week[hourOfWeekUtc(t)] += 1;
}

export function addPoint(week: number[], ts: number) {
  week[hourOfWeekUtc(ts)] += 1;
}

/** Converte histograma UTC para o fuso local (offset em horas, ex.: -3 para Brasília). */
export function toLocal(week: number[], offsetHours: number): number[] {
  const out = emptyWeek();
  for (let i = 0; i < HOURS_IN_WEEK; i++) out[(((i + offsetHours) % HOURS_IN_WEEK) + HOURS_IN_WEEK) % HOURS_IN_WEEK] = week[i];
  return out;
}

export const DAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Resumo legível dos horários mais frequentes, ex.: "Ter/Qua/Qui 20h–00h". */
export function describeSchedule(localWeek: number[], minShare = 0.35): string | null {
  const max = Math.max(...localWeek);
  if (max <= 0) return null;
  const threshold = max * minShare;
  const days: { day: number; from: number; to: number }[] = [];
  for (let d = 0; d < 7; d++) {
    const hours = localWeek.slice(d * 24, d * 24 + 24).map((v, h) => (v >= threshold ? h : -1)).filter((h) => h >= 0);
    if (hours.length) days.push({ day: d, from: hours[0], to: hours[hours.length - 1] + 1 });
  }
  if (!days.length) return null;
  // agrupa dias com a mesma janela
  const groups = new Map<string, number[]>();
  for (const d of days) {
    const k = `${d.from}-${d.to}`;
    groups.set(k, [...(groups.get(k) ?? []), d.day]);
  }
  const fmt = (h: number) => `${String(h % 24).padStart(2, "0")}h`;
  return [...groups.entries()]
    .map(([k, ds]) => {
      const [from, to] = k.split("-").map(Number);
      return `${ds.map((d) => DAY_SHORT[d]).join("/")} ${fmt(from)}–${fmt(to)}`;
    })
    .join(" · ");
}

/** Noites de raid → horas-da-semana (fuso local). */
export function nightsToSlots(nights: { day: number; from: number; to: number }[]): number[] {
  const slots = new Set<number>();
  for (const n of nights) for (let h = n.from; h < n.to; h++) slots.add((n.day * 24 + h) % HOURS_IN_WEEK);
  return [...slots].sort((a, b) => a - b);
}

/**
 * Compatibilidade (0–100) entre a atividade do jogador e o horário da nossa raid.
 * `ourSlots` são horas-da-semana no fuso local. Retorna null se não há dados do jogador.
 */
export function scheduleCompat(localActivity: number[] | null, ourSlots: number[]): number | null {
  if (!localActivity || !ourSlots.length) return null;
  const max = Math.max(...localActivity);
  if (max <= 0) return null;
  let sum = 0;
  for (const s of ourSlots) sum += Math.min(1, localActivity[s] / (max * 0.5));
  return Math.round((sum / ourSlots.length) * 100);
}
