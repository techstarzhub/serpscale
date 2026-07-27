"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  THEME_MODE_KEY,
  THEME_STORAGE_KEY,
  type ThemeMode,
  type ThemeOverrides,
} from "./theme-config";

interface ThemeContextValue {
  overrides: ThemeOverrides;
  mode: ThemeMode;
  setToken: (key: string, value: string) => void;
  resetToken: (key: string) => void;
  resetAll: () => void;
  applyMany: (values: ThemeOverrides) => void;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyVar(key: string, value: string | null) {
  const root = document.documentElement;
  if (value === null) root.style.removeProperty(`--${key}`);
  else root.style.setProperty(`--${key}`, value);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<ThemeOverrides>({});
  const [mode, setModeState] = useState<ThemeMode>("light");

  // Load saved theme once on mount and apply it.
  useEffect(() => {
    try {
      const savedMode = (localStorage.getItem(THEME_MODE_KEY) as ThemeMode) || "light";
      setModeState(savedMode);
      document.documentElement.classList.toggle("dark", savedMode === "dark");

      const raw = localStorage.getItem(THEME_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as ThemeOverrides;
        setOverrides(saved);
        Object.entries(saved).forEach(([k, v]) => applyVar(k, v));
      }
    } catch {
      // ignore malformed storage
    }
  }, []);

  const persist = useCallback((next: ThemeOverrides) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage may be unavailable; live theme still works
    }
  }, []);

  const setToken = useCallback(
    (key: string, value: string) => {
      setOverrides((prev) => {
        const next = { ...prev, [key]: value };
        persist(next);
        return next;
      });
      applyVar(key, value);
    },
    [persist],
  );

  const resetToken = useCallback(
    (key: string) => {
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[key];
        persist(next);
        return next;
      });
      applyVar(key, null); // fall back to globals.css default
    },
    [persist],
  );

  const resetAll = useCallback(() => {
    setOverrides((prev) => {
      Object.keys(prev).forEach((k) => applyVar(k, null));
      return {};
    });
    persist({});
  }, [persist]);

  const applyMany = useCallback(
    (values: ThemeOverrides) => {
      setOverrides((prev) => {
        const next = { ...prev, ...values };
        persist(next);
        return next;
      });
      Object.entries(values).forEach(([k, v]) => applyVar(k, v));
    },
    [persist],
  );

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem(THEME_MODE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const toggleMode = useCallback(() => {
    setMode(mode === "dark" ? "light" : "dark");
  }, [mode, setMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ overrides, mode, setToken, resetToken, resetAll, applyMany, setMode, toggleMode }),
    [overrides, mode, setToken, resetToken, resetAll, applyMany, setMode, toggleMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
