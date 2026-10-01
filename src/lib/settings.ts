import { getSetting, setSetting } from "./db";
import { DEFAULT_SETTINGS, type Settings } from "./types";

/** Configurações salvas, completadas com os padrões (inclusive pesos novos que não existiam quando foram salvas). */
export function readSettings(): Settings {
  const stored = getSetting<Partial<Settings>>("settings", {});
  return { ...DEFAULT_SETTINGS, ...stored, weights: { ...DEFAULT_SETTINGS.weights, ...stored.weights } };
}

export function writeSettings(patch: Partial<Settings>): Settings {
  const current = readSettings();
  const next = { ...current, ...patch, weights: { ...current.weights, ...patch.weights } };
  setSetting("settings", next);
  return next;
}
