"use client";

import { ArrowDown, ArrowUp, Star } from "lucide-react";
import { useState } from "react";
import type { ScorePart } from "@/lib/score";
import type { ScoreWeights } from "@/lib/types";
import { CLASS_COLOR, fmtInt, parseTier, tenureLabel } from "@/lib/wow";
import type { Row, SortKey } from "./filters";

const PAGE = 150;

const COLS: { key: SortKey | null; label: string; hint?: string; align?: "right" }[] = [
  { key: "name", label: "Personagem" },
  { key: null, label: "Raida em" },
  { key: "score", label: "Score", align: "right" },
  { key: "logs", label: "Logs", hint: "Parse médio (melhor por boss) no mítico do tier", align: "right" },
  { key: "progress", label: "Míticos", hint: "Bosses míticos do tier mortos", align: "right" },
  { key: "mplus", label: "M+", hint: "Score de Mítica+ da season", align: "right" },
  { key: "schedule", label: "Horário", hint: "Compatibilidade com o nosso horário de raid", align: "right" },
  { key: "nights", label: "Presença", hint: "Noites míticas logadas com a guilda no tier", align: "right" },
  { key: "tenure", label: "Na guilda", hint: "Desde o primeiro boss com a guilda nos logs" },
  { key: null, label: "Contato" },
];

