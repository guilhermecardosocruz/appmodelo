"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

type EventType = "PRE_PAGO" | "POS_PAGO" | "FREE";

type EventInfo = {
  id: string;
  name: string;
  type: EventType;
  organizerName: string | null;
};

type Guest = {
  id: string;
  name: string;
  confirmedAt: string | null;
};

type GuestFilter = "all" | "invited" | "confirmed";

export default function ListaParticipantesPage() {
  const params = useParams() as { id?: string };
  const router = useRouter();
  const eventId = String(params?.id ?? "").trim();

  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<GuestFilter>("all");

  useEffect(() => {
    let active = true;

    async function load() {
      if (!eventId) {
        setError("Evento não encontrado.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const res = await fetch(
          `/api/events/${encodeURIComponent(eventId)}/public-participants`,
          { cache: "no-store" },
        );

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          if (!active) return;
          setError(
            (data && typeof data.error === "string"
              ? data.error
              : "Erro ao carregar participantes.") as string,
          );
          return;
        }

        const data = (await res.json().catch(() => null)) as
          | { event: EventInfo; guests: Guest[] }
          | null;

        if (!active) return;

        if (!data?.event) {
          setError("Evento não encontrado.");
          return;
        }

        setEvent(data.event);
        setGuests(data.guests ?? []);
      } catch (err) {
        console.error("[ListaParticipantesPage] erro:", err);
        if (!active) return;
        setError("Erro inesperado ao carregar participantes.");
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [eventId]);

  const sortedGuests = useMemo(
    () =>
      [...guests].sort((a, b) =>
        a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }),
      ),
    [guests],
  );

  const filteredGuests = sortedGuests.filter((g) => {
    const isConfirmed = !!g.confirmedAt;
    if (filter === "confirmed") return isConfirmed;
    if (filter === "invited") return !isConfirmed;
    return true;
  });

  const totalConfirmed = guests.filter((g) => !!g.confirmedAt).length;

  return (
    <div className="min-h-screen bg-app text-app flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="text-xs font-medium text-muted hover:text-app"
        >
          ← Voltar para eventos
        </button>

        <span className="inline-flex items-center rounded-full bg-card px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted border border-[var(--border)]">
          Lista de participantes
        </span>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-3xl w-full mx-auto flex flex-col gap-4">
        {loading && (
          <p className="text-sm text-muted">Carregando informações do evento...</p>
        )}

        {!loading && error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        {!loading && !error && event && (
          <>
            <section className="rounded-2xl border border-[var(--border)] bg-card p-4 sm:p-6 flex flex-col gap-2">
              <h1 className="text-lg sm:text-xl font-semibold text-app">
                {event.name}
              </h1>
              <p className="text-xs text-muted">
                Tipo de evento:{" "}
                <span className="font-semibold text-app">
                  {event.type === "FREE"
                    ? "FREE"
                    : event.type === "PRE_PAGO"
                    ? "PRÉ PAGO"
                    : "PÓS PAGO"}
                </span>
              </p>
              {event.organizerName && (
                <p className="text-xs text-muted">
                  Organizado por{" "}
                  <span className="font-semibold text-app">
                    {event.organizerName}
                  </span>
                </p>
              )}
              <p className="text-[11px] text-app0 mt-1">
                Esta é uma visão simples dos participantes do evento. Você pode
                compartilhar este link com outras pessoas, se quiser mostrar a
                lista de presença.
              </p>
            </section>

            <section className="rounded-2xl border border-[var(--border)] bg-card p-4 sm:p-6 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col">
                  <h2 className="text-sm font-semibold text-app">
                    Participantes
                  </h2>
                  <p className="text-[11px] text-app0">
                    Total de convidados:{" "}
                    <span className="font-semibold">{guests.length}</span> ·{" "}
                    Confirmados:{" "}
                    <span className="font-semibold">{totalConfirmed}</span>
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setFilter("all")}
                    className={`rounded-full px-3 py-1 text-[11px] border ${
                      filter === "all"
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-app text-app border-[var(--border)]"
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter("invited")}
                    className={`rounded-full px-3 py-1 text-[11px] border ${
                      filter === "invited"
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-app text-app border-[var(--border)]"
                    }`}
                  >
                    Convidados
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter("confirmed")}
                    className={`rounded-full px-3 py-1 text-[11px] border ${
                      filter === "confirmed"
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-app text-app border-[var(--border)]"
                    }`}
                  >
                    Confirmados
                  </button>
                </div>
              </div>

              {filteredGuests.length === 0 ? (
                <p className="text-[11px] text-app0">
                  Nenhum participante encontrado para o filtro selecionado.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-[var(--border)]">
                  {filteredGuests.map((guest, index) => {
                    const isConfirmed = !!guest.confirmedAt;
                    return (
                      <li
                        key={guest.id}
                        className="py-2 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-6 text-[11px] text-app0">
                            #{index + 1}
                          </span>
                          <span className="text-sm text-app">
                            {guest.name}
                          </span>
                        </div>
                        <span className="text-[11px]">
                          {isConfirmed ? (
                            <span className="text-emerald-500">
                              Confirmado
                            </span>
                          ) : (
                            <span className="text-muted">Convidado</span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {eventId && (
              <section className="rounded-2xl border border-[var(--border)] bg-card p-4 sm:p-6 flex flex-col gap-2">
                <span className="text-xs font-medium text-muted">
                  Atalho para organização
                </span>
                <p className="text-[11px] text-app0">
                  Se você é o organizador e está logado, pode voltar para a tela
                  completa de configurações do evento:
                </p>
                <Link
                  href={`/eventos/${eventId}/free`}
                  className="inline-flex w-max items-center rounded-lg border border-[var(--border)] bg-app px-3 py-1.5 text-[11px] font-semibold text-app hover:bg-card/70"
                >
                  Abrir configurações do evento
                </Link>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
