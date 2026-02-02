"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type EventForInvite = {
  id: string;
  name: string;
  description?: string | null;
  location?: string | null;
  eventDate?: string | null;
};

type InviteResponse = {
  event: EventForInvite;
  loggedIn: boolean;
  alreadyParticipant: boolean;
};

type Props = {
  slug: string;
};

function formatDate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function RachaInviteClient({ slug }: Props) {
  const [data, setData] = useState<InviteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

  // normaliza o slug vindo da URL:
  // - se for vazio ou literalmente "undefined", tratamos como link inválido
  const safeSlug = useMemo(
    () => (slug && slug !== "undefined" ? slug : ""),
    [slug],
  );

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        if (!safeSlug) {
          if (!active) return;
          setError('Convite inválido: link sem identificador.');
          setData(null);
          return;
        }

        const res = await fetch(`/api/racha/${encodeURIComponent(safeSlug)}`);
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          if (!active) return;
          setError(
            body?.error ??
              `Convite não encontrado ou inválido (slug="${safeSlug}")`,
          );
          setData(null);
          return;
        }

        const body = (await res.json()) as InviteResponse;
        if (!active) return;
        setData(body);
      } catch (err) {
        console.error("[RachaInviteClient] Erro ao carregar convite:", err);
        if (!active) return;
        setError("Erro inesperado ao carregar convite.");
        setData(null);
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [safeSlug]);

  async function handleJoin() {
    try {
      setJoining(true);
      setError(null);

      if (!safeSlug) {
        setError('Convite inválido: link sem identificador.');
        return;
      }

      const res = await fetch(`/api/racha/${encodeURIComponent(safeSlug)}`, {
        method: "POST",
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(body?.error ?? "Erro ao entrar no racha.");
        return;
      }

      const body = (await res.json()) as {
        alreadyParticipant?: boolean;
      };

      setJoined(true);
      setData((prev) =>
        prev
          ? {
              ...prev,
              alreadyParticipant:
                prev.alreadyParticipant || !!body.alreadyParticipant,
            }
          : prev,
      );
    } catch (err) {
      console.error("[RachaInviteClient] Erro ao entrar no racha:", err);
      setError("Erro inesperado ao entrar no racha.");
    } finally {
      setJoining(false);
    }
  }

  const event = data?.event ?? null;
  const loginHref = `/login?next=${encodeURIComponent(
    safeSlug ? `/racha/${safeSlug}` : "/dashboard/",
  )}`;
  const registerHref = `/register?next=${encodeURIComponent(
    safeSlug ? `/racha/${safeSlug}` : "/dashboard/",
  )}`;

  return (
    <div className="min-h-screen bg-app text-app flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
        <Link
          href="/dashboard/"
          className="text-xs font-medium text-muted hover:text-app"
        >
          ← Eventos
        </Link>
        <span className="inline-flex items-center rounded-full bg-card px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted border border-[var(--border)]">
          Convite para racha
        </span>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-lg w-full mx-auto flex flex-col gap-4">
        {loading && <p className="text-sm text-muted">Carregando convite...</p>}

        {error && !loading && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/5 p-4">
            <p className="text-sm text-red-500">{error}</p>
            {safeSlug && (
              <p className="text-[11px] text-red-400 mt-1">
                (slug recebido: &quot;{safeSlug}&quot;)
              </p>
            )}
          </div>
        )}

        {!loading && !error && event && (
          <section className="flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-card p-5">
            <div className="space-y-1">
              <h1 className="text-lg sm:text-xl font-semibold text-app">
                {event.name}
              </h1>
              <p className="text-sm text-muted">
                Você foi convidado para entrar na divisão de despesas deste
                evento.
              </p>
            </div>

            <div className="space-y-2 text-sm">
              {event.eventDate && (
                <p className="text-app">
                  <span className="font-medium text-muted">Data: </span>
                  {formatDate(event.eventDate)}
                </p>
              )}
              {event.location && (
                <p className="text-app">
                  <span className="font-medium text-muted">Local: </span>
                  {event.location}
                </p>
              )}
              {event.description && (
                <p className="text-app">
                  <span className="font-medium text-muted">Descrição: </span>
                  {event.description}
                </p>
              )}
            </div>

            {data?.loggedIn ? (
              <div className="space-y-2">
                {data.alreadyParticipant || joined ? (
                  <>
                    <p className="text-sm text-emerald-500 font-medium">
                      Você já está participando deste racha.
                    </p>
                    <p className="text-[11px] text-app0">
                      Abra o app normalmente para lançar despesas e ver o
                      resumo do acerto.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted">
                      Clique abaixo para entrar na divisão de despesas deste
                      evento.
                    </p>
                    <button
                      type="button"
                      disabled={joining}
                      onClick={() => void handleJoin()}
                      className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60 w-full"
                    >
                      {joining ? "Entrando..." : "Entrar no racha"}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted">
                  Para entrar no racha, você precisa fazer login ou criar uma
                  conta gratuita.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Link
                    href={loginHref}
                    className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 w-full"
                  >
                    Fazer login e entrar no racha
                  </Link>
                  <Link
                    href={registerHref}
                    className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-app px-4 py-2 text-sm font-semibold text-app hover:bg-card w-full"
                  >
                    Criar conta
                  </Link>
                </div>
                <p className="text-[11px] text-app0">
                  Depois de finalizar o login ou cadastro, volte para este link
                  para confirmar sua participação.
                </p>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
