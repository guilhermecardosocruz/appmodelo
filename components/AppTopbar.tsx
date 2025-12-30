import Link from "next/link";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export function AppTopbar() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200/60 bg-white/85 backdrop-blur dark:border-slate-800/60 dark:bg-slate-950/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link
          href="/"
          className="text-sm font-semibold text-slate-900 hover:opacity-80 dark:text-slate-50"
        >
          Eventos
        </Link>

        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
