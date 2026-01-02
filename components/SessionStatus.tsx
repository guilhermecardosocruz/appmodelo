"use client";

import { useEffect, useState } from "react";

type MeOk = {
  authenticated: true;
  user: { id: string; name: string; email: string };
};

type MeNo = { authenticated: false };

type MeResponse = MeOk | MeNo;

export default function SessionStatus() {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await fetch("/api/auth/me", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });

        const data = (await res.json().catch(() => null)) as MeResponse | null;
        if (!alive) return;

        if (data) setMe(data);
        else setMe({ authenticated: false });
      } catch {
        if (!alive) return;
        setMe({ authenticated: false });
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, []);

  const authenticated = !!me && me.authenticated === true;
  const label = authenticated ? (me.user.name?.trim() || me.user.email) : "Visitante";

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-card px-3 py-1 text-[11px] text-app shadow-sm"
      title={authenticated ? "Sessão reconhecida" : "Sem sessão (não logado)"}
    >
      <span className={loading ? "text-muted" : ""}>
        {loading ? "Verificando sessão..." : `Olá, ${label}`}
      </span>
      <span
        className={`h-2 w-2 rounded-full ${authenticated ? "bg-emerald-500" : "bg-red-500"}`}
        aria-hidden="true"
      />
    </div>
  );
}
