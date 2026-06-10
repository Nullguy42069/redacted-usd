"use client";
import { createContext, useContext, useEffect, useState, useMemo } from "react";
import type { ThemeMode } from "@/lib/theme";

const STORAGE_KEY = "redacted-theme-mode";

type Ctx = {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
};

const ThemeModeContext = createContext<Ctx | null>(null);

export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  // Default to dark to match historical default. On mount, read localStorage —
  // accepts a brief flash on first paint if the user prefers light. Avoiding the
  // flash requires an inline <script> in document head that we can add later.
  const [mode, setModeState] = useState<ThemeMode>("dark");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "light" || stored === "dark") setModeState(stored);
    } catch {}
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    try { localStorage.setItem(STORAGE_KEY, m); } catch {}
  };

  const value = useMemo<Ctx>(() => ({
    mode,
    setMode,
    toggle: () => setMode(mode === "dark" ? "light" : "dark"),
  }), [mode]);

  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode(): Ctx {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error("useThemeMode must be used inside ThemeModeProvider");
  return ctx;
}
