"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type EventType = "pre_pago" | "pos_pago";

type Event = {
  id: number;
  name: string;
  type: EventType;
};

export default function DashboardPage() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<EventType | "">("");
  const [error, setError] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);

  function handleLogout() {
    // TODO: implementar logout real (limpar sessão/cookies) quando tivermos auth de verdade.
    router.push("/login");
  }

  function handleAddEvent(e: FormEvent) {
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

    const newEvent: Event = {
      id: events.length ? events[events.length - 1].id + 1 : 1,
      name: name.trim(),
      type,
    };

    setEvents((prev) => [...prev, newEvent]);
    setName("");
    setType("");
    setSelectedEventId(newEvent.id);
  }

  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null;

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
                <option value="pre_pago">Pré pago</option>
                <option value="pos_pago">Pós pago</option>
              </select>
            </div>

            <button
              type="submit"
              className="mt-1 inline-flex items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:mt-0 sm:min-w-[120px]"
            >
              Adicionar
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

          {events.length === 0 ? (
            <p className="text-xs text-slate-500">
              Nenhum evento cadastrado ainda. Adicione o primeiro evento acima.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {events.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => setSelectedEventId(event.id)}
                  className={`flex flex-col items-start rounded-2xl border px-4 py-3 text-left transition-colors ${
                    selectedEventId === event.id
                      ? "border-indigo-500 bg-indigo-500/10"
                      : "border-slate-800 bg-slate-900/40 hover:border-slate-600"
                  }`}
                >
                  <span className="text-sm font-semibold text-slate-50 line-clamp-1">
                    {event.name}
                  </span>
                  <span className="mt-1 inline-flex items-center rounded-full bg-slate-800/80 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-300">
                    {event.type === "pre_pago" ? "Pré pago" : "Pós pago"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Área de detalhes do evento selecionado */}
        <section className="mt-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5 min-h-[120px]">
          {selectedEvent ? (
            <>
              <h3 className="text-sm sm:text-base font-semibold text-slate-50 mb-2">
                {selectedEvent.name}
              </h3>
              <p className="text-xs sm:text-sm text-slate-300">
                {selectedEvent.type === "pre_pago"
                  ? "Aqui terá a lógica do evento pré pago."
                  : "Aqui terá a lógica do evento pós pago."}
              </p>
            </>
          ) : (
            <p className="text-xs sm:text-sm text-slate-500">
              Selecione um evento acima para ver os detalhes. Aqui depois vamos colocar a lógica específica de cada tipo de evento.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
