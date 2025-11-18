"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type EventType = "PRE_PAGO" | "POS_PAGO" | "FREE";

type Event = {
  id: string;
  name: string;
  type: EventType;
};

export default function DashboardPage() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<EventType | "">("");
  const [error, setError] = useState<string | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [saving, setSaving] = useState(false);

  function handleLogout() {
    // TODO: implementar logout real (limpar sessão/cookies) quando tivermos auth de verdade.
    router.push("/login");
  }

  async function loadEvents() {
    try {
      setLoadingEvents(true);
      const res = await fetch("/api/events");
      if (!res.ok) {
        throw new Error("Falha ao carregar eventos");
      }
      const data = await res.json();
      setEvents(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingEvents(false);
    }
  }

  useEffect(() => {
    loadEvents();
  }, []);

  async function handleAddEvent(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Informe o nome do evento.");
      return;
    }

    if (!type) {
      setError("Selecione o tipo do evento.");
      return;
    }

    try {
      setSaving(true);
      const res = await fetch("/api/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, type }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Erro ao salvar evento.");
        return;
      }

      const created: Event = await res.json();
      // Insere no topo da lista
      setEvents((prev) => [created, ...prev]);
      setName("");
      setType("");
    } catch (err) {
      console.error(err);
      setError("Erro inesperado ao salvar evento.");
    } finally {
      setSaving(false);
    }
  }

  function getTypeLabel(type: EventType) {
    switch (type) {
      case "PRE_PAGO":
        return "Pré pago";
      case "POS_PAGO":
        return "Pós pago";
      case "FREE":
        return "Free";
      default:
        return type;
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      {/* Topbar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <div className="text-sm font-semibold tracking-tight text-slate-400">
          Painel
        </div>

        <button
          onClick={handleLogout}
          className="inline-flex items-center rounded-full border border-slate-700 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          Sair
        </button>
      </header>

      {/* Conteúdo */}
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-5xl w-full mx-auto flex flex-col gap-6">
        {/* Adicionar evento */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 sm:p-5">
          <h1 className="text-base sm:text-lg font-semibold text-slate-50 mb-3">
            Adicionar evento
          </h1>

          <form
            onSubmit={handleAddEvent}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-300">
                Nome do evento
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                placeholder="Ex.: Copa de Robótica 2025"
              />
            </div>

            <div className="w-full sm:w-48 flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-300">
                Tipo do evento
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as EventType | "")}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <option value="">Selecione</option>
                <option value="PRE_PAGO">Pré pago</option>
                <option value="POS_PAGO">Pós pago</option>
                <option value="FREE">Free</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="mt-1 inline-flex items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-60 sm:mt-0 sm:min-w-[120px]"
            >
              {saving ? "Salvando..." : "Adicionar"}
            </button>
          </form>

          {error && (
            <p className="mt-2 text-xs text-red-400">
              {error}
            </p>
          )}
        </section>

        {/* Lista de eventos */}
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-slate-200">
            Eventos criados
          </h2>

          {loadingEvents ? (
            <p className="text-xs text-slate-500">Carregando eventos...</p>
          ) : events.length === 0 ? (
            <p className="text-xs text-slate-500">
              Nenhum evento cadastrado ainda. Adicione o primeiro evento acima.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {events.map((event) => (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  className="flex flex-col items-start rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-left transition-colors hover:border-slate-600"
                >
                  <span className="text-sm font-semibold text-slate-50 line-clamp-1">
                    {event.name}
                  </span>
                  <span className="mt-1 inline-flex items-center rounded-full bg-slate-800/80 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-300">
                    {getTypeLabel(event.type)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
