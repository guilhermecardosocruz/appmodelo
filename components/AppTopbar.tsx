import Link from "next/link";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export function AppTopbar() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-[var(--border)] bg-card-strong backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link
          href="/"
          className="text-sm font-semibold text-app hover:opacity-80"
        >
          Eventos
        </Link>

        <div className="flex items-center gap-3">
          <nav className="hidden sm:flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-xs font-medium text-muted hover:opacity-80"
            >
              Dashboard
            </Link>
            <Link
              href="/ingressos"
              className="text-xs font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
            >
              Meus ingressos
            </Link>
          </nav>

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
