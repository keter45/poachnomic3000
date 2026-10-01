import { DAY_SHORT, describeSchedule } from "@/lib/schedule";

/**
 * Heatmap 7×24 (fuso local). As células do nosso horário recebem contorno,
 * então a sobreposição é visível sem depender só da cor.
 */
export function ScheduleGrid({
  values,
  ours,
  label,
  emptyText = "Sem dados de horário",
}: {
  values: number[] | null;
  ours: Set<number>;
  label: string;
  emptyText?: string;
}) {
  const max = values ? Math.max(...values) : 0;
  const summary = values && max > 0 ? describeSchedule(values) : null;
  return (
    <figure className="space-y-2">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted">{summary ?? emptyText}</span>
      </figcaption>
      <div
        role="img"
        aria-label={`${label}: ${summary ?? emptyText}`}
        className="grid gap-px text-[10px] text-muted"
        style={{ gridTemplateColumns: "2.25rem repeat(24, minmax(0, 1fr))" }}
      >
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="text-center tabular" aria-hidden>
            {h % 3 === 0 ? h : ""}
          </span>
        ))}
        {DAY_SHORT.map((day, d) => (
          <Row key={day} day={day} d={d} values={values} max={max} ours={ours} />
        ))}
      </div>
    </figure>
  );
}

function Row({
  day,
  d,
  values,
  max,
  ours,
}: {
  day: string;
  d: number;
  values: number[] | null;
  max: number;
  ours: Set<number>;
}) {
  return (
    <>
      <span className="pr-1 leading-4" aria-hidden>
        {day}
      </span>
      {Array.from({ length: 24 }, (_, h) => {
        const i = d * 24 + h;
        const v = values && max > 0 ? values[i] / max : 0;
        return (
          <span
            key={h}
            aria-hidden
            className="h-4 rounded-[2px]"
            style={{
              background: v > 0 ? `color-mix(in oklab, var(--accent) ${Math.round(15 + v * 85)}%, transparent)` : "var(--surface-2)",
              boxShadow: ours.has(i) ? "inset 0 0 0 1.5px var(--text)" : undefined,
            }}
          />
        );
      })}
    </>
  );
}

export function ScheduleLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-[2px]" style={{ background: "var(--accent)" }} aria-hidden />
        Mais atividade
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-[2px]" style={{ boxShadow: "inset 0 0 0 1.5px var(--text)" }} aria-hidden />
        Nosso horário de raid
      </span>
    </div>
  );
}
