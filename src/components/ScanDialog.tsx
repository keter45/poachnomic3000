"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_SCAN, type ScanParams, type ScanState } from "@/lib/types";
import { fmtInt } from "@/lib/wow";

const BR_REALMS = [
  { slug: "azralon", name: "Azralon" },
  { slug: "gallywix", name: "Gallywix" },
  { slug: "goldrinn", name: "Goldrinn" },
  { slug: "nemesis", name: "Nemesis" },
  { slug: "tol-barad", name: "Tol Barad" },
];

export interface ScanStatus extends ScanState {
  budget: { limitPerHour: number; spent: number; resetAt: number } | null;
}

export function ScanDialog({
  open,
  onClose,
  status,
  onStart,
  onStop,
  onImport,
  totalBosses,
  wclConfigured,
}: {
  open: boolean;
  onClose: () => void;
  status: ScanStatus | null;
  onStart: (p: ScanParams) => Promise<string | null>;
  onStop: () => void;
  onImport: (url: string) => Promise<{ error?: string; ok?: string }>;
  totalBosses: number;
  wclConfigured: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [p, setP] = useState<ScanParams>(() => {
    try {
      const saved = localStorage.getItem("poach:scan");
      if (saved) return { ...DEFAULT_SCAN, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_SCAN;
  });
  const [extraRealms, setExtraRealms] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const runImport = async () => {
    setImporting(true);
    setImportMsg(null);
    setImportMsg(await onImport(importUrl));
    setImporting(false);
  };

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const running = status?.status === "running" || status?.status === "stopping";
  const realms = p.scope.kind === "realms" ? p.scope.realms : [];
  const setRealm = (slug: string, on: boolean) =>
    setP({ ...p, scope: { kind: "realms", realms: on ? [...realms, slug] : realms.filter((r) => r !== slug) } });

  const start = async () => {
    const extra = extraRealms
      .split(",")
      .map((s) => s.trim().toLowerCase().replace(/\s+/g, "-").replace(/'/g, ""))
      .filter(Boolean);
    const params: ScanParams =
      p.scope.kind === "realms" ? { ...p, scope: { kind: "realms", realms: [...new Set([...realms, ...extra])] } } : p;
    if (params.scope.kind === "realms" && !params.scope.realms.length) {
      setError("Escolha pelo menos um realm.");
      return;
    }
    try {
      localStorage.setItem("poach:scan", JSON.stringify(params));
    } catch {}
    setError(await onStart(params));
  };

  const pct = status && status.guildsTotal ? Math.round((status.guildsDone / status.guildsTotal) * 100) : 0;

  return (
    <dialog ref={ref} className="modal m-auto" aria-labelledby="scan-title" onClose={onClose}>
      <div className="flex max-h-[calc(100dvh-32px)] flex-col">
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 id="scan-title" className="text-base font-semibold">
            Escanear guildas
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid h-10 w-10 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
          >
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="space-y-5 overflow-y-auto px-5 py-4 text-sm">
          {!wclConfigured && (
            <p role="alert" className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2">
              Warcraft Logs não configurada: preencha <code>WCL_CLIENT_ID</code> e <code>WCL_CLIENT_SECRET</code> no{" "}
              <code>.env.local</code> e reinicie o <code>npm run dev</code>. Sem ela, o scan usa só o Raider.io (sem parses,
              presença e horários).
            </p>
          )}

          <fieldset disabled={running} className="space-y-5 disabled:opacity-60">
            <div className="space-y-2">
              <legend className="font-medium">Onde procurar</legend>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="scope"
                  checked={p.scope.kind === "subregion"}
                  onChange={() => setP({ ...p, scope: { kind: "subregion", value: "brazil" } })}
                />
                Todos os realms brasileiros
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="scope"
                  checked={p.scope.kind === "realms"}
                  onChange={() => setP({ ...p, scope: { kind: "realms", realms: ["azralon"] } })}
                />
                Realms específicos
              </label>
              {p.scope.kind === "realms" && (
                <div className="ml-6 space-y-2">
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {BR_REALMS.map((r) => (
                      <label key={r.slug} className="flex items-center gap-1.5">
                        <input type="checkbox" checked={realms.includes(r.slug)} onChange={(e) => setRealm(r.slug, e.target.checked)} />
                        {r.name}
                      </label>
                    ))}
                  </div>
                  <label className="block space-y-1">
                    <span className="text-xs text-muted">Outros realms US (separados por vírgula)</span>
                    <input
                      value={extraRealms}
                      onChange={(e) => setExtraRealms(e.target.value)}
                      placeholder="stormrage, illidan, area-52"
                      className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 placeholder:text-muted"
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <NumberField
                label="Progresso mín. da guilda"
                suffix={`/${totalBosses}M`}
                value={p.minBosses}
                min={1}
                max={totalBosses || 20}
                onChange={(v) => setP({ ...p, minBosses: v })}
              />
              <NumberField
                label="Progresso máx. da guilda"
                suffix={`/${totalBosses}M`}
                value={Math.min(p.maxBosses, totalBosses || 99)}
                min={1}
                max={totalBosses || 99}
                onChange={(v) => setP({ ...p, maxBosses: v })}
              />
              <NumberField label="Máx. de guildas" value={p.maxGuilds} min={1} max={500} onChange={(v) => setP({ ...p, maxGuilds: v })} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="font-medium">Histórico de logs (tempo na guilda)</span>
                <select
                  value={p.historyDays}
                  onChange={(e) => setP({ ...p, historyDays: Number(e.target.value) })}
                  className="w-full rounded-md border border-line bg-surface px-2 py-1.5"
                >
                  <option value={45}>Só o tier atual (mais barato)</option>
                  <option value={120}>4 meses</option>
                  <option value={180}>6 meses</option>
                  <option value={365}>1 ano (caro no primeiro scan)</option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className="flex justify-between font-medium">
                  Presença mínima no raid team
                  <output className="tabular text-xs font-normal text-muted">{Math.round(p.minAttendance * 100)}%</output>
                </span>
                <input
                  type="range"
                  min={0}
                  max={0.8}
                  step={0.05}
                  value={p.minAttendance}
                  onChange={(e) => setP({ ...p, minAttendance: Number(e.target.value) })}
                  className="w-full"
                />
                <span className="block text-xs text-muted">Das noites míticas logadas pela guilda no tier.</span>
              </label>
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={p.fetchRankings} onChange={(e) => setP({ ...p, fetchRankings: e.target.checked })} />
                Buscar parses de cada personagem (≈5 pontos da WCL cada)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={p.fetchSocials} onChange={(e) => setP({ ...p, fetchSocials: e.target.checked })} />
                Buscar redes sociais no Raider.io
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={p.findStandalone}
                  onChange={(e) => setP({ ...p, findStandalone: e.target.checked })}
                  className="mt-0.5"
                />
                <span>
                  Procurar jogadores avulsos
                  <span className="block text-xs text-muted">
                    Quem matou bosses míticos em pugs ou em guildas só heroicas: rankings por boss da WCL + rosters do Raider.io.
                  </span>
                </span>
              </label>
              {p.findStandalone && (
                <div className="ml-6">
                  <NumberField
                    label="Máx. de avulsos"
                    value={p.maxStandalone}
                    min={10}
                    max={2000}
                    onChange={(v) => setP({ ...p, maxStandalone: v })}
                  />
                </div>
              )}
            </div>
          </fieldset>

          <p className="text-xs text-muted">
            A Warcraft Logs libera 3.600 pontos por hora. Um scan grande pode levar horas na primeira vez: ele pausa
            sozinho quando a cota acaba e continua depois. Os próximos scans reaproveitam o cache e saem bem mais baratos.
          </p>

          {status && status.status !== "idle" && (
            <section aria-labelledby="scan-progress" className="space-y-2 rounded-md border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 id="scan-progress" className="font-medium">
                  {statusLabel(status.status)}
                </h3>
                <span className="text-xs text-muted tabular">
                  {status.guildsDone}/{status.guildsTotal} guildas · {fmtInt(status.charsDone)} personagens
                </span>
              </div>
              <progress
                max={100}
                value={pct}
                aria-label="Progresso do scan"
                className="h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-accent [&::-webkit-progress-bar]:bg-surface-2 [&::-webkit-progress-value]:bg-accent"
              />
              {running && (
                <p className="flex items-center gap-1.5 text-xs text-muted" aria-live="polite">
                  <Loader2 size={12} className="motion-safe:animate-spin" aria-hidden />
                  {status.phase}
                  {status.current ? ` — ${status.current}` : ""}
                </p>
              )}
              {status.waitingUntil && (
                <p className="text-xs text-warn">
                  Esperando a cota da Warcraft Logs renovar às {new Date(status.waitingUntil).toLocaleTimeString("pt-BR")}.
                </p>
              )}
              {status.log.length > 0 && (
                <details>
                  <summary className="cursor-pointer select-none text-xs font-medium">Log ({status.log.length})</summary>
                  <ol className="mt-2 max-h-48 space-y-0.5 overflow-y-auto font-mono text-[11px]">
                    {[...status.log].reverse().map((l, i) => (
                      <li key={i} className={l.level === "error" ? "text-danger" : l.level === "warn" ? "text-warn" : "text-muted"}>
                        {new Date(l.ts).toLocaleTimeString("pt-BR")} {l.msg}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </section>
          )}
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}

          <section aria-labelledby="import-title" className="space-y-2 border-t border-line pt-4">
            <h3 id="import-title" className="font-medium">
              Importar log por link
            </h3>
            <p className="text-xs text-muted">
              Para pugs postados no Discord: quem lutou contra bosses no log entra como avulso. Funciona com logs públicos e não
              listados. Logs privados não podem ser lidos pela API.
            </p>
            <div className="flex flex-wrap gap-2">
              <label className="sr-only" htmlFor="import-url">
                Link do report
              </label>
              <input
                id="import-url"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="https://www.warcraftlogs.com/reports/…"
                className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2.5 py-1.5 placeholder:text-muted"
              />
              <button
                type="button"
                onClick={runImport}
                disabled={importing || !importUrl.trim()}
                className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 font-medium hover:bg-surface-2 disabled:opacity-50"
              >
                {importing && <Loader2 size={14} className="motion-safe:animate-spin" aria-hidden />}
                {importing ? "Importando…" : "Importar"}
              </button>
            </div>
            {importMsg?.error && (
              <p role="alert" className="text-danger">
                {importMsg.error}
              </p>
            )}
            {importMsg?.ok && (
              <p role="status" className="text-ok">
                {importMsg.ok}
              </p>
            )}
          </section>
        </div>

        <footer className="flex justify-end gap-2 border-t border-line px-5 py-3">
          {running ? (
            <button
              type="button"
              onClick={onStop}
              disabled={status?.status === "stopping"}
              className="rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
            >
              {status?.status === "stopping" ? "Parando…" : "Parar scan"}
            </button>
          ) : (
            <button
              type="button"
              onClick={start}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg hover:opacity-90"
            >
              Iniciar scan
            </button>
          )}
        </footer>
      </div>
    </dialog>
  );
}

function statusLabel(s: ScanState["status"]) {
  return {
    idle: "Parado",
    running: "Escaneando",
    stopping: "Parando",
    done: "Scan concluído",
    stopped: "Scan interrompido",
    error: "Scan falhou — veja o log abaixo e tente de novo",
  }[s];
}

function NumberField({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="font-medium">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          inputMode="numeric"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
          className="w-20 rounded-md border border-line bg-surface px-2 py-1.5 tabular"
        />
        {suffix && <span className="text-muted">{suffix}</span>}
      </span>
    </label>
  );
}
