"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";
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
  const pathname = usePathname();
  // Theme customization is a DASHBOARD-only concept. Everywhere else (the sign-in
  // form, marketing) must stay on the default brand look.
  const inDashboard = (pathname ?? "").startsWith("/dashboard");

  // Load any saved theme into state on mount. No DOM writes here — the
  // route-scoped effect below owns the DOM so the theme only ever paints inside
  // the dashboard.
  useEffect(() => {
    try {
      const savedMode = (localStorage.getItem(THEME_MODE_KEY) as ThemeMode) || "light";
      setModeState(savedMode);
      const raw = localStorage.getItem(THEME_STORAGE_KEY);
      if (raw) setOverrides(JSON.parse(raw) as ThemeOverrides);
    } catch {
      // ignore malformed storage
    }
  }, []);

  // Inside the dashboard we paint the user's tokens; anywhere else we strip them
  // AND forget the saved theme. This is what keeps one user's customization off
  // the login page and out of the next user who signs in on the same browser.
  useEffect(() => {
    const root = document.documentElement;
    if (inDashboard) {
      Object.entries(overrides).forEach(([k, v]) => applyVar(k, v));
      root.classList.toggle("dark", mode === "dark");
    } else {
      Object.keys(overrides).forEach((k) => applyVar(k, null));
      root.classList.remove("dark");
      try {
        localStorage.removeItem(THEME_STORAGE_KEY);
        localStorage.removeItem(THEME_MODE_KEY);
      } catch {
        // ignore
      }
      if (Object.keys(overrides).length) setOverrides({});
      if (mode !== "light") setModeState("light");
    }
  }, [inDashboard, overrides, mode]);

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
