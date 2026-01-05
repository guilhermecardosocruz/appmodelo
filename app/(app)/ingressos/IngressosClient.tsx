"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type EventType = "PRE_PAGO" | "POS_PAGO" | "FREE";

type TicketEvent = {
  id: string;
  name: string;
  eventDate: string | null;
  location: string | null;
  type: EventType;
};

type Ticket = {
  id: string;
  status: "ACTIVE" | "CANCELLED";
  createdAt: string;
  event: TicketEvent;
};

function formatDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const ano = d.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

export default function IngressosClient() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadTickets() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/tickets", { cache: "no-store" });

        if (res.status === 401) {
          const next = encodeURIComponent("/ingressos");
          router.push(`/login?next=${next}`);
          return;
        }

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          setError(data?.error ?? "Erro ao carregar seus ingressos.");
          return;
        }

        const data = (await res.json()) as Ticket[];
        if (!active) return;
        setTickets(data);
      } catch (err) {
        console.error(err);
        if (!active) return;
        setError("Erro inesperado ao carregar seus ingressos.");
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }

    void loadTickets();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-app text-app flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
        <h1 className="text-lg sm:text-xl font-semibold">Meus ingressos</h1>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="text-xs font-medium text-muted hover:text-slate-100"
        >
          Voltar para eventos
        </button>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-4xl w-full mx-auto flex flex-col gap-4">
        {loading && <p className="text-sm text-muted">Carregando ingressos...</p>}

        {error && <p className="text-sm text-red-400">{error}</p>}

        {!loading && !error && tickets.length === 0 && (
          <p className="text-sm text-muted">
            Você ainda não possui ingressos. Quando confirmar presença logado (FREE) ou comprar um evento,
            eles aparecerão aqui.
          </p>
        )}

        {!loading && tickets.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tickets.map((ticket) => {
              const event = ticket.event;
              const dateLabel = formatDate(event.eventDate);
              const statusLabel = ticket.status === "ACTIVE" ? "Ativo" : "Cancelado";
              const isActive = ticket.status === "ACTIVE";

              return (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => router.push(`/ingressos/${ticket.id}`)}
                  className="text-left flex flex-col gap-2 rounded-2xl border border-[var(--border)] bg-card p-4 hover:bg-card/70 transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] uppercase tracking-wide text-muted">
                      {event.type === "FREE"
                        ? "Evento gratuito"
                        : event.type === "PRE_PAGO"
                        ? "Evento pré-pago"
                        : "Evento pós-pago"}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                        isActive
                          ? "bg-emerald-900/40 text-emerald-300 border border-emerald-600/60"
                          : "bg-card text-muted border border-slate-700/80"
                      }`}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  <h2 className="text-sm font-semibold text-app line-clamp-2">{event.name}</h2>

                  {dateLabel && (
                    <p className="text-xs text-muted">
                      <span className="font-medium text-app">Data:</span> {dateLabel}
                    </p>
                  )}

                  {event.location && (
                    <p className="text-xs text-muted line-clamp-2">
                      <span className="font-medium text-app">Local:</span> {event.location}
                    </p>
                  )}

                  <p className="mt-2 text-[11px] text-app0">
                    Ingresso gerado em {formatDate(ticket.createdAt) ?? "data desconhecida"}.
                  </p>

                  <p className="text-[11px] text-emerald-300">Abrir ingresso →</p>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
