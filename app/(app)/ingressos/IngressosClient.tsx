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
          setError(
            data?.error ?? "Erro ao carregar seus ingressos.",
          );
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
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <h1 className="text-lg sm:text-xl font-semibold">
          Meus ingressos
        </h1>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="text-xs font-medium text-slate-300 hover:text-slate-100"
        >
          Voltar para eventos
        </button>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-4xl w-full mx-auto flex flex-col gap-4">
        {loading && (
          <p className="text-sm text-slate-300">Carregando ingressos...</p>
        )}

        {error && (
          <p className="text-sm text-red-400">
            {error}
          </p>
        )}

        {!loading && !error && tickets.length === 0 && (
          <p className="text-sm text-slate-400">
            Você ainda não possui ingressos. Quando fizer uma compra, eles
            aparecerão aqui.
          </p>
        )}

        {!loading && tickets.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tickets.map((ticket) => {
              const event = ticket.event;
              const dateLabel = formatDate(event.eventDate);
              const statusLabel =
                ticket.status === "ACTIVE" ? "Ativo" : "Cancelado";
              const isActive = ticket.status === "ACTIVE";

              return (
                <div
                  key={ticket.id}
                  className="flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] uppercase tracking-wide text-slate-400">
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
                          : "bg-slate-900/60 text-slate-400 border border-slate-700/80"
                      }`}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  <h2 className="text-sm font-semibold text-slate-50 line-clamp-2">
                    {event.name}
                  </h2>

                  {dateLabel && (
                    <p className="text-xs text-slate-300">
                      <span className="font-medium text-slate-200">
                        Data:
                      </span>{" "}
                      {dateLabel}
                    </p>
                  )}

                  {event.location && (
                    <p className="text-xs text-slate-300 line-clamp-2">
                      <span className="font-medium text-slate-200">
                        Local:
                      </span>{" "}
                      {event.location}
                  </p>
                  )}

                  <p className="mt-2 text-[11px] text-slate-500">
                    Ingresso gerado em{" "}
                    {formatDate(ticket.createdAt) ?? "data desconhecida"}.
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
