"use client";

import { Check, CircleAlert, Copy, Eye, EyeOff, Loader2, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DAY_SHORT, nightsToSlots } from "@/lib/schedule";
import type { RaidNight, Settings } from "@/lib/types";
import { ScheduleGrid } from "./ScheduleGrid";

const DAY_LONG = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const hourLabel = (h: number) => `${String(h % 24).padStart(2, "0")}h${h >= 24 ? " (+1)" : ""}`;

export type SettingsTab = "keys" | "schedule";

export interface KeyStatus {
  wcl: { configured: boolean; source: "app" | "env" | null; clientIdHint: string | null };
  raiderio: { configured: boolean; hint: string | null };
}

export function SettingsDialog({
  open,
  tab,
  onTab,
  onClose,
  settings,
  onSave,
  keys,
  onKeysSaved,
}: {
  open: boolean;
  tab: SettingsTab;
  onTab: (t: SettingsTab) => void;
  onClose: () => void;
  settings: Settings;
  onSave: (s: Partial<Settings>) => void;
  keys: KeyStatus | null;
  onKeysSaved: (k: KeyStatus) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="modal m-auto" aria-labelledby="settings-title" onClose={onClose}>
      <div className="flex max-h-[calc(100dvh-32px)] flex-col">
        <header className="border-b border-line px-5 pt-3">
          <div className="flex items-center justify-between">
            <h2 id="settings-title" className="text-base font-semibold">
              Configurações
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="grid h-10 w-10 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
          <div role="tablist" aria-label="Seções" className="-mb-px mt-1 flex gap-4 text-sm">
            {(
              [
                ["keys", "Chaves de API"],
                ["schedule", "Nosso horário"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`panel-${id}`}
                onClick={() => onTab(id)}
                className="border-b-2 border-transparent py-2 font-medium text-muted hover:text-text aria-selected:border-accent aria-selected:text-text"
              >
                {label}
                {id === "keys" && keys && !keys.wcl.configured && (
                  <span className="ml-1.5 rounded bg-warn/15 px-1 py-px text-[11px] text-warn">pendente</span>
                )}
              </button>
            ))}
          </div>
        </header>

        {tab === "keys" ? (
          <div role="tabpanel" id="panel-keys" aria-labelledby="tab-keys" className="flex min-h-0 flex-1 flex-col">
            {/* remonta ao abrir e quando o status das chaves chega, para começar no modo certo (editar ou não) */}
            <KeysPanel key={`${open}-${keys ? 1 : 0}`} keys={keys} onSaved={onKeysSaved} onClose={onClose} />
          </div>
        ) : (
          <div role="tabpanel" id="panel-schedule" aria-labelledby="tab-schedule" className="flex min-h-0 flex-1 flex-col">
            <SchedulePanel key={String(open)} settings={settings} onSave={onSave} onClose={onClose} />
          </div>
        )}
      </div>
    </dialog>
  );
}

// ---------------------------------------------------------------------------

