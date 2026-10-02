"use client";

import { useEffect, useState } from "react";

/** Estado da atualização, vindo do processo principal do app desktop (electron/updater.cjs). */
export interface UpdateState {
  current: string;
  status: "idle" | "checking" | "available" | "downloading" | "downloaded" | "latest" | "error" | "unsupported";
  version: string | null;
  percent: number | null;
  error: string | null;
  canAutoInstall: boolean;
  releaseUrl: string;
  checkedAt: number | null;
}

interface DesktopBridge {
  updates: {
    get: () => Promise<UpdateState>;
    check: () => Promise<UpdateState>;
    install: () => Promise<boolean>;
    openRelease: () => Promise<void>;
    onState: (cb: (s: UpdateState) => void) => () => void;
  };
}

/** Ponte do Electron (preload). Ausente quando o app roda no navegador (npm run dev). */
export function desktop(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { poachDesktop?: DesktopBridge }).poachDesktop ?? null;
}

export function useUpdates(): UpdateState | null {
  const [state, setState] = useState<UpdateState | null>(null);
  useEffect(() => {
    const d = desktop();
    if (!d) return;
    let alive = true;
    d.updates.get().then((s) => alive && setState(s));
    const off = d.updates.onState((s) => setState({ ...s }));
    return () => {
      alive = false;
      off();
    };
  }, []);
  return state;
}
