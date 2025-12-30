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
        "inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold",
        "border border-slate-200/60 bg-white text-slate-900 shadow-sm",
        "hover:bg-slate-50 active:scale-[0.99] transition",
        "dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-50 dark:hover:bg-slate-900",
        className,
      ].join(" ")}
    >
      {theme === "dark" ? "☀️ Claro" : "🌙 Escuro"}
    </button>
  );
}
