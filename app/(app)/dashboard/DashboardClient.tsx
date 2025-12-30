"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type EventType = "PRE_PAGO" | "POS_PAGO" | "FREE";

type Event = {
  id: string;
  name: string;
  type: EventType;
  createdAt: string;
};

function getTypeLabel(type: EventType) {
  if (type === "PRE_PAGO") return "Pré-pago";
  if (type === "POS_PAGO") return "Pós-pago";
  return "Gratuito";
}

function getEventHref(event: Event) {
  if (event.type === "PRE_PAGO") return `/eventos/${event.id}/pre`;
  if (event.type === "POS_PAGO") return `/eventos/${event.id}/pos`;
  return `/eventos/${event.id}/free`;
}

export default function DashboardClient() {
  const router = useRouter();

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

    void load();

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type }),
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
        headers: { "Content-Type": "application/json" },
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
    <div className="min-h-screen bg-[#f6f7f8] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-semibold">Meus eventos</h1>

          <div className="flex items-center gap-4">
            <Link
              href="/ingressos"
              className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
            >
              Meus ingressos
            </Link>
            <button
              type="button"
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <form
          onSubmit={handleCreate}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
            <div className="flex-1">
              <label className="text-xs font-medium text-slate-600">
                Nome do evento
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                placeholder="Digite o nome do evento"
              />
            </div>

            <div className="w-full sm:w-44">
              <label className="text-xs font-medium text-slate-600">Tipo</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as EventType)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <option value="FREE">Gratuito</option>
                <option value="PRE_PAGO">Pré-pago</option>
                <option value="POS_PAGO">Pós-pago</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
            >
              {creating ? "Criando..." : "Adicionar evento"}
            </button>
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </form>

        {loading && <p className="text-sm text-slate-600">Carregando eventos...</p>}

        {!loading && events.length === 0 && (
          <p className="text-sm text-slate-600">
            Nenhum evento criado ainda. Crie o primeiro acima.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <div
              key={event.id}
              onClick={() => router.push(getEventHref(event))}
              className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {getTypeLabel(event.type)}
                </span>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const confirmed = window.confirm(
                      "Deseja realmente excluir este evento? Essa ação não pode ser desfeita.",
                    );
                    if (!confirmed) return;
                    void handleDelete(event.id);
                  }}
                  className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50"
                >
                  Excluir
                </button>
              </div>

              <h2 className="mt-2 line-clamp-2 text-sm font-semibold text-slate-900">
                {event.name}
              </h2>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
