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

type ApiError = {
  error?: string;
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

function toApiType(v: string): EventType {
  if (v === "PRE_PAGO") return "PRE_PAGO";
  if (v === "POS_PAGO") return "POS_PAGO";
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
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => name.trim().length >= 2 && !creating,
    [name, creating],
  );

  async function refreshEvents() {
    const res = await fetch("/api/events", { cache: "no-store" });

    if (!res.ok) {
      let msg = "Erro ao carregar eventos.";
      try {
        const body = (await res.json()) as ApiError;
        if (body?.error) msg = body.error;
      } catch {
        // ignore parse error, fica msg padrão
      }
      throw new Error(msg);
    }

    const data = (await res.json()) as unknown;

    if (Array.isArray(data)) {
      setEvents(data as Event[]);
    } else {
      setEvents([]);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        await refreshEvents();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao carregar eventos.");
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

      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), type }),
      });

      if (!res.ok) {
        let msg = "Erro ao criar evento.";
        try {
          const body = (await res.json()) as ApiError;
          if (body?.error) msg = body.error;
        } catch {
          // ignora parse erro
        }
        throw new Error(msg);
      }

      const payload = (await res.json().catch(() => null)) as
        | Event
        | { id?: string }
        | null;

      if (payload && "id" in payload && payload.id) {
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

  async function handleDelete(event: Event) {
    const ok = window.confirm(
      `Deseja excluir o evento "${event.name}"?\nA ação é permanente.`,
    );
    if (!ok) return;

    try {
      setDeletingId(event.id);
      setError(null);

      const res = await fetch("/api/events", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: event.id }),
      });

      if (!res.ok) {
        let msg =
          "Não foi possível excluir. Verifique se há pagamentos/tickets vinculados.";
        try {
          const body = (await res.json()) as ApiError;
          if (body?.error) msg = body.error;
        } catch {
          // ignora parse erro
        }
        throw new Error(msg);
      }

      setEvents((prev) => prev.filter((e) => e.id !== event.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir evento.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <h1 className="mb-6 text-xl font-semibold text-app">Meus eventos</h1>

      {/* FORM */}
      <form
        onSubmit={onCreate}
        className="mb-6 flex flex-col gap-3 rounded-2xl border border-app bg-card-strong p-4 shadow-sm sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label className="text-xs font-medium text-muted">Nome do evento</label>
          <input
            value={name}
            onChange={(ev) => setName(ev.target.value)}
            className="input-app mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:ring-app"
            placeholder="Digite o nome do evento"
          />
        </div>

        <div className="w-full sm:w-44">
          <label className="text-xs font-medium text-muted">Tipo</label>
          <select
            value={type}
            onChange={(ev) => setType(toApiType(ev.target.value))}
            className="input-app mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:ring-app"
          >
            <option value="FREE">Free</option>
            <option value="PRE_PAGO">Pré pago</option>
            <option value="POS_PAGO">Pós pago</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {creating ? "Adicionando..." : "Adicionar evento"}
        </button>
      </form>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* LISTA */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {events.map((event) => (
          <div
            key={event.id}
            onClick={() => router.push(getEventHref(event))}
            className="cursor-pointer rounded-2xl border border-app bg-card p-4 shadow-sm hover:bg-card-hover transition"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted">
                {getTypeLabel(event.type)}
              </span>

              <button
                type="button"
                disabled={deletingId === event.id}
                onClick={(ev) => {
                  ev.stopPropagation();
                  void handleDelete(event);
                }}
                className="rounded-md border border-red-500 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                {deletingId === event.id ? "Excluindo..." : "Excluir"}
              </button>
            </div>

            <h2 className="text-sm font-semibold text-app">{event.name}</h2>
          </div>
        ))}
      </div>

      {loading && (
        <p className="mt-4 text-sm text-muted">Carregando eventos…</p>
      )}
    </div>
  );
}
