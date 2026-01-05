"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

type MeResponse =
  | { authenticated: true; user: { id: string; name: string; email: string } }
  | { authenticated: false };

export function AppTopbar() {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MeResponse>({ authenticated: false });

  useEffect(() => {
    let active = true;

    async function loadMe() {
      try {
        setLoading(true);
        const res = await fetch("/api/auth/me", { cache: "no-store" });

        if (!active) return;

        if (!res.ok) {
          setMe({ authenticated: false });
          return;
        }

        const data = (await res.json()) as MeResponse;
        setMe(data);
      } catch {
        if (!active) return;
        setMe({ authenticated: false });
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }

    void loadMe();
    return () => {
      active = false;
    };
  }, [pathname]);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.refresh();
      router.push("/login");
    }
  }

  const isAuthed = me.authenticated === true;
  const userName = isAuthed ? me.user.name : null;

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-[var(--border)] bg-card-strong backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-sm font-semibold text-app hover:opacity-80">
          Eventos
        </Link>

        <div className="flex items-center gap-3">
          <nav className="hidden sm:flex items-center gap-3">
            <Link href="/dashboard" className="text-xs font-medium text-muted hover:opacity-80">
              Dashboard
            </Link>
            <Link
              href="/ingressos"
              className="text-xs font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
            >
              Meus ingressos
            </Link>
          </nav>

          <div className="hidden sm:flex items-center gap-2">
            {loading ? (
              <span className="text-[11px] text-muted">…</span>
            ) : isAuthed ? (
              <>
                <span className="text-[11px] text-muted">
                  Olá, <span className="font-semibold text-app">{userName}</span>
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-[11px] font-semibold text-red-500 hover:text-red-400"
                >
                  Sair
                </button>
              </>
            ) : (
              <Link
                href={`/login?next=${encodeURIComponent(pathname || "/dashboard")}`}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200"
              >
                Entrar
              </Link>
            )}
          </div>

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
