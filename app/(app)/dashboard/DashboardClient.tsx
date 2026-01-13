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

  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  async function handleDelete(event: Event) {
    const ok = window.confirm(
      `Tem certeza que deseja excluir o evento "${event.name}"?\n\n` +
        "Essa ação é permanente e você pode perder os dados relacionados ao evento."
    );

    if (!ok) return;

    try {
      setDeletingId(event.id);
      setError(null);

      const res = await fetch(`/api/events/${event.id}`, { method: "DELETE" });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg =
          data?.error ??
          "Não foi possível excluir o evento. Verifique se há tickets/pagamentos vinculados.";
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
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500
                     disabled:cursor-not-allowed disabled:opacity-60"
        >
          {creating ? "Adicionando..." : "Adicionar evento"}
        </button>
      </form>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* CARDS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {events.map((event) => (
          <div
            key={event.id}
            onClick={() => router.push(getEventHref(event))}
            className="cursor-pointer rounded-2xl border border-app bg-card p-4 shadow-sm transition
                       hover:bg-card-hover hover:shadow-md"
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
                className="rounded-md border border-red-500 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50
                           disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingId === event.id ? "Excluindo..." : "Excluir"}
              </button>
            </div>

            <h2 className="text-sm font-semibold text-app">{event.name}</h2>
          </div>
        ))}
      </div>

      {loading && <p className="mt-4 text-sm text-muted">Carregando eventos…</p>}
    </div>
  );
}
