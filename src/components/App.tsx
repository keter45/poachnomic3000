"use client";

import { Clock, Loader2, Radar, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { scoreCandidate } from "@/lib/score";
import type { Candidate, ScanParams, Settings, TierInfo } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { fmtInt } from "@/lib/wow";
import { CandidateTable } from "./CandidateTable";
import { DetailSheet } from "./DetailSheet";
import { FilterPanel } from "./FilterPanel";
import { activeFilterCount, applyFilters, DEFAULT_FILTERS, type Filters, type Row, type SortKey, sortRows } from "./filters";
import { ScanDialog, type ScanStatus } from "./ScanDialog";
import { SettingsDialog } from "./SettingsDialog";

interface Meta {
  tier: TierInfo | null;
  error: string | null;
  wclConfigured: boolean;
  budget: { limitPerHour: number; spent: number; resetAt: number } | null;
  guilds: number;
  settings: Settings;
}

function usePersisted<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return { ...initial, ...JSON.parse(raw) };
    } catch {}
    return initial;
  });
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {}
    },
    [key],
  );
  return [value, set];
}

export function App() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  // localStorage e <dialog> só existem no navegador
  if (!mounted) return <p className="p-6 text-sm text-muted">Carregando…</p>;
  return <Main />;
}

function Main() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [filters, setFilters] = usePersisted<Filters>("poach:filters", DEFAULT_FILTERS);
  const [sort, setSort] = usePersisted<{ key: SortKey; dir: "asc" | "desc" }>("poach:sort", { key: "score", dir: "desc" });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [scan, setScan] = useState<ScanStatus | null>(null);

  const loadMeta = useCallback(async () => {
    const m = (await fetch("/api/meta").then((r) => r.json())) as Meta;
    setMeta(m);
    setSettings(m.settings);
  }, []);
  const loadCandidates = useCallback(async () => {
    try {
      const res = await fetch("/api/candidates");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCandidates(await res.json());
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  const loadScan = useCallback(async () => {
    const s = (await fetch("/api/scan").then((r) => r.json())) as ScanStatus;
    setScan(s);
    return s;
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      loadMeta().catch((e) => setLoadError(String(e)));
      loadCandidates();
      loadScan();
    });
    return () => clearTimeout(t);
  }, [loadMeta, loadCandidates, loadScan]);

  // acompanha o scan e recarrega a lista enquanto ele roda
  const running = scan?.status === "running" || scan?.status === "stopping";
  useEffect(() => {
    if (!running) return;
    let ticks = 0;
    const id = setInterval(async () => {
      const s = await loadScan().catch(() => null);
      if (++ticks % 8 === 0) loadCandidates();
      if (s && s.status !== "running" && s.status !== "stopping") {
        loadCandidates();
        loadMeta();
      }
    }, 2000);
    return () => clearInterval(id);
  }, [running, loadScan, loadCandidates, loadMeta]);

  // salva pesos/horário no servidor (com debounce para os sliders)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saveSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    }, 400);
  }, []);

  const tier = meta?.tier ?? null;
  const totalBosses = tier?.totalBosses ?? 0;

  const rows: Row[] = useMemo(() => {
    if (!candidates) return [];
    const scored = candidates.map((c) => ({ c, s: scoreCandidate(c, settings, tier), guildPos: 0, guildSize: 0 }));
    const byGuild = new Map<string, Row[]>();
    for (const r of scored) if (r.c.guildId) byGuild.set(r.c.guildId, [...(byGuild.get(r.c.guildId) ?? []), r]);
    for (const list of byGuild.values()) {
      list.sort((a, b) => (b.s.total ?? -1) - (a.s.total ?? -1));
      list.forEach((r, i) => ((r.guildPos = i + 1), (r.guildSize = list.length)));
    }
    return scored;
  }, [candidates, settings, tier]);

  const filtered = useMemo(() => sortRows(applyFilters(rows, filters), sort.key, sort.dir), [rows, filters, sort]);
  const realms = useMemo(
    () => [...new Set(rows.map((r) => r.c.guildRealm ?? r.c.realmName).filter((x): x is string => Boolean(x)))].sort(),
    [rows],
  );
  const guilds = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) if (r.c.guildId) m.set(r.c.guildId, `${r.c.guildName} (${r.c.guildRealm})`);
    return [...m.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);
  const counts = useMemo(
    () => ({
      all: rows.length,
      guild: rows.filter((r) => r.c.kind === "guild").length,
      standalone: rows.filter((r) => r.c.kind === "standalone").length,
      targets: rows.filter((r) => r.c.target).length,
    }),
    [rows],
  );
  const targetCount = counts.targets;
  const detailRow = useMemo(() => rows.find((r) => r.c.id === detailId) ?? null, [rows, detailId]);

  const onSort = (key: SortKey) =>
    setSort(sort.key === key ? { key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" });

  const setTarget = useCallback(async (charId: string, status: string | null, note?: string | null) => {
    setCandidates((list) =>
      list
        ? list.map((c) =>
            c.id === charId ? { ...c, target: status ? { status, note: note ?? c.target?.note ?? null } : null } : c,
          )
        : list,
    );
    await fetch("/api/targets", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ charId, status, note }),
    });
  }, []);

  const startScan = async (p: ScanParams) => {
    const res = await fetch("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) });
    const j = await res.json();
    if (!res.ok) return j.error ?? "Não foi possível iniciar o scan";
    setScan({ ...j, budget: scan?.budget ?? null });
    return null;
  };
  const stopScan = async () => setScan({ ...(await fetch("/api/scan", { method: "DELETE" }).then((r) => r.json())), budget: scan?.budget ?? null });

  const importLog = async (url: string) => {
    const res = await fetch("/api/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
    const j = await res.json();
    if (!res.ok) return { error: j.error ?? "Não foi possível importar o log" };
    loadCandidates();
    const vis = j.visibility === "unlisted" ? "não listado" : "público";
    return { ok: `“${j.title}” (${vis}): ${j.players} jogadores adicionados aos avulsos${j.mythic ? "" : " — o log não tem lutas míticas"}.` };
  };

  const budget = scan?.budget ?? meta?.budget ?? null;
  const active = activeFilterCount(filters);

  const filterPanel = (
    <FilterPanel
      filters={filters}
      onChange={setFilters}
      weights={settings.weights}
      onWeights={(w) => saveSettings({ weights: w })}
      realms={realms}
      guilds={guilds}
      totalBosses={totalBosses || 8}
    />
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <div className="mr-auto min-w-0">
            <h1 className="text-base font-semibold tracking-tight">Poachnomic 3000</h1>
            <p className="truncate text-xs text-muted">
              {tier ? `${tier.raidName} · ${tier.totalBosses} bosses míticos` : meta?.error ? "Tier não carregado" : "Carregando tier…"}
            </p>
          </div>
          {budget && (
            <p className="text-xs text-muted tabular" title="Pontos da API da Warcraft Logs usados nesta hora">
              WCL: {fmtInt(budget.spent)} / {fmtInt(budget.limitPerHour)} pts
            </p>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
          >
            <Clock size={15} aria-hidden />
            Nosso horário
          </button>
          <button
            type="button"
            onClick={() => setScanOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg hover:opacity-90"
          >
            {running ? <Loader2 size={15} className="motion-safe:animate-spin" aria-hidden /> : <Radar size={15} aria-hidden />}
            {running ? `Escaneando ${scan?.guildsDone ?? 0}/${scan?.guildsTotal || "…"}` : "Escanear"}
          </button>
        </div>
      </header>

      {(meta?.error || loadError) && (
        <div role="alert" className="mx-4 mt-3 flex flex-wrap items-center gap-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
          <span>
            {meta?.error ? `Não consegui carregar o tier atual: ${meta.error}.` : `Não consegui carregar a lista: ${loadError}.`} Verifique
            a conexão e tente de novo.
          </span>
          <button
            type="button"
            onClick={() => {
              loadMeta();
              loadCandidates();
            }}
            className="rounded-md border border-line bg-surface px-2.5 py-1 font-medium hover:bg-surface-2"
          >
            Tentar de novo
          </button>
        </div>
      )}

      <div className="flex flex-1 gap-4 p-4">
        <aside aria-label="Filtros" className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pr-1">{filterPanel}</div>
        </aside>

        <main className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Lista" className="inline-flex rounded-md border border-line bg-surface p-0.5 text-sm">
              {(
                [
                  ["all", `Todos (${fmtInt(counts.all)})`],
                  ["guild", `Em guildas (${fmtInt(counts.guild)})`],
                  ["standalone", `Avulsos (${fmtInt(counts.standalone)})`],
                  ["targets", `Alvos (${fmtInt(targetCount)})`],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={filters.view === v}
                  onClick={() => setFilters({ ...filters, view: v })}
                  className="rounded px-3 py-1 font-medium text-muted aria-pressed:bg-surface-2 aria-pressed:text-text"
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-2 lg:hidden"
            >
              <SlidersHorizontal size={15} aria-hidden />
              Filtros{active ? ` (${active})` : ""}
            </button>
            <p className="ml-auto text-sm text-muted tabular" aria-live="polite">
              {candidates
                ? `${fmtInt(filtered.length)} personagens · ${fmtInt(new Set(filtered.map((r) => r.c.guildId).filter(Boolean)).size)} guildas`
                : ""}
            </p>
          </div>

          {!candidates ? (
            <p className="py-10 text-center text-sm text-muted">Carregando personagens…</p>
          ) : rows.length === 0 ? (
            <Empty
              title={running ? "Escaneando as primeiras guildas…" : "Nenhuma guilda escaneada ainda"}
              body={
                running
                  ? "Os personagens aparecem aqui conforme cada guilda termina."
                  : "Escolha os realms e a faixa de progresso para montar a lista de raiders."
              }
              action={running ? undefined : { label: "Escanear guildas", onClick: () => setScanOpen(true) }}
            />
          ) : filtered.length === 0 ? (
            filters.view === "targets" && targetCount === 0 ? (
              <Empty title="Nenhum alvo ainda" body="Marque a estrela de um personagem para acompanhar o contato com ele aqui." />
            ) : filters.view === "standalone" && counts.standalone === 0 ? (
              <Empty
                title="Nenhum jogador avulso ainda"
                body="Rode um scan com “Procurar jogadores avulsos” ligado, ou importe o link de um log de pug."
                action={{ label: "Abrir scan", onClick: () => setScanOpen(true) }}
              />
            ) : (
              <Empty
                title="Ninguém passa nesses filtros"
                body="Afrouxe os mínimos ou limpe os filtros para ver mais personagens."
                action={{ label: "Limpar filtros", onClick: () => setFilters({ ...DEFAULT_FILTERS, view: filters.view }) }}
              />
            )
          ) : (
            <CandidateTable
              rows={filtered}
              sort={sort}
              onSort={onSort}
              onOpen={setDetailId}
              onToggleTarget={(r) => setTarget(r.c.id, r.c.target ? null : "watch")}
              weights={settings.weights}
              totalBosses={totalBosses}
            />
          )}
        </main>
      </div>

      <DetailSheet row={detailRow} settings={settings} tier={tier} onClose={() => setDetailId(null)} onTarget={setTarget} />
      <ScanDialog
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        status={scan}
        onStart={startScan}
        onStop={stopScan}
        onImport={importLog}
        totalBosses={totalBosses}
        wclConfigured={meta?.wclConfigured ?? true}
      />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} onSave={saveSettings} />
      <FiltersSheet open={filtersOpen} onClose={() => setFiltersOpen(false)}>
        {filterPanel}
      </FiltersSheet>
    </div>
  );
}

function Empty({ title, body, action }: { title: string; body: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-surface px-6 py-14 text-center">
      <h2 className="font-semibold">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted text-pretty">{body}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg hover:opacity-90"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function FiltersSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="sheet" aria-label="Filtros" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="flex h-full flex-col">
        <div className="flex justify-end border-b border-line p-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar filtros"
            className="grid h-10 w-10 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </dialog>
  );
}
