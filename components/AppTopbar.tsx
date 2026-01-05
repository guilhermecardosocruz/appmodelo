"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

type User = {
  id?: string;
  name?: string | null;
  email?: string | null;
};

export function AppTopbar() {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const isAuthed = !!user?.id;

  const firstName = useMemo(() => {
    if (!user?.name) return "usuário";
    return user.name.split(" ")[0];
  }, [user]);

  const showAuthUI = useMemo(() => {
    return !(
      pathname?.startsWith("/login") ||
      pathname?.startsWith("/register") ||
      pathname?.startsWith("/recover") ||
      pathname?.startsWith("/reset")
    );
  }, [pathname]);

  useEffect(() => {
    let active = true;

    async function loadMe() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!active) return;

        if (!res.ok) {
          setUser(null);
          return;
        }

        const data = await res.json().catch(() => null);

        // aceita qualquer formato razoável
        const u =
          data?.user ??
          data?.me ??
          data ??
          null;

        if (u && typeof u === "object") {
          setUser({
            id: u.id,
            name: u.name,
            email: u.email,
          });
        } else {
          setUser(null);
        }
      } catch {
        if (!active) return;
        setUser(null);
      } finally {
        if (active) setLoaded(true);
      }
    }

    loadMe();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!menuOpen) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    } finally {
      setUser(null);
      setMenuOpen(false);
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
          {showAuthUI && loaded && (
            <div className="relative sm:hidden" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-card px-3 py-1.5 text-xs font-semibold text-app"
              >
                {isAuthed ? (
                  <>
                    <span>Olá, {firstName}</span>
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  </>
                ) : (
                  <span>Menu</span>
                )}
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-52 rounded-2xl border border-[var(--border)] bg-card shadow-xl overflow-hidden">
                  <Link
                    href="/dashboard"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-3 text-xs font-medium hover:bg-card/70"
                  >
                    Dashboard
                  </Link>

                  <Link
                    href="/ingressos"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-3 text-xs font-medium hover:bg-card/70"
                  >
                    Meus ingressos
                  </Link>

                  <div className="h-px bg-[var(--border)]" />

                  {isAuthed ? (
                    <button
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

          {/* Desktop pill */}
          {showAuthUI && isAuthed && (
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-[var(--border)] bg-card px-3 py-1.5 text-xs font-semibold">
              <span>Olá, {firstName}</span>
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            </div>
          )}

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