export function CandidateTable({
  rows,
  sort,
  onSort,
  onOpen,
  onToggleTarget,
  weights,
  totalBosses,
}: {
  rows: Row[];
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (key: SortKey) => void;
  onOpen: (id: string) => void;
  onToggleTarget: (row: Row) => void;
  weights: ScoreWeights;
  totalBosses: number;
}) {
  const [limit, setLimit] = useState(PAGE);
  const visible = rows.slice(0, limit);

  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th scope="col" className="w-10 px-2 py-2">
                <span className="sr-only">Alvo</span>
              </th>
              {COLS.map((col) => (
                <th
                  key={col.label}
                  scope="col"
                  title={col.hint}
                  aria-sort={col.key && sort.key === col.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                  className={`px-2 py-2 font-medium ${col.align === "right" ? "text-right" : ""}`}
                >
                  {col.key ? (
                    <button
                      type="button"
                      onClick={() => onSort(col.key as SortKey)}
                      className={`inline-flex items-center gap-1 rounded hover:text-text ${sort.key === col.key ? "text-text" : ""}`}
                    >
                      {col.label}
                      {sort.key === col.key &&
                        (sort.dir === "asc" ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)}
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <CandidateRow
                key={row.c.id}
                row={row}
                onOpen={onOpen}
                onToggleTarget={onToggleTarget}
                weights={weights}
                totalBosses={totalBosses}
              />
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <div className="flex items-center justify-between border-t border-line px-3 py-2 text-sm text-muted">
          <span>
            Mostrando {fmtInt(limit)} de {fmtInt(rows.length)}
          </span>
          <button
            type="button"
            onClick={() => setLimit((l) => l + PAGE)}
            className="rounded-md border border-line px-3 py-1 font-medium text-text hover:bg-surface-2"
          >
            Mostrar mais {Math.min(PAGE, rows.length - limit)}
          </button>
        </div>
      )}
    </div>
  );
}

function CandidateRow({
  row,
  onOpen,
  onToggleTarget,
  weights,
  totalBosses,
}: {
  row: Row;
  onOpen: (id: string) => void;
  onToggleTarget: (row: Row) => void;
  weights: ScoreWeights;
  totalBosses: number;
}) {
  const { c, s } = row;
  const tenure = tenureLabel(c.firstSeen, c.guildHistorySince);
  const contacts = c.socials
    ? (
        [
          ["Discord", c.socials.discord],
          ["Twitch", c.socials.twitch],
          ["X", c.socials.twitter],
          ["YouTube", c.socials.youtube],
          ["BattleTag", c.socials.battletag],
        ] as const
      ).filter(([, v]) => v)
    : [];

  return (
    <tr className="border-b border-line last:border-0 hover:bg-surface-2/60">
      <td className="px-2 py-1.5">
        <button
          type="button"
          aria-pressed={Boolean(c.target)}
          aria-label={c.target ? `Remover ${c.name} dos alvos` : `Marcar ${c.name} como alvo`}
          onClick={() => onToggleTarget(row)}
          className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text aria-pressed:text-warn"
        >
          <Star size={16} fill={c.target ? "currentColor" : "none"} aria-hidden />
        </button>
      </td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-2.5">
          {c.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.thumbnail} alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-md bg-surface-2 outline outline-1 -outline-offset-1 outline-black/10" loading="lazy" />
          ) : (
            <span className="h-8 w-8 shrink-0 rounded-md bg-surface-2" aria-hidden />
          )}
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => onOpen(c.id)}
              className="block max-w-[14rem] truncate text-left font-medium hover:underline"
              title={`${c.name}-${c.realmName ?? c.realmSlug}`}
            >
              {c.name}
            </button>
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <span className="h-2 w-2 shrink-0 rounded-full ring-1 ring-line" style={{ background: CLASS_COLOR[c.class ?? ""] ?? "var(--line)" }} aria-hidden />
              <span className="truncate">
                {[c.spec, c.class].filter(Boolean).join(" ")} · {c.realmName ?? c.realmSlug}
              </span>
            </div>
          </div>
        </div>
      </td>
      <td className="px-2 py-1.5">
        <div className="max-w-[13rem] truncate font-medium" title={c.guildName}>
          {c.guildName}
        </div>
        <div className="text-xs text-muted">
          {c.guildProgress ?? "?"}/{totalBosses}M · #{row.guildPos} de {row.guildSize}
          {!c.inRoster && <span className="ml-1.5 rounded bg-accent-soft px-1 py-px text-[11px] font-medium text-text">de fora</span>}
          {c.recruiting && <span className="ml-1.5 rounded bg-accent-soft px-1 py-px text-[11px] font-medium text-text">procurando</span>}
        </div>
      </td>
      <td className="px-2 py-1.5 text-right">
        <div className="text-base font-semibold tabular">{s.total ?? "—"}</div>
        <ScoreBar parts={s.parts} weights={weights} />
      </td>
      <td className="px-2 py-1.5 text-right tabular">
        {c.wcl?.hidden ? (
          <span className="text-xs text-muted">oculto</span>
        ) : (
          <span className={`font-semibold parse-${parseTier(s.parts.logs)}`}>{s.parts.logs ?? "—"}</span>
        )}
      </td>
      <td className="px-2 py-1.5 text-right tabular">
        {c.mythicKilled ?? "—"}
        <span className="text-muted">/{totalBosses}</span>
      </td>
      <td className="px-2 py-1.5 text-right tabular">{fmtInt(c.mplusScore)}</td>
      <td className="px-2 py-1.5 text-right tabular">{s.parts.schedule === null ? "—" : `${s.parts.schedule}%`}</td>
      <td className="px-2 py-1.5 text-right tabular">
        {c.guildLogsSource === "wcl" && c.guildMythicNights ? (
          <>
            {c.nights}
            <span className="text-muted">/{c.guildMythicNights}</span>
          </>
        ) : (
          <span className="text-xs text-muted">sem logs</span>
        )}
      </td>
      <td className="px-2 py-1.5 tabular" title={tenure?.long}>
        {tenure?.short ?? "—"}
      </td>
      <td className="px-2 py-1.5">
        {contacts.length ? (
          <div className="flex flex-wrap gap-1">
            {contacts.map(([label]) => (
              <span key={label} className="rounded border border-line px-1.5 py-px text-[11px] font-medium">
                {label}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted">—</span>
        )}
      </td>
    </tr>
  );
}

const PART_ORDER: ScorePart[] = ["logs", "progress", "mplus", "schedule"];
const PART_SHADE: Record<ScorePart, string> = {
  logs: "100%",
  progress: "75%",
  mplus: "50%",
  schedule: "30%",
};

/** Barra com a contribuição de cada parte (largura = peso × valor). */
function ScoreBar({ parts, weights }: { parts: Record<ScorePart, number | null>; weights: ScoreWeights }) {
  const wsum = PART_ORDER.reduce((a, k) => a + (parts[k] === null ? 0 : weights[k]), 0) || 1;
  return (
    <div className="ml-auto mt-1 flex h-1.5 w-20 overflow-hidden rounded-full bg-surface-2" aria-hidden>
      {PART_ORDER.map((k) =>
        parts[k] === null ? null : (
          <span
            key={k}
            style={{
              width: `${((parts[k] as number) * weights[k]) / wsum}%`,
              background: `color-mix(in oklab, var(--accent) ${PART_SHADE[k]}, var(--surface-2))`,
            }}
          />
        ),
      )}
    </div>
  );
}
