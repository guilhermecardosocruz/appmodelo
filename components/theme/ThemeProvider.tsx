"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Theme = "dark" | "light";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
};

declare global {
  interface Window {
    __theme?: Theme;
    __setTheme?: (t: Theme) => void;
    __getTheme?: () => Theme;
  }
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";

  // 1) window hook (se existir)
  const fromHook = window.__getTheme?.();
  if (fromHook === "dark" || fromHook === "light") return fromHook;

  // 2) localStorage
  try {
    const v = window.localStorage.getItem("theme");
    if (v === "dark" || v === "light") return v;
  } catch {
    // ignore
  }

  // 3) preferência do sistema
  try {
    const prefersDark =
      window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  } catch {
    return "dark";
  }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement; // <html>
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  root.dataset.theme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

  useEffect(() => {
    applyTheme(theme);

    try {
      window.localStorage.setItem("theme", theme);
    } catch {
      // ignore
    }

    window.__theme = theme;
    window.__setTheme = (t: Theme) => setTheme(t);
    window.__getTheme = () => theme;
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
