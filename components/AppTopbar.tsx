"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

type MeResponse =
  | { authenticated: true; user: { id: string; name: string; email: string } }
  | { authenticated: false };

export function AppTopbar() {
  const router = useRouter();
  const pathname = usePathname();

  const [me, setMe] = useState<MeResponse | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const isAuthed = me?.authenticated === true;
  const userName = isAuthed ? me.user.name : null;

  const showAuthUI = useMemo(() => {
    // Em páginas de auth, não precisa mostrar menu de usuário
    return !(pathname?.startsWith("/login") || pathname?.startsWith("/register") || pathname?.startsWith("/recover") || pathname?.startsWith("/reset"));
  }, [pathname]);

  useEffect(() => {
    let active = true;

    async function loadMe() {
      try {
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
      }
    }

    void loadMe();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuOpen) return;
      const el = menuRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    } finally {
      setMenuOpen(false);
      setMe({ authenticated: false });
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-[var(--border)] bg-card-strong backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-sm font-semibold text-app hover:opacity-80">
          Eventos
        </Link>

        <div className="flex items-center gap-3">
          {/* Desktop nav */}
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

          {/* Mobile user menu */}
          {showAuthUI && (
            <div className="relative sm:hidden" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-card px-3 py-1.5 text-xs font-semibold text-app hover:opacity-90"
                aria-expanded={menuOpen}
                aria-label="Abrir menu"
              >
                {isAuthed ? (
                  <>
                    <span>Olá, {userName?.split(" ")?.[0] ?? "usuário"}</span>
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  </>
                ) : (
                  <span>Menu</span>
                )}
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-52 overflow-hidden rounded-2xl border border-[var(--border)] bg-card shadow-xl">
                  <Link
                    href="/dashboard"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-3 text-xs font-medium text-app hover:bg-card/70"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/ingressos"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-3 text-xs font-medium text-app hover:bg-card/70"
                  >
                    Meus ingressos
                  </Link>

                  <div className="h-px bg-[var(--border)]" />

                  {isAuthed ? (
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full px-4 py-3 text-left text-xs font-semibold text-red-400 hover:bg-card/70"
                    >
                      Sair
                    </button>
                  ) : (
                    <Link
                      href={`/login?next=${encodeURIComponent(pathname || "/dashboard")}`}
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-3 text-xs font-semibold text-emerald-400 hover:bg-card/70"
                    >
                      Entrar
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Desktop user pill */}
          {showAuthUI && isAuthed && (
            <div className="hidden sm:inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-card px-3 py-1.5 text-xs font-semibold text-app">
              <span>Olá, {userName?.split(" ")?.[0] ?? "usuário"}</span>
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            </div>
          )}

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
