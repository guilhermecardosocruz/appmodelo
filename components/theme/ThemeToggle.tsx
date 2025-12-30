"use client";

import { useTheme } from "@/components/theme/ThemeProvider";

type Props = {
  className?: string;
};

export function ThemeToggle({ className = "" }: Props) {
  const { theme, toggleTheme } = useTheme();

  const label = theme === "dark" ? "Modo claro" : "Modo escuro";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={[
        "fixed right-4 top-4 z-50",
        "rounded-full px-4 py-2 text-sm font-semibold",
        "border border-slate-200/20",
        "bg-white/80 text-slate-900 shadow-lg backdrop-blur",
        "dark:bg-slate-900/70 dark:text-slate-50 dark:border-slate-700/60",
        "hover:scale-[1.02] active:scale-[0.98] transition",
        className,
      ].join(" ")}
    >
      {theme === "dark" ? "☀️ Claro" : "🌙 Escuro"}
    </button>
  );
}
