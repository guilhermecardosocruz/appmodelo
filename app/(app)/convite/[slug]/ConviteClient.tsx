"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

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
  // Pega também o slug direto da URL, para garantir
  const params = useParams() as { slug?: string };

  const effectiveSlug = String(params?.slug ?? slug ?? "").trim();

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
        setEvent(null);

        console.log("[ConviteClient] slug props:", slug, "params.slug:", params?.slug, "effectiveSlug:", effectiveSlug);

        if (!effectiveSlug) {
          setEventError("Código de convite inválido.");
          return;
        }

        const res = await fetch(
          `/api/events/by-invite/${encodeURIComponent(effectiveSlug)}`
        );

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          if (!active) return;

          if (res.status === 404) {
            setEventError("Nenhum evento encontrado para este convite.");
          } else {
            setEventError(
              data?.error ?? "Erro ao carregar informações do evento."
            );
          }
          return;
        }

        const data = (await res.json()) as Event;
        if (!active) return;

        setEvent(data);
      } catch (err) {
        console.error("[ConviteClient] Erro ao carregar evento:", err);
        if (!active) return;
        setEventError("Erro inesperado ao carregar informações do evento.");
      } finally {
        if (!active) return;
        setLoadingEvent(false);
      }
    }

    loadEvent();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSlug]);

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
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="max-w-2xl mx-auto px-4 py-10 flex flex-col gap-8">
        {/* Cabeçalho mais "aberto" */}
        <header className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Confirmação de presença
          </p>

          <h1 className="text-2xl sm:text-3xl font-semibold text-slate-50">
            {event?.name ?? "Convite para evento"}
          </h1>

          <p className="text-sm text-slate-400 max-w-xl">
            Confira os detalhes do evento e, em seguida, confirme sua presença
            preenchendo seu nome logo abaixo.
          </p>
        </header>

        {/* Enunciado do evento em formato de tópicos */}
        <section className="space-y-3 text-sm">
          <h2 className="text-sm font-semibold text-slate-200">
            Detalhes do evento
          </h2>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-2">
            {loadingEvent && (
              <p className="text-xs text-slate-400">
                Carregando informações do evento...
              </p>
            )}

            {!loadingEvent && eventError && (
              <p className="text-xs text-red-400">{eventError}</p>
            )}

            {!loadingEvent && !eventError && event && (
              <div className="space-y-1 text-xs sm:text-sm text-slate-300">
                <p>
                  <span className="font-semibold text-slate-100">Evento:</span>{" "}
                  {event.name}
                </p>

                {formattedDate && (
                  <p>
                    <span className="font-semibold text-slate-100">Data:</span>{" "}
                    {formattedDate}
                  </p>
                )}

                {event.location && (
                  <p>
                    <span className="font-semibold text-slate-100">Local:</span>{" "}
                    {event.location}
                  </p>
                )}

                <p>
                  <span className="font-semibold text-slate-100">Tipo:</span>{" "}
                  {event.type === "FREE"
                    ? "Evento gratuito"
                    : event.type === "PRE_PAGO"
                    ? "Evento pré-pago"
                    : "Evento pós-pago"}
                </p>

                {event.description && (
                  <p className="pt-1">
                    <span className="font-semibold text-slate-100">
                      Descrição:
                    </span>{" "}
                    {event.description}
                  </p>
                )}
              </div>
            )}

            {!loadingEvent && !eventError && !event && (
              <p className="text-xs text-slate-400">
                Não foi possível carregar informações do evento.
              </p>
            )}
          </div>
        </section>

        {/* Formulário de confirmação */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">
            Confirmar presença
          </h2>

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
              <p className="text-[11px] text-red-400">{formError}</p>
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
        </section>

        {/* Rodapé com código do convite */}
        <footer className="pt-4 border-t border-slate-900 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
          <span className="break-all">
            Código do convite:{" "}
            <span className="text-slate-300">
              {effectiveSlug || "(não informado)"}
            </span>
          </span>

          {confirmedName && (
            <span className="text-emerald-300">
              Obrigado por confirmar sua presença ✨
            </span>
          )}
        </footer>
      </div>
    </div>
  );
}
