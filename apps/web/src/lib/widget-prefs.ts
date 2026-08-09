"use client";

// Client-side visibility preferences for the floating widgets (AI Copilot +
// Support). Persisted in localStorage and synced live across every consumer
// (the widgets + the profile settings toggles) via a custom event.
import { useEffect, useState } from "react";

export type WidgetKey = "copilot" | "support";
type Prefs = { copilot: boolean; support: boolean }; // true = visible
const KEY = "serpscale:widget-prefs";
const DEFAULT: Prefs = { copilot: true, support: true };
const EVENT = "serpscale:widget-prefs";

function read(): Prefs {
  if (typeof window === "undefined") return DEFAULT;
  try { return { ...DEFAULT, ...(JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<Prefs>) }; }
  catch { return DEFAULT; }
}
function write(p: Prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function useWidgetPrefs() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT);
  useEffect(() => {
    setPrefs(read());
    const sync = () => setPrefs(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);
  const setVisible = (k: WidgetKey, v: boolean) => { const next = { ...read(), [k]: v }; write(next); setPrefs(next); };
  return { prefs, setVisible };
}
