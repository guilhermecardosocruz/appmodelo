"use client";

import { useEffect, useState } from "react";

type EventType = "PRE_PAGO" | "POS_PAGO" | "FREE";

type Event = {
  id: string;
  name: string;
  type: EventType;
  description?: string | null;
  location?: string | null;
  eventDate?: string | null; // ISO string
};

type Props = {
  slug: string;
};

function formatDate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const dia = String(d.getUTCDate()).padStart(2, "0");
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  const ano = d.getUTCFullYear();
  return `${dia}/${mes}/${ano}`;
}

export default function ConviteClient({ slug }: Props) {
  const [event, setEvent] = useState<Event | null>(null);
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [eventError, setEventError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [confirmedName, setConfirmedName] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadEvent() {
      try {
        setLoadingEvent(true);
        setEventError(null);

        const trimmedSlug = String(slug ?? "").trim();
        if (!trimmedSlug) {
          setEventError("Código de convite inválido.");
          setEvent(null);
          return;
        }

        // MESMA ESTRATÉGIA QUE USAMOS NO EVENTO:
        // busca todos em /api/events e filtra no cliente
        const res = await fetch("/api/events");

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          if (!active) return;
          setEventError(
            data?.error ?? "Erro ao carregar informações do evento."
          );
          setEvent(null);
          return;
        }

        const all = (await res.json()) as (Event & {
          inviteSlug?: string | null;
        })[];

        if (!active) return;

        const [prefix] = trimmedSlug.split("-");

        const found =
          all.find((e) => e.inviteSlug === trimmedSlug) ??
          all.find((e) => e.id === trimmedSlug) ??
          (prefix
            ? all.find((e) => e.id.startsWith(prefix))
            : null);

        if (!found) {
          setEventError("Nenhum evento encontrado para este convite.");
          setEvent(null);
          return;
        }

        setEvent(found);
      } catch (err) {
        console.error("[ConviteClient] Erro ao carregar evento:", err);
        if (!active) return;
        setEventError("Erro inesperado ao carregar informações do evento.");
        setEvent(null);
      } finally {
        if (!active) return;
        setLoadingEvent(false);
      }
    }

    loadEvent();

    return () => {
      active = false;
    };
  }, [slug]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Por favor, digite seu nome para confirmar a presença.");
      setConfirmedName(null);
      return;
    }

    setFormError(null);
    setConfirmedName(trimmed);

    // Futuro: enviar confirmação para o backend junto com o slug
  }

  const formattedDate = formatDate(event?.eventDate);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
        <h1 className="text-lg font-semibold text-center">
          Confirmação de presença
        </h1>

        {/* Bloco de informações do evento (somente leitura) */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-1">
          {loadingEvent && (
            <p className="text-xs text-slate-400">
              Carregando informações do evento...
            </p>
          )}

          {!loadingEvent && eventError && (
            <p className="text-xs text-red-400">
              {eventError}
            </p>
          )}

          {!loadingEvent && !eventError && event && (
            <>
              <p className="text-xs text-slate-400">
                Você está confirmando presença no evento:
              </p>
              <p className="text-sm font-semibold text-slate-50">
                {event.name}
              </p>

              {formattedDate && (
                <p className="text-xs text-slate-300">
                  Data: <span className="font-medium">{formattedDate}</span>
                </p>
              )}

              {event.location && (
                <p className="text-xs text-slate-300">
                  Local: <span className="font-medium">{event.location}</span>
                </p>
              )}

              {event.description && (
                <p className="text-xs text-slate-300 mt-1">
                  {event.description}
                </p>
              )}
            </>
          )}

          {!loadingEvent && !eventError && !event && (
            <p className="text-xs text-slate-400">
              Não foi possível carregar informações do evento.
            </p>
          )}
        </div>

        {/* Formulário: somente nome completo editável */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-300">
              Seu nome completo
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              placeholder="Digite seu nome para confirmar presença"
            />
          </div>

          {formError && (
            <p className="text-[11px] text-red-400">
              {formError}
            </p>
          )}

          <button
            type="submit"
            className="mt-1 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500"
          >
            Confirmar presença
          </button>
        </form>

        {confirmedName && (
          <div className="mt-2 rounded-lg border border-emerald-700 bg-emerald-900/20 px-3 py-2">
            <p className="text-xs text-emerald-300">
              Presença confirmada para{" "}
              <span className="font-semibold">{confirmedName}</span>.
            </p>
            <p className="mt-1 text-[10px] text-emerald-200/80">
              Em breve, esta confirmação será registrada automaticamente na
              lista de confirmados do evento.
            </p>
          </div>
        )}

        <p className="mt-2 text-[10px] text-slate-500 text-center break-all">
          Código do convite:{" "}
          <span className="text-slate-400">{slug}</span>
        </p>
      </div>
    </div>
  );
}
