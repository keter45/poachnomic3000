"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DAY_SHORT, nightsToSlots } from "@/lib/schedule";
import type { RaidNight, Settings } from "@/lib/types";
import { ScheduleGrid } from "./ScheduleGrid";

const DAY_LONG = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const hourLabel = (h: number) => `${String(h % 24).padStart(2, "0")}h${h >= 24 ? " (+1)" : ""}`;

export function SettingsDialog({
  open,
  onClose,
  settings,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onSave: (s: Partial<Settings>) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [nights, setNights] = useState<RaidNight[]>(settings.ourNights);
  const [tz, setTz] = useState(settings.tzOffset);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setNights(settings.ourNights);
      setTz(settings.tzOffset);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open, settings]);

  const update = (i: number, patch: Partial<RaidNight>) =>
    setNights(nights.map((n, j) => (j === i ? { ...n, ...patch } : n)));

  return (
    <dialog ref={ref} className="modal m-auto" aria-labelledby="settings-title" onClose={onClose}>
      <form
        method="dialog"
        className="flex max-h-[calc(100dvh-32px)] flex-col"
        onSubmit={() => onSave({ ourNights: nights.filter((n) => n.to > n.from), tzOffset: tz })}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 id="settings-title" className="text-base font-semibold">
            Nosso horário de raid
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
          <p className="text-muted">
            Usado na parte “Horário” do score: quanto da nossa janela de raid bate com as horas em que o jogador costuma
            estar online.
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
            <select
              value={tz}
              onChange={(e) => setTz(Number(e.target.value))}
              className="w-full rounded-md border border-line bg-surface px-2 py-1.5"
            >
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
    </dialog>
  );
}
