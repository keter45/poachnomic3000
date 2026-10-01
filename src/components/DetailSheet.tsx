"use client";

import { Check, Copy, ExternalLink, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { nightsToSlots, toLocal } from "@/lib/schedule";
import { PART_LABEL, type ScorePart } from "@/lib/score";
import type { Settings, TierInfo } from "@/lib/types";
import {
  armoryUrl,
  CLASS_COLOR,
  contactsInBio,
  fmtInt,
  parseTier,
  rioCharUrl,
  socialLinks,
  tenureLabel,
  wclCharUrl,
} from "@/lib/wow";
import { hasSocials, type Row } from "./filters";
import { ScheduleGrid, ScheduleLegend } from "./ScheduleGrid";

const SOURCE_LABEL: Record<string, string> = {
  wcl: "rankings da Warcraft Logs",
  roster: "guilda não mítica (Raider.io)",
  report: "log importado",
};

export const TARGET_STATUS: { id: string; label: string }[] = [
  { id: "watch", label: "Observando" },
  { id: "contacted", label: "Contatado" },
  { id: "talking", label: "Conversando" },
  { id: "recruited", label: "Recrutado" },
  { id: "rejected", label: "Recusou" },
];

export function DetailSheet({
  row,
  settings,
  tier,
  onClose,
  onTarget,
}: {
  row: Row | null;
  settings: Settings;
  tier: TierInfo | null;
  onClose: () => void;
  onTarget: (charId: string, status: string | null, note?: string | null) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (row && !d.open) d.showModal();
    if (!row && d.open) d.close();
  }, [row]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby="detail-title"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {row && <Detail key={row.c.id} row={row} settings={settings} tier={tier} onClose={onClose} onTarget={onTarget} />}
    </dialog>
  );
}

