"use client";

import { PART_LABEL, type ScorePart } from "@/lib/score";
import type { ScoreWeights } from "@/lib/types";
import { CLASS_COLOR, CLASS_PT, CLASSES, ROLES } from "@/lib/wow";
import { activeFilterCount, DEFAULT_FILTERS, type Filters } from "./filters";

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

      <fieldset className="space-y-3">
        <legend className="mb-2 font-medium">Mínimos</legend>
        <Range label="Nosso score" value={filters.minScore} max={100} onChange={(v) => set("minScore", v)} />
        <Range label="Logs (parse médio)" value={filters.minLogs} max={100} onChange={(v) => set("minLogs", v)} />
        <Range
          label="Bosses míticos"
          value={filters.minProgress}
          max={totalBosses}
          format={(v) => `${v}/${totalBosses}`}
          onChange={(v) => set("minProgress", v)}
        />
        <Range label="Score de M+" value={filters.minMplus} max={4000} step={100} onChange={(v) => set("minMplus", v)} />
        <Range
          label="Compatível com nosso horário"
          value={filters.minSchedule}
          max={100}
          step={5}
          format={(v) => `${v}%`}
          onChange={(v) => set("minSchedule", v)}
        />
      </fieldset>

      <fieldset className="space-y-1.5">
        <legend className="mb-2 font-medium">Mostrar só</legend>
        <Check checked={filters.onlySocials} onChange={(v) => set("onlySocials", v)}>
          Com rede social ou Discord
        </Check>
        <Check checked={filters.onlyOutsideRoster} onChange={(v) => set("onlyOutsideRoster", v)}>
          Quem raida sem ser membro da guilda
        </Check>
        <Check checked={filters.onlyRecruiting} onChange={(v) => set("onlyRecruiting", v)}>
          Procurando guilda (Raider.io)
        </Check>
        <Check checked={filters.hideAlts} onChange={(v) => set("hideAlts", v)}>
          Esconder alts quando o main aparece
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
