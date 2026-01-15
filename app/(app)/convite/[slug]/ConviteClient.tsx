"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import SessionStatus from "@/components/SessionStatus";

type EventType = "PRE_PAGO" | "POS_PAGO" | "FREE";

type Event = {
  id: string;
  name: string;
  type: EventType;
  description?: string | null;
  location?: string | null;
  eventDate?: string | null; // ISO
  ticketPrice?: string | null;
  paymentLink?: string | null;
  inviteSlug?: string | null;
};

type ConfirmationResponse = {
  id: string;
  name: string;
  createdAt: string;
  authenticated?: boolean;
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

function buildGoogleMapsUrl(location: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

function buildWazeUrl(location: string) {
  return `https://waze.com/ul?q=${encodeURIComponent(location)}&navigate=yes`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ConviteClient({ slug }: Props) {
  const params = useParams() as { slug?: string };
  const router = useRouter();
  const effectiveSlug = String(params?.slug ?? slug ?? "").trim();

  const [event, setEvent] = useState<Event | null>(null);
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [eventError, setEventError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [confirmedName, setConfirmedName] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const [downloading, setDownloading] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [ticketOk, setTicketOk] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadEvent() {
      try {
        setLoadingEvent(true);
        setEventError(null);
        setEvent(null);

        if (!effectiveSlug) {
          setEventError("Código de convite inválido.");
          return;
        }

        const res = await fetch(`/api/events/by-invite/${encodeURIComponent(effectiveSlug)}`, {
          credentials: "include",
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          if (!active) return;

          if (res.status === 404) setEventError("Nenhum evento encontrado para este convite.");
          else setEventError(data?.error ?? "Erro ao carregar informações do evento.");
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

    void loadEvent();
    return () => {
      active = false;
    };
  }, [effectiveSlug]);

  const formattedDate = formatDate(event?.eventDate);
  const trimmedLocation = useMemo(() => (event?.location ?? "").trim(), [event?.location]);
  const hasLocation = trimmedLocation.length > 0;

  const googleMapsUrl = useMemo(
    () => (hasLocation ? buildGoogleMapsUrl(trimmedLocation) : null),
    [hasLocation, trimmedLocation],
  );
  const wazeUrl = useMemo(
    () => (hasLocation ? buildWazeUrl(trimmedLocation) : null),
    [hasLocation, trimmedLocation],
  );

  const isPrePaid = event?.type === "PRE_PAGO";
  const checkoutSlug = event?.inviteSlug?.trim() || effectiveSlug || (event?.id ? event.id : "");
  const hasCheckout = !!(isPrePaid && checkoutSlug);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Por favor, digite o nome do participante para confirmar a presença.");
      setConfirmedName(null);
      return;
    }

    if (!event?.id) {
      setFormError("Ainda não foi possível identificar o evento deste convite. Tente novamente.");
      setConfirmedName(null);
      return;
    }

    try {
      setConfirming(true);
      setFormError(null);
      setTicketError(null);
      setTicketOk(null);

      const res = await fetch(`/api/events/${event.id}/confirmados`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setFormError(data?.error ?? "Erro ao registrar a confirmação de presença.");
        setConfirmedName(null);
        return;
      }

      const created = (await res.json()) as ConfirmationResponse;
      setConfirmedName(created.name ?? trimmed);
      setTicketOk("Presença confirmada. Agora você pode baixar o ingresso.");
    } catch (err) {
      console.error("[ConviteClient] Erro ao confirmar presença:", err);
      setFormError("Erro inesperado ao registrar a confirmação. Tente novamente.");
      setConfirmedName(null);
    } finally {
      setConfirming(false);
    }
  }

  async function handleDownloadTicket() {
    if (!event?.id) return;
    const attendee = (confirmedName ?? name).trim();
    if (!attendee) {
      setTicketError("Digite o nome do participante antes de baixar o ingresso.");
      return;
    }

    try {
      setDownloading(true);
      setTicketError(null);
      setTicketOk(null);

      const url = `/api/events/${event.id}/ticket?name=${encodeURIComponent(attendee)}&inviteSlug=${encodeURIComponent(
        effectiveSlug,
      )}`;

      const res = await fetch(url, { credentials: "include", cache: "no-store" });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setTicketError(data?.error ?? "Erro ao gerar o ingresso.");
        return;
      }

      const blob = await res.blob();

      const dispo = res.headers.get("content-disposition") || "";
      const match = dispo.match(/filename="([^"]+)"/i);
      const filename = match?.[1] ? match[1] : `ingresso-${event.id.slice(0, 6)}.pdf`;

      downloadBlob(blob, filename);

      setTicketOk("Ingresso baixado e salvo em “Meus ingressos”.");
    } catch (err) {
      console.error("[ConviteClient] download ticket error:", err);
      setTicketError("Erro inesperado ao gerar o ingresso.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="min-h-screen bg-app text-app">
      <div className="max-w-2xl mx-auto px-4 py-10 flex flex-col gap-8">
        <header className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Convite (link aberto)
          </p>

          <h1 className="text-2xl sm:text-3xl font-semibold text-app">
            {event ? event.name : "Convite para evento"}
          </h1>

          <p className="text-sm text-muted max-w-xl">
            Digite o nome do participante, confirme presença e baixe o ingresso.
            Se você estiver logado, o ingresso será salvo em “Meus ingressos”.
          </p>

          <SessionStatus />
        </header>

        <section className="rounded-2xl border border-[var(--border)] bg-card p-4 space-y-2">
          {loadingEvent && <p className="text-xs text-muted">Carregando informações do evento...</p>}
          {!loadingEvent && eventError && <p className="text-xs text-red-400">{eventError}</p>}

          {!loadingEvent && !eventError && event && (
            <div className="space-y-1 text-xs sm:text-sm text-muted">
              <p>
                <span className="font-semibold text-app">Evento:</span> {event.name}
              </p>

              {formattedDate && (
                <p>
                  <span className="font-semibold text-app">Data:</span> {formattedDate}
                </p>
              )}

              {event.location && (
                <p>
                  <span className="font-semibold text-app">Local:</span> {event.location}
                </p>
              )}

              <p>
                <span className="font-semibold text-app">Tipo:</span>{" "}
                {event.type === "FREE"
                  ? "Evento gratuito"
                  : event.type === "PRE_PAGO"
                    ? "Evento pré-pago"
                    : "Evento pós-pago"}
              </p>

              {event.description && (
                <p className="pt-1">
                  <span className="font-semibold text-app">Descrição:</span> {event.description}
                </p>
              )}

              {event.type !== "FREE" && (
                <p className="pt-2 text-[11px] text-amber-300">
                  Observação: este link aberto é focado em confirmação. Ingressos em “Meus ingressos”
                  são garantidos para FREE (logado) e para compras (pré/pós).
                </p>
              )}

              {hasCheckout && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => router.push(`/checkout/${encodeURIComponent(checkoutSlug)}`)}
                    className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-500"
                  >
                    Ir para checkout
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {hasLocation && (
          <section className="space-y-3 text-sm">
            <h2 className="text-sm font-semibold text-app">Como chegar</h2>
            <div className="rounded-2xl border border-[var(--border)] bg-card p-4 space-y-2">
              <p className="text-[11px] text-muted">
                Use os atalhos abaixo para abrir o endereço no seu aplicativo de mapas preferido.
              </p>
              <div className="flex flex-wrap gap-2 mt-1">
                {googleMapsUrl && (
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-app hover:bg-card/70"
                  >
                    Abrir no Google Maps
                  </a>
                )}
                {wazeUrl && (
                  <a
                    href={wazeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-app hover:bg-card/70"
                  >
                    Abrir no Waze
                  </a>
                )}
              </div>
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-app">Confirmar presença</h2>

          {eventError && (
            <p className="text-xs text-red-400">
              Não é possível confirmar presença: {eventError}
            </p>
          )}

          {!eventError && (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">Nome do participante</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app placeholder:text-app0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  placeholder="Ex.: João Silva"
                />
              </div>

              {formError && <p className="text-[11px] text-red-400">{formError}</p>}
              {ticketOk && <p className="text-[11px] text-emerald-300">{ticketOk}</p>}
              {ticketError && <p className="text-[11px] text-red-400">{ticketError}</p>}

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={confirming || loadingEvent || !event}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
                >
                  {confirming ? "Confirmando..." : "Confirmar presença"}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadTicket}
                  disabled={!event || event.type !== "FREE" || downloading}
                  className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold text-app hover:bg-card/70 disabled:opacity-50"
                  title={event?.type !== "FREE" ? "PDF de ticket via este endpoint é para eventos FREE" : ""}
                >
                  {downloading ? "Baixando..." : "Baixar ingresso (PDF)"}
                </button>

                <button
                  type="button"
                  onClick={() => router.push("/ingressos")}
                  className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold text-app hover:bg-card/70"
                >
                  Ver meus ingressos
                </button>
              </div>

              <p className="text-[10px] text-app0">
                Dica: se você estiver logado, ao baixar o ingresso ele cria um Ticket real e aparece em “Meus ingressos”.
              </p>
            </form>
          )}
        </section>

        <footer className="pt-4 border-t border-[var(--border)] text-[11px] text-app0 flex flex-wrap items-center justify-between gap-2">
          <span className="break-all">
            Código do convite: <span className="text-muted">{effectiveSlug || "(não informado)"}</span>
          </span>
        </footer>
      </div>
    </div>
  );
}