function Detail({
  row,
  settings,
  tier,
  onClose,
  onTarget,
}: {
  row: Row;
  settings: Settings;
  tier: TierInfo | null;
  onClose: () => void;
  onTarget: (charId: string, status: string | null, note?: string | null) => void;
}) {
  const { c, s } = row;
  const total = tier?.totalBosses ?? 0;
  const ours = new Set(nightsToSlots(settings.ourNights));
  const tenure = tenureLabel(c.firstSeen, c.guildHistorySince);
  const links = c.socials ? socialLinks(c.socials) : [];
  const bioContacts = contactsInBio(c.bio);
  const mainIsOther = Boolean(c.main && (c.main.name.toLowerCase() !== c.name.toLowerCase() || c.main.realm !== c.realmSlug));
  const [note, setNote] = useState(c.target?.note ?? "");
  const differentGuild =
    c.rioGuild && (c.rioGuild.name.toLowerCase() !== (c.guildName ?? "").toLowerCase() || c.rioGuild.realm !== c.guildRealm);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start gap-3 border-b border-line p-4">
        {c.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.thumbnail} alt="" width={56} height={56} className="h-14 w-14 rounded-lg bg-surface-2 outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10" />
        ) : (
          <span className="h-14 w-14 rounded-lg bg-surface-2" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <h2 id="detail-title" className="text-lg font-semibold text-balance">
            {c.name}
            <span className="font-normal text-muted"> — {c.realmName ?? c.realmSlug}</span>
          </h2>
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <span className="h-2.5 w-2.5 rounded-full ring-1 ring-line" style={{ background: CLASS_COLOR[c.class ?? ""] ?? "var(--line)" }} aria-hidden />
            {[c.spec, c.class].filter(Boolean).join(" ") || "Classe desconhecida"}
            {c.ilvl ? ` · ilvl ${Math.round(c.ilvl)}` : ""}
          </p>
          <nav aria-label="Perfis externos" className="mt-2 flex flex-wrap gap-1.5 text-xs">
            <ExtLink href={wclCharUrl(c.realmSlug, c.name)}>Warcraft Logs</ExtLink>
            <ExtLink href={c.profileUrl ?? rioCharUrl(c.realmSlug, c.name)}>Raider.io</ExtLink>
            <ExtLink href={armoryUrl(c.realmSlug, c.name)}>Armory</ExtLink>
          </nav>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
        >
          <X size={18} aria-hidden />
        </button>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto p-4 text-sm">
        {/* alvo */}
        <section aria-labelledby="sec-target" className="space-y-2">
          <h3 id="sec-target" className="font-semibold">
            Acompanhamento
          </h3>
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="target-status">
              Status
            </label>
            <select
              id="target-status"
              value={c.target?.status ?? ""}
              onChange={(e) => onTarget(c.id, e.target.value || null, note || null)}
              className="rounded-md border border-line bg-surface px-2 py-1.5"
            >
              <option value="">Não é alvo</option>
              {TARGET_STATUS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <label className="block space-y-1">
            <span className="text-xs text-muted">Notas (salvas ao sair do campo)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => note !== (c.target?.note ?? "") && onTarget(c.id, c.target?.status ?? "watch", note)}
              rows={2}
              placeholder="Ex.: falei no Discord dia 02/10, quer raidar 3x por semana"
              className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 placeholder:text-muted"
            />
          </label>
        </section>

        {/* score */}
        <section aria-labelledby="sec-score" className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 id="sec-score" className="font-semibold">
              Nosso score
            </h3>
            <span className="text-2xl font-semibold tabular">{s.total ?? "—"}</span>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            {(Object.keys(s.parts) as ScorePart[]).map((k) => (
              <div key={k} className="rounded-md bg-surface-2 px-2.5 py-2">
                <dt className="text-xs text-muted">
                  {PART_LABEL[k]} <span className="tabular">· peso {settings.weights[k]}</span>
                </dt>
                <dd className="text-base font-semibold tabular">{s.parts[k] ?? "sem dados"}</dd>
              </div>
            ))}
          </dl>
          {s.coverage < 1 && (
            <p className="text-xs text-muted">
              Calculado com {Math.round(s.coverage * 100)}% do peso — as partes sem dados ficaram de fora da média.
            </p>
          )}
        </section>

        {/* avulso */}
        {c.kind === "standalone" && c.standalone && (
          <section aria-labelledby="sec-standalone" className="space-y-2">
            <h3 id="sec-standalone" className="font-semibold">
              Jogador avulso
            </h3>
            <p className="text-muted text-pretty">
              Matou bosses míticos deste tier, mas não entrou no raid team de nenhuma guilda escaneada.
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-muted">Guilda no jogo</dt>
              <dd>{c.rioGuild ? `${c.rioGuild.name} (${c.rioGuild.realm})` : "Sem guilda"}</dd>
              <dt className="text-muted">Encontrado em</dt>
              <dd>{c.standalone.sources.map((s) => SOURCE_LABEL[s] ?? s).join(" · ")}</dd>
              {c.standalone.logGuilds.length > 0 && (
                <>
                  <dt className="text-muted">Guilda nos kills</dt>
                  <dd>{c.standalone.logGuilds.join(", ")}</dd>
                </>
              )}
              {c.standalone.lastKill && (
                <>
                  <dt className="text-muted">Último kill</dt>
                  <dd>{new Date(c.standalone.lastKill).toLocaleDateString("pt-BR")}</dd>
                </>
              )}
              {c.standalone.reports.length > 0 && (
                <>
                  <dt className="text-muted">Logs importados</dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {c.standalone.reports.map((code) => (
                      <ExtLink key={code} href={`https://www.warcraftlogs.com/reports/${code}`}>
                        {code.slice(0, 6)}…
                      </ExtLink>
                    ))}
                  </dd>
                </>
              )}
            </dl>
          </section>
        )}

        {/* histórico */}
        <section aria-labelledby="sec-history" className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h3 id="sec-history" className="font-semibold">
              Histórico de raids
            </h3>
            <span className="text-xs text-muted">mítico neste personagem · conquistas da conta</span>
          </div>
          {!c.history?.length ? (
            <p className="text-muted">Sem histórico — rode um novo scan para buscar.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th scope="col" className="py-1 font-medium">
                    Raid
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Mítico
                  </th>
                  <th scope="col" className="py-1 pl-3 font-medium">
                    Conquista
                  </th>
                </tr>
              </thead>
              <tbody>
                {c.history.map((h) => (
                  <tr key={h.slug} className="border-t border-line">
                    <td className="py-1.5 pr-2">{h.name}</td>
                    <td className="py-1.5 text-right tabular">
                      {h.mythic}
                      <span className="text-muted">/{h.total}</span>
                    </td>
                    <td className="py-1.5 pl-3">
                      {h.ce ? (
                        <span className="font-medium">Cutting Edge · {new Date(h.ce).toLocaleDateString("pt-BR")}</span>
                      ) : h.aotc ? (
                        <span>AOTC</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {c.history?.some((h) => h.ce && h.mythic < h.total) && (
            <p className="text-xs text-muted">
              Tem Cutting Edge sem todos os kills neste personagem: provavelmente fez o raid com outro personagem.
            </p>
          )}
        </section>

        {/* guilda */}
        {c.kind === "guild" && (
        <section aria-labelledby="sec-guild" className="space-y-2">
          <h3 id="sec-guild" className="font-semibold">
            Onde raida
          </h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-muted">Guilda</dt>
            <dd>
              <span className="font-medium">{c.guildName}</span> ({c.guildRealm}) · {c.guildProgress ?? "?"}/{total} mítico
              {c.guildRegionRank ? ` · #${fmtInt(c.guildRegionRank)} US` : ""}
            </dd>
            <dt className="text-muted">No time</dt>
            <dd>
              #{row.guildPos} de {row.guildSize} pelo nosso score
              {c.inRoster ? (c.guildRank !== null ? ` · rank ${c.guildRank} na guilda` : "") : " · não é membro (raida de fora)"}
            </dd>
            <dt className="text-muted">Presença</dt>
            <dd>
              {c.guildLogsSource === "wcl" && c.guildMythicNights
                ? `${c.nights} de ${c.guildMythicNights} noites míticas logadas · ${c.kills} kills`
                : "A guilda não loga na Warcraft Logs — time montado pelo roster do Raider.io"}
            </dd>
            <dt className="text-muted">Na guilda</dt>
            <dd>{tenure ? `${tenure.short} — ${tenure.long}` : "Sem logs para estimar"}</dd>
            {differentGuild && c.rioGuild && (
              <>
                <dt className="text-muted">Guilda no jogo</dt>
                <dd>
                  {c.rioGuild.name} ({c.rioGuild.realm})
                </dd>
              </>
            )}
            {c.otherGuilds.length > 0 && (
              <>
                <dt className="text-muted">Também raida em</dt>
                <dd>{c.otherGuilds.join(", ")}</dd>
              </>
            )}
          </dl>
        </section>
        )}

        {/* contato */}
        <section aria-labelledby="sec-contact" className="space-y-2">
          <h3 id="sec-contact" className="font-semibold">
            Contato
          </h3>
          {!hasSocials(c) && !bioContacts.length && !mainIsOther ? (
            <p className="text-muted">Nenhuma rede social pública no perfil do Raider.io.</p>
          ) : (
            <ul className="space-y-1.5">
              {c.socials?.discord && <CopyItem label="Discord" value={c.socials.discord} />}
              {c.socials?.battletag && <CopyItem label="BattleTag" value={c.socials.battletag} />}
              {links.map((l) => (
                <li key={l.label} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-muted">{l.label}</span>
                  <a href={l.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline">
                    {l.handle}
                    <ExternalLink size={12} aria-hidden />
                    <span className="sr-only">(abre em nova aba)</span>
                  </a>
                </li>
              ))}
              {bioContacts.map((b) => (
                <li key={b} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-muted">Na bio</span>
                  <span className="font-medium">{b}</span>
                </li>
              ))}
              {c.main && mainIsOther && (
                <li className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-muted">Main</span>
                  <a
                    href={rioCharUrl(c.main.realm, c.main.name)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium hover:underline"
                  >
                    {c.main.name}-{c.main.realm}
                    <ExternalLink size={12} aria-hidden />
                    <span className="sr-only">(abre em nova aba)</span>
                  </a>
                </li>
              )}
            </ul>
          )}
          {c.bio && (
            <details className="rounded-md border border-line">
              <summary className="cursor-pointer select-none px-3 py-1.5 text-xs font-medium">Bio do Raider.io</summary>
              <p className="whitespace-pre-wrap break-words border-t border-line px-3 py-2 text-xs">{c.bio}</p>
            </details>
          )}
        </section>

        {/* parses */}
        <section aria-labelledby="sec-parses" className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h3 id="sec-parses" className="font-semibold">
              Parses míticos por boss
            </h3>
            {c.wcl?.metric && <span className="text-xs text-muted">métrica: {c.wcl.metric.toUpperCase()}</span>}
          </div>
          {c.wcl?.hidden ? (
            <p className="text-muted">Personagem com logs ocultos na Warcraft Logs.</p>
          ) : !c.wcl?.encounters.some((e) => e.kills > 0) ? (
            <p className="text-muted">Nenhum kill mítico ranqueado neste tier.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th scope="col" className="py-1 font-medium">
                    Boss
                  </th>
                  <th scope="col" className="w-2/5 py-1 font-medium">
                    Melhor
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Mediana
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Kills
                  </th>
                </tr>
              </thead>
              <tbody>
                {c.wcl.encounters
                  .filter((e) => e.kills > 0)
                  .map((e) => (
                    <tr key={e.id} className="border-t border-line">
                      <td className="py-1.5 pr-2">{e.name}</td>
                      <td className="py-1.5 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                            <span className={`block h-full bg-parse-${parseTier(e.best)}`} style={{ width: `${e.best ?? 0}%` }} />
                          </span>
                          <span className={`w-7 text-right font-semibold tabular parse-${parseTier(e.best)}`}>
                            {e.best === null ? "—" : Math.floor(e.best)}
                          </span>
                        </div>
                      </td>
                      <td className="py-1.5 text-right tabular">{e.median === null ? "—" : Math.floor(e.median)}</td>
                      <td className="py-1.5 text-right tabular">{e.kills}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </section>

        {/* horários */}
        <section aria-labelledby="sec-schedule" className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="sec-schedule" className="font-semibold">
              Horários <span className="font-normal text-muted">(UTC{settings.tzOffset >= 0 ? "+" : ""}{settings.tzOffset})</span>
            </h3>
            <ScheduleLegend />
          </div>
          <ScheduleGrid
            label="Quando ele joga"
            values={c.activity ? toLocal(c.activity, settings.tzOffset) : null}
            ours={ours}
          />
          {c.kind === "guild" && (
            <ScheduleGrid
              label={`Raids da ${c.guildName}`}
              values={c.guildSchedule && c.guildSchedule.some((v) => v > 0) ? toLocal(c.guildSchedule, settings.tzOffset) : null}
              ours={ours}
            />
          )}
          {c.kind === "standalone" && (
            <p className="text-xs text-muted">Para avulsos, o horário vem dos kills ranqueados e dos logouts vistos pelo Raider.io.</p>
          )}
          {c.kind === "guild" && c.guildLogsSource !== "wcl" && (
            <p className="text-xs text-muted">Horário da guilda estimado pelos pulls registrados no Raider.io (menos preciso que logs).</p>
          )}
          {c.guildBio && (
            <details className="rounded-md border border-line">
              <summary className="cursor-pointer select-none px-3 py-1.5 text-xs font-medium">Bio da guilda (costuma ter o horário)</summary>
              <p className="whitespace-pre-wrap break-words border-t border-line px-3 py-2 text-xs">{c.guildBio}</p>
            </details>
          )}
        </section>
      </div>
    </div>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 font-medium hover:bg-surface-2"
    >
      {children}
      <ExternalLink size={12} aria-hidden />
      <span className="sr-only">(abre em nova aba)</span>
    </a>
  );
}

function CopyItem({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <li className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-muted">{label}</span>
      <span className="font-medium">{value}</span>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted hover:bg-surface-2 hover:text-text"
      >
        {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
        <span aria-live="polite">{copied ? "Copiado" : `Copiar ${label}`}</span>
      </button>
    </li>
  );
}
