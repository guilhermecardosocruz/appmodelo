"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type EventType = "PRE_PAGO" | "POS_PAGO" | "FREE";

type Event = {
  id: string;
  name: string;
  type: EventType;
  createdAt: string;
};

function getTypeLabel(type: EventType) {
  if (type === "PRE_PAGO") return "Pré pago";
  if (type === "POS_PAGO") return "Pós pago";
  return "Free";
}

function getEventHref(event: Event) {
  if (event.type === "PRE_PAGO") return `/eventos/${event.id}/pre`;
  if (event.type === "POS_PAGO") return `/eventos/${event.id}/pos`;
  return `/eventos/${event.id}/free`;
}

export default function DashboardClient() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState<EventType>("FREE");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/events");
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          if (!active) return;
          setError(data?.error ?? "Erro ao carregar eventos.");
          return;
        }

        const data = (await res.json()) as Event[];
        if (!active) return;
        setEvents(data);
      } catch (err) {
        console.error(err);
        if (!active) return;
        setError("Erro inesperado ao carregar eventos.");
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Informe um nome para o evento.");
      return;
    }

    try {
      setCreating(true);
      setError(null);

      const res = await fetch("/api/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          type,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Erro ao criar evento.");
        return;
      }

      const created = (await res.json()) as Event;

      setEvents((prev) => [created, ...prev]);
      setName("");
      setType("FREE");
    } catch (err) {
      console.error(err);
      setError("Erro inesperado ao criar evento.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      setError(null);

      const res = await fetch("/api/events", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Erro ao excluir evento.");
        return;
      }

      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      console.error(err);
      setError("Erro inesperado ao excluir evento.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <h1 className="text-lg sm:text-xl font-semibold">
          Meus eventos
        </h1>

        <button
          type="button"
          className="text-xs font-medium text-slate-300 hover:text-slate-100"
        >
          Sair
        </button>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-5xl w-full mx-auto flex flex-col gap-6">
        {/* Form de criação */}
        <form
          onSubmit={handleCreate}
          className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:flex-row sm:items-end sm:gap-4"
        >
          <div className="flex-1 flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-300">
              Nome do evento
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              placeholder="Digite o nome do evento"
            />
          </div>

          <div className="w-full sm:w-40 flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-300">
              Tipo
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as EventType)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <option value="FREE">Free</option>
              <option value="PRE_PAGO">Pré pago</option>
              <option value="POS_PAGO">Pós pago</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
          >
            {creating ? "Criando..." : "Adicionar evento"}
          </button>
        </form>

        {error && (
          <p className="text-sm text-red-400">
            {error}
          </p>
        )}

        {loading && (
          <p className="text-sm text-slate-300">Carregando eventos...</p>
        )}

        {!loading && events.length === 0 && (
          <p className="text-sm text-slate-400">
            Nenhum evento criado ainda. Crie o primeiro acima.
          </p>
        )}

        {/* Grid de cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map((event) => (
            <div
              key={event.id}
              className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
            >
              <div className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wide text-slate-400">
                  {getTypeLabel(event.type)}
                </span>
                <h2 className="text-sm font-semibold text-slate-50 line-clamp-2">
                  {event.name}
                </h2>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2">
                <Link
                  href={getEventHref(event)}
                  className="inline-flex items-center justify-center rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-50 hover:bg-slate-700"
                >
                  Abrir
                </Link>

                <button
                  type="button"
                  onClick={() => handleDelete(event.id)}
                  className="inline-flex items-center justify-center rounded-lg border border-red-600 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-950/50"
                >
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
