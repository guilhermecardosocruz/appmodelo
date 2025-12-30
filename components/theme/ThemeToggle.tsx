"use client";

import { useState } from "react";
import type { Theme } from "@/components/theme/ThemeProvider";

declare global {
  interface Window {
    __setTheme?: (t: Theme) => void;
    __getTheme?: () => Theme;
  }
}

function readCurrentTheme(): Theme {
  // pode estar indefinido no primeiro render/hidratação
  return window.__getTheme?.() ?? "dark";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    return readCurrentTheme();
  });

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    window.__setTheme?.(next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text)] hover:bg-[var(--cardHover)]"
      aria-label="Alternar tema"
      title={theme === "dark" ? "Mudar para claro" : "Mudar para escuro"}
    >
      {theme === "dark" ? "☀️ Claro" : "🌙 Escuro"}
    </button>
  );
}