function KeysPanel({ keys, onSaved, onClose }: { keys: KeyStatus | null; onSaved: (k: KeyStatus) => void; onClose: () => void }) {
  const configured = keys?.wcl.configured ?? false;
  const [editing, setEditing] = useState(!configured);
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [rioKey, setRioKey] = useState("");
  const [busy, setBusy] = useState<"wcl" | "rio" | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string; for: "wcl" | "rio" } | null>(null);

  const save = async (which: "wcl" | "rio") => {
    setBusy(which);
    setMsg(null);
    const body = which === "wcl" ? { wclClientId: clientId, wclClientSecret: secret } : { raiderioKey: rioKey };
    try {
      const res = await fetch("/api/keys", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) {
        setMsg({ kind: "error", text: j.error ?? "Não foi possível salvar.", for: which });
      } else {
        onSaved(j as KeyStatus);
        if (which === "wcl") {
          setEditing(false);
          setClientId("");
          setSecret("");
          setMsg({ kind: "ok", text: "Conectado à Warcraft Logs. Agora é só escanear.", for: "wcl" });
        } else {
          setRioKey("");
          setMsg({ kind: "ok", text: rioKey.trim() ? "Chave do Raider.io salva." : "Chave do Raider.io removida.", for: "rio" });
        }
      }
    } catch {
      setMsg({ kind: "error", text: "O app não respondeu. Tente de novo.", for: which });
    }
    setBusy(null);
  };

  return (
    <>
      <div className="space-y-6 overflow-y-auto px-5 py-4 text-sm">
        {/* Warcraft Logs */}
        <section aria-labelledby="wcl-title" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="wcl-title" className="font-semibold">
              Warcraft Logs <span className="font-normal text-muted">(obrigatória)</span>
            </h3>
            {configured ? (
              <span className="inline-flex items-center gap-1 text-ok">
                <Check size={14} aria-hidden />
                Conectada{keys?.wcl.clientIdHint ? ` · ID ${keys.wcl.clientIdHint}` : ""}
                {keys?.wcl.source === "env" ? " · via .env.local" : ""}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-warn">
                <CircleAlert size={14} aria-hidden />
                Não configurada
              </span>
            )}
          </div>
          <p className="text-muted text-pretty">
            Dá acesso aos parses, à presença no raid, aos horários e aos jogadores avulsos. É grátis e leva uns 2 minutos.
          </p>

          {configured && !editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md border border-line px-3 py-1.5 font-medium hover:bg-surface-2"
            >
              Trocar chave
            </button>
          ) : (
            <>
              <ol className="list-decimal space-y-2 pl-5 marker:text-muted">
                <li>
                  Entre na sua conta da Warcraft Logs (ou crie uma, é grátis) e abra a{" "}
                  <a href="https://www.warcraftlogs.com/api/clients" target="_blank" rel="noreferrer" className="font-medium text-accent underline">
                    página de clients da API
                  </a>
                  .
                </li>
                <li>
                  Clique em <strong>Create Client</strong>. Em <em>Name</em>, coloque qualquer nome. Em <em>Redirect URLs</em>, cole{" "}
                  <CopyText value="http://localhost" />. Deixe <strong>Public Client desmarcado</strong>.
                </li>
                <li>Salve e copie o <strong>Client ID</strong> e o <strong>Client Secret</strong> para os campos abaixo.</li>
              </ol>

              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  save("wcl");
                }}
              >
                <label className="block space-y-1">
                  <span className="font-medium">Client ID</span>
                  <input
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="ex.: 9a1b2c3d-4e5f-…"
                    className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-[13px] placeholder:font-sans placeholder:text-muted"
                  />
                </label>
                <div className="space-y-1">
                  <label htmlFor="wcl-secret" className="block font-medium">
                    Client Secret
                  </label>
                  <span className="flex gap-2">
                    <input
                      id="wcl-secret"
                      aria-describedby="wcl-secret-hint"
                      type={showSecret ? "text" : "password"}
                      value={secret}
                      onChange={(e) => setSecret(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                      className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-[13px]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret((v) => !v)}
                      aria-label={showSecret ? "Esconder secret" : "Mostrar secret"}
                      aria-pressed={showSecret}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line text-muted hover:bg-surface-2 hover:text-text"
                    >
                      {showSecret ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                    </button>
                  </span>
                  <span id="wcl-secret-hint" className="block text-xs text-muted">
                    Fica salvo só neste computador. Trate como uma senha.
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    disabled={busy !== null || !clientId.trim() || !secret.trim()}
                    className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-semibold text-accent-fg hover:opacity-90 disabled:opacity-50"
                  >
                    {busy === "wcl" && <Loader2 size={14} className="motion-safe:animate-spin" aria-hidden />}
                    {busy === "wcl" ? "Testando…" : "Testar e salvar"}
                  </button>
                  {configured && (
                    <button type="button" onClick={() => setEditing(false)} className="rounded-md px-3 py-1.5 font-medium text-muted hover:bg-surface-2 hover:text-text">
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </>
          )}
          {msg?.for === "wcl" && <Message msg={msg} />}
        </section>

        {/* Raider.io */}
        <section aria-labelledby="rio-title" className="space-y-3 border-t border-line pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="rio-title" className="font-semibold">
              Raider.io <span className="font-normal text-muted">(opcional)</span>
            </h3>
            {keys?.raiderio.configured && (
              <span className="inline-flex items-center gap-1 text-ok">
                <Check size={14} aria-hidden />
                Chave salva · {keys.raiderio.hint}
              </span>
            )}
          </div>
          <p className="text-muted text-pretty">
            Funciona sem chave. Com uma chave da sua conta do Raider.io os scans grandes ficam um pouco mais rápidos.
          </p>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              save("rio");
            }}
          >
            <label className="sr-only" htmlFor="rio-key">
              Chave do Raider.io
            </label>
            <input
              id="rio-key"
              type="password"
              value={rioKey}
              onChange={(e) => setRioKey(e.target.value)}
              autoComplete="off"
              placeholder={keys?.raiderio.configured ? "Nova chave (vazio remove)" : "Chave do Raider.io"}
              className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-[13px] placeholder:font-sans placeholder:text-muted"
            />
            <button
              type="submit"
              disabled={busy !== null || (!rioKey.trim() && !keys?.raiderio.configured)}
              className="rounded-md border border-line px-3 py-1.5 font-medium hover:bg-surface-2 disabled:opacity-50"
            >
              {rioKey.trim() || !keys?.raiderio.configured ? "Salvar" : "Remover chave"}
            </button>
          </form>
          {msg?.for === "rio" && <Message msg={msg} />}
        </section>
      </div>
      <footer className="flex justify-end border-t border-line px-5 py-3">
        <button type="button" onClick={onClose} className="rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface-2">
          Fechar
        </button>
      </footer>
    </>
  );
}

