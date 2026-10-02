"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { AccountSummary } from "@/lib/types";
import { CLASS_COLOR, CLASS_PT, fmtInt, tone } from "@/lib/wow";

/** Personagens da mesma conta do jogador, com progressão e M+ de cada um. */
export function AccountSection({
  account,
  currentId,
  totalBosses,
  onOpen,
}: {
  account: AccountSummary;
  currentId: string;
  totalBosses: number;
  onOpen: (id: string) => void;
}) {
  return (
    <section aria-labelledby="sec-account" className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="sec-account" className="font-semibold">
          Conta do jogador
        </h3>
        <span className="text-xs text-muted">ligada por {account.linkedBy.join(", ") || "—"}</span>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        <Stat label="Melhor mítico" value={`${account.bestMythic}/${totalBosses}`} toneClass={tone(totalBosses ? (account.bestMythic / totalBosses) * 100 : null)} />
        <Stat label="Melhor M+" value={fmtInt(account.bestMplus)} />
        <Stat label="Classes" value={String(account.classes.length || "—")} />
      </dl>
      {account.classes.length > 0 && (
        <p className="text-xs text-muted">Joga em nível alto: {account.classes.map((c) => CLASS_PT[c] ?? c).join(", ")}</p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th scope="col" className="py-1 font-medium">
              Personagem
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              ilvl
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              Mítico
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              M+
            </th>
          </tr>
        </thead>
        <tbody>
          {account.characters.map((ch) => {
            const current = ch.id === currentId;
            return (
              <tr key={ch.id} className="border-t border-line">
                <td className="py-1.5 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full ring-1 ring-line"
                      style={{ background: CLASS_COLOR[ch.class ?? ""] ?? "var(--line)" }}
                      aria-hidden
                    />
                    {ch.listed && !current ? (
                      <button type="button" onClick={() => onOpen(ch.id)} className="font-medium hover:underline">
                        {ch.name}
                      </button>
                    ) : (
                      <span className={current ? "font-semibold" : ""}>{ch.name}</span>
                    )}
                    <span className="truncate text-xs text-muted">
                      {[ch.spec, ch.class].filter(Boolean).join(" ")} · {ch.realmName ?? ch.realm}
                    </span>
                    {current && <span className="rounded bg-accent-soft px-1 py-px text-[11px] font-medium">este</span>}
                    {ch.listed && !current && <span className="rounded border border-line px-1 py-px text-[11px]">na lista</span>}
                  </div>
                </td>
                <td className="py-1.5 text-right tabular">{ch.ilvl ? Math.round(ch.ilvl) : "—"}</td>
                <td className="py-1.5 text-right tabular">
                  <span className={`font-semibold ${tone(totalBosses ? ((ch.mythic ?? 0) / totalBosses) * 100 : null)}`}>{ch.mythic ?? 0}</span>
                  <span className="text-muted">/{totalBosses}</span>
                </td>
                <td className="py-1.5 text-right tabular">{fmtInt(ch.mplus)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Stat({ label, value, toneClass = "" }: { label: string; value: string; toneClass?: string }) {
  return (
    <div className="rounded-md bg-surface-2 px-2.5 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`text-base font-semibold tabular ${toneClass}`}>{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface Stint {
  guild: string;
  server: string | null;
  first: number;
  last: number;
  raids: number;
  reports: number;
  zones: string[];
}

interface HistoryResponse {
  characters: { id: string; name: string; realm: string; stints: Stint[] | null }[];
  snapshots: { guild: string | null; seenAt: number }[];
  wcl: boolean;
}

const fmtDate = (t: number) => new Date(t).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });

/**
 * Histórico de guildas pelos logs da WCL (sob demanda: custa pontos), mais as trocas que o app
 * viu nos scans. O WowProgress não é lido (bloqueia automação) — fica o link no topo do painel.
 */
export function GuildHistorySection({
  charId,
  hasAccount,
}: {
  charId: string;
  hasAccount: boolean;
}) {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState<"char" | "alts" | null>("char");
  const [error, setError] = useState<string | null>(null);

  const load = async (alts: boolean) => {
    setLoading(alts ? "alts" : "char");
    setError(null);
    try {
      const res = await fetch(`/api/history?id=${encodeURIComponent(charId)}${alts ? "&alts=1" : ""}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(null);
  };

  useEffect(() => {
    let alive = true;
    fetch(`/api/history?id=${encodeURIComponent(charId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: HistoryResponse) => alive && setData(j))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(null));
    return () => {
      alive = false;
    };
  }, [charId]);

  const withStints = data?.characters.filter((c) => c.stints?.length) ?? [];
  const multi = (data?.characters.length ?? 0) > 1;

  return (
    <section aria-labelledby="sec-guildhist" className="space-y-2" aria-busy={loading !== null}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="sec-guildhist" className="font-semibold">
          Histórico de guildas
        </h3>
        <span className="text-xs text-muted">pelos logs da Warcraft Logs</span>
      </div>

      {loading === "char" ? (
        <p className="flex items-center gap-1.5 text-muted">
          <Loader2 size={14} className="motion-safe:animate-spin" aria-hidden />
          Buscando os logs do personagem…
        </p>
      ) : error ? (
        <p role="alert" className="text-danger">
          Não consegui carregar o histórico ({error}).{" "}
          <button type="button" onClick={() => load(false)} className="font-medium underline">
            Tentar de novo
          </button>
        </p>
      ) : !data?.wcl ? (
        <p className="text-muted">Configure a chave da Warcraft Logs para ver o histórico de guildas.</p>
      ) : withStints.length === 0 ? (
        <p className="text-muted">Nenhum log com tag de guilda encontrado.</p>
      ) : (
        <div className="space-y-3">
          {withStints.map((ch) => (
            <div key={ch.id} className="space-y-1">
              {multi && <p className="text-xs font-medium text-muted">{ch.name}</p>}
              <ol className="space-y-1">
                {ch.stints!.map((st) => {
                  const stint = st.raids >= 3;
                  return (
                    <li key={`${st.guild}|${st.server}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className={stint ? "font-medium" : ""}>{st.guild}</span>
                      <span className="text-xs text-muted tabular">
                        {fmtDate(st.first)}
                        {st.first !== st.last && ` – ${fmtDate(st.last)}`}
                      </span>
                      <span className="text-xs text-muted">
                        · {st.raids ? `${st.raids} ${st.raids === 1 ? "raid" : "raids"}` : `${st.reports} M+`}
                        {!stint && st.raids > 0 && " (avulso)"}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      )}

      {data && data.snapshots.length > 1 && (
        <div className="space-y-1 pt-1">
          <p className="text-xs font-medium text-muted">Trocas vistas pelo app (guilda no jogo)</p>
          <ol className="space-y-0.5 text-sm">
            {data.snapshots.map((sn) => (
              <li key={sn.seenAt}>
                <span className="text-xs text-muted tabular">{new Date(sn.seenAt).toLocaleDateString("pt-BR")}</span>{" "}
                {sn.guild ? sn.guild.split("|")[0] : "sem guilda"}
              </li>
            ))}
          </ol>
        </div>
      )}

      {hasAccount && data?.wcl && !multi && loading === null && (
        <button
          type="button"
          onClick={() => load(true)}
          className="rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
        >
          Incluir os alts da conta
        </button>
      )}
      {loading === "alts" && (
        <p className="flex items-center gap-1.5 text-muted">
          <Loader2 size={14} className="motion-safe:animate-spin" aria-hidden />
          Buscando os logs dos alts (pode levar alguns segundos)…
        </p>
      )}
    </section>
  );
}
