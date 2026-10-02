"use client";

import { Download, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { desktop, type UpdateState } from "@/lib/desktop";

/** Aviso no topo quando há versão nova: pronta para instalar (Windows/Linux) ou para baixar (macOS). */
export function UpdateBanner({ state }: { state: UpdateState | null }) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (!state || !state.version || dismissed === `${state.status}:${state.version}`) return null;
  if (state.status !== "downloaded" && state.status !== "available") return null;
  const d = desktop();

  return (
    <div role="status" className="mx-4 mt-3 flex flex-wrap items-center gap-3 rounded-md border border-accent/40 bg-accent-soft px-3 py-2 text-sm">
      <span className="flex-1">
        {state.status === "downloaded" ? (
          <>
            <strong className="font-semibold">Versão {state.version} pronta.</strong> Reinicie para atualizar — ou ela é
            instalada quando você fechar o app.
          </>
        ) : (
          <>
            <strong className="font-semibold">Versão {state.version} disponível.</strong> No macOS a instalação é manual:
            baixe o novo .dmg na página do release.
          </>
        )}
      </span>
      <button
        type="button"
        onClick={() => setDismissed(`${state.status}:${state.version}`)}
        className="rounded-md px-3 py-1.5 font-medium text-muted hover:bg-surface hover:text-text"
      >
        Depois
      </button>
      {state.status === "downloaded" ? (
        <button
          type="button"
          onClick={() => d?.updates.install()}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-semibold text-accent-fg hover:opacity-90"
        >
          <RefreshCw size={14} aria-hidden />
          Reiniciar e atualizar
        </button>
      ) : (
        <button
          type="button"
          onClick={() => d?.updates.openRelease()}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-semibold text-accent-fg hover:opacity-90"
        >
          <Download size={14} aria-hidden />
          Abrir o release
        </button>
      )}
    </div>
  );
}

const STATUS_TEXT: Record<UpdateState["status"], (s: UpdateState) => string> = {
  idle: () => "Ainda não verificado.",
  checking: () => "Procurando atualizações…",
  available: (s) => `Versão ${s.version} disponível para download.`,
  downloading: (s) => `Baixando a versão ${s.version}… ${s.percent ?? 0}%`,
  downloaded: (s) => `Versão ${s.version} baixada. Reinicie para instalar.`,
  latest: () => "Você está na versão mais recente.",
  error: (s) => s.error ?? "Não consegui verificar atualizações.",
  unsupported: () => "Atualizações automáticas só funcionam no app instalado.",
};

/** Aba "Sobre" das Configurações: versão atual e verificação manual. */
export function UpdatesPanel({ state }: { state: UpdateState | null }) {
  const d = desktop();
  const busy = state?.status === "checking" || state?.status === "downloading";

  if (!d || !state) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-muted">
          Você está usando a versão de desenvolvimento no navegador. No app instalado, as atualizações são baixadas
          automaticamente dos releases do GitHub.
        </p>
        <a
          href="https://github.com/keter45/poachnomic3000/releases/latest"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-accent underline"
        >
          Ver releases
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <dt className="text-muted">Versão instalada</dt>
        <dd className="font-medium tabular">{state.current}</dd>
        <dt className="text-muted">Atualizações</dt>
        <dd aria-live="polite" className={state.status === "error" ? "text-danger" : ""}>
          {STATUS_TEXT[state.status](state)}
        </dd>
        {state.checkedAt && (
          <>
            <dt className="text-muted">Última verificação</dt>
            <dd className="tabular">{new Date(state.checkedAt).toLocaleString("pt-BR")}</dd>
          </>
        )}
      </dl>

      {state.status === "downloading" && (
        <progress
          max={100}
          value={state.percent ?? 0}
          aria-label="Download da atualização"
          className="h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-accent [&::-webkit-progress-bar]:bg-surface-2 [&::-webkit-progress-value]:bg-accent"
        />
      )}

      <p className="text-xs text-muted">
        {state.canAutoInstall
          ? "O app procura versões novas ao abrir e a cada 6 horas, baixa em segundo plano e instala quando você reinicia."
          : "No macOS o app avisa quando sai versão nova, mas a instalação é manual: baixe o .dmg e substitua o app."}
      </p>

      <div className="flex flex-wrap gap-2">
        {state.status === "downloaded" ? (
          <button
            type="button"
            onClick={() => d.updates.install()}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-semibold text-accent-fg hover:opacity-90"
          >
            <RefreshCw size={14} aria-hidden />
            Reiniciar e atualizar
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => d.updates.check()}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 font-medium hover:bg-surface-2 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="motion-safe:animate-spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />}
            Procurar atualizações
          </button>
        )}
        <button type="button" onClick={() => d.updates.openRelease()} className="rounded-md px-3 py-1.5 font-medium text-muted hover:bg-surface-2 hover:text-text">
          Notas da versão
        </button>
      </div>
    </div>
  );
}
