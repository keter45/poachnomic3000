"use client";

import { PART_LABEL, type ScorePart } from "@/lib/score";
import type { ScoreWeights } from "@/lib/types";
import { CLASS_COLOR, CLASS_PT, CLASSES, ROLES } from "@/lib/wow";
import { activeFilterCount, DEFAULT_FILTERS, type Filters, type RangeKey } from "./filters";

export function FilterPanel({
  filters,
  onChange,
  weights,
  onWeights,
  realms,
  guilds,
  totalBosses,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  weights: ScoreWeights;
  onWeights: (w: ScoreWeights) => void;
  realms: string[];
  guilds: { id: string; label: string }[];
  totalBosses: number;
}) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v });
  const setRange = (k: RangeKey, r: [number, number | null] | undefined) => {
    const ranges = { ...filters.ranges };
    if (r && (r[0] > 0 || r[1] !== null)) ranges[k] = r;
    else delete ranges[k];
    onChange({ ...filters, ranges });
  };
  const toggle = (k: "classes" | "roles" | "realms", v: string) =>
    set(k, filters[k].includes(v) ? filters[k].filter((x) => x !== v) : [...filters[k], v]);
  const active = activeFilterCount(filters);

  return (
    <div className="space-y-6 text-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Filtros</h2>
        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_FILTERS, view: filters.view })}
          disabled={active === 0}
          className="rounded px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40 disabled:hover:bg-transparent"
        >
          Limpar{active ? ` (${active})` : ""}
        </button>
      </div>

      <label className="block space-y-1.5">
        <span className="font-medium">Buscar</span>
        <input
          type="search"
          value={filters.q}
          onChange={(e) => set("q", e.target.value)}
          placeholder="Personagem, guilda ou realm"
          className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 placeholder:text-muted"
        />
      </label>

      <fieldset className="space-y-2">
        <legend className="mb-2 font-medium">Função</legend>
        <div className="flex flex-wrap gap-1.5">
          {ROLES.map((r) => (
            <ChipToggle key={r.id} pressed={filters.roles.includes(r.id)} onClick={() => toggle("roles", r.id)}>
              {r.label}
            </ChipToggle>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-medium">Classe</legend>
        <div className="grid grid-cols-1 gap-0.5">
          {CLASSES.map((c) => (
            <label key={c} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-surface-2">
              <input type="checkbox" checked={filters.classes.includes(c)} onChange={() => toggle("classes", c)} />
              <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-line" style={{ background: CLASS_COLOR[c] }} aria-hidden />
              {CLASS_PT[c]}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 font-medium">Faixas</legend>
        <RangePair label="Nosso score" range={filters.ranges.score} max={100} step={5} onChange={(r) => setRange("score", r)} />
        <RangePair label="Logs (parse médio)" range={filters.ranges.logs} max={100} step={5} onChange={(r) => setRange("logs", r)} />
        <RangePair
          label="Bosses míticos (melhor da conta)"
          range={filters.ranges.progress}
          max={totalBosses}
          format={(v) => `${v}/${totalBosses}`}
          onChange={(r) => setRange("progress", r)}
        />
        <RangePair label="Score de M+" range={filters.ranges.mplus} max={4000} step={100} onChange={(r) => setRange("mplus", r)} />
        <RangePair
          label="Histórico (tiers anteriores)"
          range={filters.ranges.history}
          max={100}
          step={5}
          onChange={(r) => setRange("history", r)}
        />
        <RangePair
          label="Presença nas noites da guilda"
          range={filters.ranges.attendance}
          max={100}
          step={5}
          format={(v) => `${v}%`}
          onChange={(r) => setRange("attendance", r)}
        />
        <RangePair
          label="Compatível com nosso horário"
          range={filters.ranges.schedule}
          max={100}
          step={5}
          format={(v) => `${v}%`}
          onChange={(r) => setRange("schedule", r)}
        />
        <RangePair
          label="Tempo na guilda"
          range={filters.ranges.tenure}
          max={24}
          format={(v) => `${v} ${v === 1 ? "mês" : "meses"}`}
          onChange={(r) => setRange("tenure", r)}
        />
      </fieldset>

      <fieldset className="space-y-1.5">
        <legend className="mb-2 font-medium">Mostrar só</legend>
        <Check checked={filters.onlyCE} onChange={(v) => set("onlyCE", v)}>
          Com Cutting Edge em algum tier anterior
        </Check>
        <Check checked={filters.onlySocials} onChange={(v) => set("onlySocials", v)}>
          Com rede social ou Discord
        </Check>
        <Check checked={filters.onlyOutsideRoster} onChange={(v) => set("onlyOutsideRoster", v)}>
          Quem raida sem ser membro da guilda
        </Check>
        <Check checked={filters.onlyRecruiting} onChange={(v) => set("onlyRecruiting", v)}>
          Procurando guilda (Raider.io)
        </Check>
        <Check checked={filters.groupAccounts} onChange={(v) => set("groupAccounts", v)}>
          Agrupar personagens da mesma conta
        </Check>
      </fieldset>

      {realms.length > 1 && (
        <fieldset>
          <legend className="mb-2 font-medium">Realm da guilda</legend>
          <div className="flex flex-wrap gap-1.5">
            {realms.map((r) => (
              <ChipToggle key={r} pressed={filters.realms.includes(r)} onClick={() => toggle("realms", r)}>
                {r}
              </ChipToggle>
            ))}
          </div>
        </fieldset>
      )}

      <label className="block space-y-1.5">
        <span className="font-medium">Guilda</span>
        <select
          value={filters.guild}
          onChange={(e) => set("guild", e.target.value)}
          className="w-full rounded-md border border-line bg-surface px-2 py-1.5"
        >
          <option value="">Todas</option>
          {guilds.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
      </label>

      <details className="group rounded-md border border-line">
        <summary className="cursor-pointer select-none px-3 py-2 font-medium">Pesos do score</summary>
        <div className="space-y-3 border-t border-line px-3 py-3">
          <p className="text-xs text-muted">
            O score é a média ponderada das partes que têm dados. Peso 0 ignora a parte.
          </p>
          {(Object.keys(weights) as ScorePart[]).map((k) => (
            <Range key={k} label={PART_LABEL[k]} value={weights[k]} max={100} step={5} onChange={(v) => onWeights({ ...weights, [k]: v })} />
          ))}
        </div>
      </details>
    </div>
  );
}

function Range({
  label,
  value,
  max,
  step = 1,
  format = String,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2">
        <span>{label}</span>
        <output className="tabular text-xs text-muted">{value ? format(value) : "qualquer"}</output>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full"
      />
    </label>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 hover:bg-surface-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
      <span>{children}</span>
    </label>
  );
}

export function ChipToggle({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        pressed ? "border-accent bg-accent text-accent-fg" : "border-line bg-surface hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Faixa com mínimo e máximo numa barra só, com duas bolinhas. São dois sliders nativos sobrepostos:
 * cada bolinha continua acessível pelo teclado e tem o próprio rótulo. Máximo no fim da escala = sem limite.
 */
function RangePair({
  label,
  range,
  max,
  step = 1,
  format = String,
  onChange,
}: {
  label: string;
  range: [number, number | null] | undefined;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (r: [number, number | null] | undefined) => void;
}) {
  const lo = range?.[0] ?? 0;
  const hi = range?.[1] ?? max;
  const summary =
    lo <= 0 && hi >= max ? "qualquer" : hi >= max ? `≥ ${format(lo)}` : lo <= 0 ? `≤ ${format(hi)}` : `${format(lo)} – ${format(hi)}`;
  const emit = (nlo: number, nhi: number) => onChange([nlo, nhi >= max ? null : nhi]);
  // posição do centro da bolinha (16px) ao longo da barra
  const at = (v: number) => `calc(${max ? v / max : 0} * (100% - 16px) + 8px)`;

  return (
    <div role="group" aria-label={label}>
      <div className="flex items-baseline justify-between gap-2">
        <span>{label}</span>
        <output className="tabular text-xs text-muted">{summary}</output>
      </div>
      <div className="dual-range mt-1">
        <span className="dual-range-track" aria-hidden />
        <span className="dual-range-fill" style={{ left: at(lo), width: `calc(${at(hi)} - ${at(lo)})` }} aria-hidden />
        <input
          type="range"
          min={0}
          max={max}
          step={step}
          value={lo}
          aria-label={`${label}: mínimo`}
          aria-valuetext={format(lo)}
          onChange={(e) => {
            const v = Number(e.target.value);
            emit(Math.min(v, hi), hi);
          }}
          // com as duas bolinhas no fim da barra, a do mínimo fica por cima para continuar arrastável
          style={{ zIndex: lo > max / 2 ? 2 : 1 }}
        />
        <input
          type="range"
          min={0}
          max={max}
          step={step}
          value={hi}
          aria-label={`${label}: máximo`}
          aria-valuetext={hi >= max ? "sem limite" : format(hi)}
          onChange={(e) => {
            const v = Number(e.target.value);
            emit(lo, Math.max(v, lo));
          }}
        />
      </div>
    </div>
  );
}
