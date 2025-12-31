"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type EventType = "PRE_PAGO" | "POS_PAGO" | "FREE";

type Event = {
  id: string;
  name: string;
  type: EventType;
  createdAt?: string;
};

function getTypeLabel(type: EventType) {
  if (type === "PRE_PAGO") return "PRÉ PAGO";
  if (type === "POS_PAGO") return "PÓS PAGO";
  return "FREE";
}

function getEventHref(event: Event) {
  if (event.type === "PRE_PAGO") return `/eventos/${event.id}/pre`;
  if (event.type === "POS_PAGO") return `/eventos/${event.id}/pos`;
  return `/eventos/${event.id}/free`;
}

function toApiType(uiValue: string): EventType {
  if (uiValue === "PRE_PAGO") return "PRE_PAGO";
  if (uiValue === "POS_PAGO") return "POS_PAGO";
  return "FREE";
}

export default function DashboardClient() {
  const router = useRouter();

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");
  const [type, setType] = useState<EventType>("FREE");

  const canSubmit = useMemo(() => name.trim().length >= 2 && !creating, [name, creating]);

  async function refreshEvents() {
    const r = await fetch("/api/events", { cache: "no-store" });
    const data = await r.json();
    setEvents(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        await refreshEvents();
      } catch {
        setError("Falha ao carregar eventos.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      setCreating(true);
      setError(null);

      const r = await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), type }),
      });

      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(txt || "Erro ao criar evento.");
      }

      // tenta usar retorno como evento criado; se não for, apenas recarrega lista
      const payload = await r.json().catch(() => null);
      if (payload && typeof payload === "object" && "id" in payload) {
        setEvents((prev) => [payload as Event, ...prev]);
      } else {
        await refreshEvents();
      }

      setName("");
      setType("FREE");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar evento.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <h1 className="mb-6 text-xl font-semibold text-slate-900 dark:text-slate-50">
        Meus eventos
      </h1>

      {/* FORM */}
      <form
        onSubmit={onCreate}
        className="mb-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm
                   dark:border-slate-800 dark:bg-slate-900/60 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Nome do evento
          </label>
          <input
            value={name}
            onChange={(ev) => setName(ev.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900
                       focus:outline-none focus:ring-2 focus:ring-emerald-500
                       dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
            placeholder="Digite o nome do evento"
          />
        </div>

        <div className="w-full sm:w-44">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Tipo
          </label>
          <select
            value={type}
            onChange={(ev) => setType(toApiType(ev.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900
                       focus:outline-none focus:ring-2 focus:ring-emerald-500
                       dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
          >
            <option value="FREE">Free</option>
            <option value="PRE_PAGO">Pré pago</option>
            <option value="POS_PAGO">Pós pago</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500
                     disabled:cursor-not-allowed disabled:opacity-60"
        >
          {creating ? "Adicionando..." : "Adicionar evento"}
        </button>
      </form>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700
                        dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      {/* CARDS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {events.map((event) => (
          <div
            key={event.id}
            onClick={() => router.push(getEventHref(event))}
            className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition
                       hover:shadow-md
                       dark:border-slate-800 dark:bg-slate-900/60"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {getTypeLabel(event.type)}
              </span>

              {/* botão não navega */}
              <button
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  // deletar fica pra próxima etapa; não deixo “morto” por enquanto
                  alert("Ação de excluir: implementar");
                }}
                className="rounded-md border border-red-500 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50
                           dark:text-red-400 dark:hover:bg-red-950/40"
              >
                Excluir
              </button>
            </div>

            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              {event.name}
            </h2>
          </div>
        ))}
      </div>

      {loading && (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          Carregando eventos…
        </p>
      )}
    </div>
  );
}
