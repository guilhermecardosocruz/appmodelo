"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type EventType = "PRE_PAGO" | "POS_PAGO" | "FREE";

type Event = {
  id: string;
  name: string;
  type: EventType;
  description?: string | null;
  location?: string | null;
};

type Mode = "free" | "pre" | "pos";

type Props = {
  eventId: string;
  mode: Mode;
};

function getTitle(mode: Mode) {
  if (mode === "pre") return "Evento pré pago";
  if (mode === "pos") return "Evento pós pago";
  return "Evento free";
}

function getDescription(mode: Mode) {
  if (mode === "pre") {
    return "Aqui terá a lógica do evento pré pago.";
  }
  if (mode === "pos") {
    return "Aqui terá a lógica do evento pós pago.";
  }
  return "Aqui terá a lógica do evento free.";
}

export default function EventTipoClient({ eventId, mode }: Props) {
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const trimmedId = String(eventId ?? "").trim();
        if (!trimmedId) {
          console.warn("[EventTipoClient] eventId vazio, abortando fetch.");
          setError("ID do evento inválido.");
          setEvent(null);
          return;
        }

        const url = `/api/events/${trimmedId}`;
        console.log("[EventTipoClient] Fetching:", url);
        const res = await fetch(url);

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          if (!active) return;

          if (res.status === 404) {
            setError(data?.error ?? "Evento não encontrado.");
          } else {
            setError(data?.error ?? "Erro ao carregar evento.");
          }

          setEvent(null);
          return;
        }

        const data = (await res.json()) as Event;
        if (!active) return;

        setEvent(data);
      } catch (err) {
        console.error("[EventTipoClient] Erro no fetch:", err);
        if (!active) return;
        setError("Erro inesperado ao carregar evento.");
        setEvent(null);
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [eventId, mode]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <Link
          href="/dashboard/"
          className="text-xs font-medium text-slate-300 hover:text-slate-100"
        >
          ← Voltar
        </Link>

        {event && (
          <span className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-300 border border-slate-700">
            {event.type}
          </span>
        )}
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-3xl w-full mx-auto flex flex-col gap-4">
        {loading && (
          <p className="text-sm text-slate-300">Carregando evento...</p>
        )}

        {error && !loading && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        {!loading && !error && !event && (
          <p className="text-sm text-slate-300">
            Evento não encontrado.
          </p>
        )}

        {event && (
          <>
            <h1 className="text-xl sm:text-2xl font-semibold text-slate-50">
              {event.name}
            </h1>

            <h2 className="text-sm font-medium text-slate-200">
              {getTitle(mode)}
            </h2>

            <p className="text-sm text-slate-300">
              {getDescription(mode)}
            </p>

            <p className="mt-4 text-[11px] text-slate-500">
              (No futuro, aqui vamos montar toda a lógica detalhada desse tipo
              de evento: configurações, regras, integrações, fluxos, etc.)
            </p>
          </>
        )}
      </main>
    </div>
  );
}
