"use client";

import { ArrowDown, ArrowUp, Star } from "lucide-react";
import { useState } from "react";
import { mplusNorm, type ScorePart } from "@/lib/score";
import type { Candidate, ScoreWeights, TierInfo } from "@/lib/types";
import { CLASS_COLOR, fmtInt, parseTier, SCALE_STEPS, tenureLabel, tone } from "@/lib/wow";
import type { Row, SortKey } from "./filters";

const PAGE = 150;

const COLS: { key: SortKey | null; label: string; hint?: string; align?: "right" }[] = [
  { key: "name", label: "Personagem" },
  { key: null, label: "Raida em" },
  { key: "score", label: "Score", align: "right" },
  { key: "logs", label: "Logs", hint: "Parse médio (melhor por boss) no mítico do tier", align: "right" },
  { key: "progress", label: "Míticos", hint: "Bosses míticos do tier mortos", align: "right" },
  { key: "mplus", label: "M+", hint: "Score de Mítica+ da season", align: "right" },
  { key: "history", label: "Histórico", hint: "Progressão nos tiers anteriores (CE = Cutting Edge na conta)", align: "right" },
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
  cutoffs,
}: {
  rows: Row[];
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (key: SortKey) => void;
  onOpen: (id: string) => void;
  onToggleTarget: (row: Row) => void;
  weights: ScoreWeights;
  totalBosses: number;
  cutoffs: TierInfo["cutoffs"];
}) {
  const [limit, setLimit] = useState(PAGE);
  const visible = rows.slice(0, limit);

  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] border-collapse text-sm">
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
                cutoffs={cutoffs}
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
  cutoffs,
}: {
  row: Row;
  onOpen: (id: string) => void;
  onToggleTarget: (row: Row) => void;
  weights: ScoreWeights;
  totalBosses: number;
  cutoffs: TierInfo["cutoffs"];
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
          className="grid h-10 w-10 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text aria-pressed:text-warn"
        >
          <Star size={16} fill={c.target ? "currentColor" : "none"} aria-hidden />
        </button>
      </td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-2.5">
          {c.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.thumbnail} alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-md bg-surface-2 outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10" loading="lazy" />
          ) : (
            <span className="h-8 w-8 shrink-0 rounded-md bg-surface-2" aria-hidden />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onOpen(c.id)}
                className="block max-w-[12rem] truncate text-left font-medium hover:underline"
                title={`${c.name}-${c.realmName ?? c.realmSlug}`}
              >
                {c.name}
              </button>
              {c.account && c.account.characters.length > 1 && (
                <span
                  className="shrink-0 rounded border border-line px-1 py-px text-[11px] font-medium text-muted"
                  title={accountTitle(c)}
                >
                  +{c.account.characters.length - 1} na conta
                </span>
              )}
            </div>
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
        {c.kind === "guild" ? (
          <>
            <div className="max-w-[13rem] truncate font-medium" title={c.guildName ?? undefined}>
              {c.guildName}
            </div>
            <div className="text-xs text-muted">
              {c.guildProgress ?? "?"}/{totalBosses}M · #{row.guildPos} de {row.guildSize}
              {!c.inRoster && <Badge>de fora</Badge>}
              {c.recruiting && <Badge>procurando</Badge>}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5 font-medium">
              Avulso
              {c.recruiting && <Badge>procurando</Badge>}
            </div>
            <div className="max-w-[13rem] truncate text-xs text-muted" title={standaloneWhere(c)}>
              {standaloneWhere(c)}
            </div>
          </>
        )}
      </td>
      <td className="px-2 py-1.5 text-right">
        <div className={`text-base font-semibold tabular ${tone(s.total)}`}>{s.total ?? "—"}</div>
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
        <span className={`font-semibold ${tone(pct(c.mythicKilled, totalBosses))}`}>{c.mythicKilled ?? "—"}</span>
        <span className="text-muted">/{totalBosses}</span>
        {c.account && c.account.bestMythic > (c.mythicKilled ?? 0) && (
          <div className="text-[11px] text-muted">
            conta <span className={`font-semibold ${tone(pct(c.account.bestMythic, totalBosses))}`}>{c.account.bestMythic}</span>
          </div>
        )}
      </td>
      <td className="px-2 py-1.5 text-right tabular">
        <span className={`font-semibold ${tone(mplusNorm(c.mplusScore, cutoffs))}`}>{fmtInt(c.mplusScore)}</span>
        {c.account && c.account.bestMplus > (c.mplusScore ?? 0) + 50 && (
          <div className="text-[11px] text-muted">
            conta <span className={`font-semibold ${tone(mplusNorm(c.account.bestMplus, cutoffs))}`}>{fmtInt(c.account.bestMplus)}</span>
          </div>
        )}
      </td>
      <td className="px-2 py-1.5 text-right tabular" title={historyTitle(c)}>
        <div className={`font-semibold ${tone(s.parts.history)}`}>{s.parts.history ?? "—"}</div>
        {ceCount(c) > 0 && <div className="text-[11px] text-muted">{ceCount(c)}× CE</div>}
      </td>
      <td className="px-2 py-1.5 text-right tabular">
        <span className={`font-semibold ${tone(s.parts.schedule)}`}>{s.parts.schedule === null ? "—" : `${s.parts.schedule}%`}</span>
      </td>
      <td className="px-2 py-1.5 text-right tabular">
        {c.kind === "standalone" ? (
          <span className="text-xs text-muted">—</span>
        ) : c.guildLogsSource === "wcl" && c.guildMythicNights ? (
          <>
            <span className={`font-semibold ${tone(s.parts.attendance)}`}>{c.nights}</span>
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

const PART_ORDER: ScorePart[] = ["logs", "progress", "history", "attendance", "mplus", "schedule", "tenure"];
const PART_SHADE: Record<ScorePart, string> = {
  logs: "100%",
  progress: "85%",
  history: "70%",
  attendance: "58%",
  mplus: "46%",
  schedule: "36%",
  tenure: "28%",
};

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="ml-1.5 rounded bg-accent-soft px-1 py-px text-[11px] font-medium text-text">{children}</span>;
}

function accountTitle(c: Candidate) {
  const a = c.account;
  if (!a) return "";
  const lines = a.characters.map((ch) => `${ch.name} (${ch.class ?? "?"}) — ${ch.mythic ?? 0}M · M+ ${fmtInt(ch.mplus)}`);
  return [`Conta ${a.label}`, ...lines].join("\n");
}

/** 0–100 a partir de x/total, para colorir progressão. */
const pct = (v: number | null, total: number) => (v === null || !total ? null : Math.round((v / total) * 100));

const ceCount = (c: Candidate) => c.history?.filter((h) => h.ce).length ?? 0;

function historyTitle(c: Candidate) {
  if (!c.history?.length) return "Sem histórico";
  return c.history
    .map((h) => `${h.name}: ${h.mythic}/${h.total}M${h.ce ? " · CE" : h.aotc ? " · AOTC" : ""}`)
    .join("\n");
}

/** "guilda X · log importado" — contexto de um avulso. */
export function standaloneWhere(c: Candidate) {
  const parts: string[] = [c.rioGuild ? `guilda: ${c.rioGuild.name}` : "sem guilda"];
  if (c.standalone?.sources.includes("report")) parts.push("log importado");
  else if (c.standalone?.sources.includes("roster")) parts.push("guilda não mítica");
  return parts.join(" · ");
}

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

/** Legenda da escala de cores (a mesma do parse da WCL) usada em todas as notas 0–100. */
export function ScaleLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted" aria-label="Escala de cores das notas">
      <span>Notas:</span>
      {SCALE_STEPS.map((st) => (
        <span key={st.tier} className="inline-flex items-center gap-1">
          <span className={`h-2 w-2 rounded-full bg-parse-${st.tier}`} aria-hidden />
          <span className={`font-medium parse-${st.tier}`}>{st.label}</span>
        </span>
      ))}
    </div>
  );
}