function Message({ msg }: { msg: { kind: "ok" | "error"; text: string } }) {
  return msg.kind === "ok" ? (
    <p role="status" className="flex items-start gap-1.5 text-ok">
      <Check size={15} className="mt-0.5 shrink-0" aria-hidden />
      {msg.text}
    </p>
  ) : (
    <p role="alert" className="flex items-start gap-1.5 text-danger">
      <CircleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
      {msg.text}
    </p>
  );
}

function CopyText({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 rounded border border-line bg-surface-2 px-1.5 py-px font-mono text-[12px] hover:border-accent"
    >
      {value}
      {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
      <span className="sr-only" aria-live="polite">
        {copied ? "copiado" : "copiar"}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------

function SchedulePanel({ settings, onSave, onClose }: { settings: Settings; onSave: (s: Partial<Settings>) => void; onClose: () => void }) {
  const [nights, setNights] = useState<RaidNight[]>(settings.ourNights);
  const [tz, setTz] = useState(settings.tzOffset);
  const update = (i: number, patch: Partial<RaidNight>) => setNights(nights.map((n, j) => (j === i ? { ...n, ...patch } : n)));

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ourNights: nights.filter((n) => n.to > n.from), tzOffset: tz });
        onClose();
      }}
    >
      <div className="space-y-5 overflow-y-auto px-5 py-4 text-sm">
        <p className="text-muted">
          Usado na parte “Horário” do score: quanto da nossa janela de raid bate com as horas em que o jogador costuma estar online.
        </p>

        <ul className="space-y-2">
          {nights.map((n, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor={`night-day-${i}`}>
                Dia
              </label>
              <select
                id={`night-day-${i}`}
                value={n.day}
                onChange={(e) => update(i, { day: Number(e.target.value) })}
                className="rounded-md border border-line bg-surface px-2 py-1.5"
              >
                {DAY_LONG.map((d, j) => (
                  <option key={d} value={j}>
                    {d}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5">
                <span className="text-muted">das</span>
                <select
                  value={n.from}
                  onChange={(e) => update(i, { from: Number(e.target.value) })}
                  className="rounded-md border border-line bg-surface px-2 py-1.5 tabular"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                <span className="text-muted">às</span>
                <select
                  value={n.to}
                  onChange={(e) => update(i, { to: Number(e.target.value) })}
                  className="rounded-md border border-line bg-surface px-2 py-1.5 tabular"
                >
                  {Array.from({ length: 30 }, (_, h) => h + 1)
                    .filter((h) => h > n.from)
                    .map((h) => (
                      <option key={h} value={h}>
                        {hourLabel(h)}
                      </option>
                    ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => setNights(nights.filter((_, j) => j !== i))}
                aria-label={`Remover ${DAY_SHORT[n.day]}`}
                className="grid h-10 w-10 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-danger"
              >
                <Trash2 size={15} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setNights([...nights, { day: 2, from: 20, to: 24 }])}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 font-medium hover:bg-surface-2"
        >
          <Plus size={14} aria-hidden />
          Adicionar noite
        </button>

        <label className="block max-w-xs space-y-1">
          <span className="font-medium">Fuso horário</span>
          <select value={tz} onChange={(e) => setTz(Number(e.target.value))} className="w-full rounded-md border border-line bg-surface px-2 py-1.5">
            <option value={-2}>UTC−2 (Fernando de Noronha)</option>
            <option value={-3}>UTC−3 (Brasília)</option>
            <option value={-4}>UTC−4 (Manaus)</option>
            <option value={-5}>UTC−5 (Acre)</option>
          </select>
        </label>

        <ScheduleGrid label="Prévia" values={null} ours={new Set(nightsToSlots(nights))} emptyText="Células contornadas = nosso horário" />
      </div>

      <footer className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <button type="button" onClick={onClose} className="rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface-2">
          Cancelar
        </button>
        <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg hover:opacity-90">
          Salvar horário
        </button>
      </footer>
    </form>
  );
}
