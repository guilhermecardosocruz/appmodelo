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
        // posição ajustada (não cobre header)
        "fixed right-4 top-16 z-40",

        // visual
        "rounded-full px-4 py-2 text-sm font-semibold",
        "border border-slate-200/30",
        "bg-white/85 text-slate-900 shadow-lg backdrop-blur",

        // dark
        "dark:bg-slate-900/80 dark:text-slate-50 dark:border-slate-700/60",

        "hover:scale-[1.02] active:scale-[0.98] transition",
        className,
      ].join(" ")}
    >
      {theme === "dark" ? "☀️ Claro" : "🌙 Escuro"}
    </button>
  );
}
