"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type Theme = "dark" | "light";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";

  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;

  // default: dark
  return "dark";
}

function applyThemeToDom(theme: Theme) {
  const root = document.documentElement; // <html>
  root.dataset.theme = theme; // data-theme="..."
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, _setTheme] = useState<Theme>(() => readInitialTheme());

  // aplica no DOM na primeira render client
  if (typeof window !== "undefined") {
    applyThemeToDom(theme);
  }

  const setTheme = useCallback((next: Theme) => {
    _setTheme(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("theme", next);
      applyThemeToDom(next);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [setTheme, theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
