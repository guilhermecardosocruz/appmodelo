"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type EventType = "PRE_PAGO" | "POS_PAGO" | "FREE";

type Event = {
  id: string;
  name: string;
  type: EventType;
  description?: string | null;
  location?: string | null;
  eventDate?: string | null;
  ticketPrice?: string | null;
  paymentLink?: string | null;
};

type Guest = {
  id: string;
  name: string;
  slug: string;
  confirmedAt?: string | null;
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

export default function GuestInviteClient({ slug }: Props) {
  const router = useRouter();
  const params = useParams() as { slug?: string };
  const effectiveSlug = String(params?.slug ?? slug ?? "").trim();

  const [event, setEvent] = useState<Event | null>(null);
  const [guest, setGuest] = useState<Guest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmSuccess, setConfirmSuccess] = useState<string | null>(null);

  const [ticketId, setTicketId] = useState<string | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        setEvent(null);
        setGuest(null);
        setConfirmError(null);
        setConfirmSuccess(null);
        setTicketId(null);
        setTicketError(null);

        if (!effectiveSlug) {
          setError("Código de convite inválido.");
          return;
        }

        const res = await fetch(`/api/events/guests/${encodeURIComponent(effectiveSlug)}`);

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          if (!active) return;

          if (res.status === 404) {
            setError("Nenhum convidado encontrado para este código.");
          } else {
            setError(data?.error ?? "Erro ao carregar informações do convite.");
          }
          return;
        }

        const data = (await res.json()) as { guest: Guest; event: Event };
        if (!active) return;

        setGuest(data.guest);
        setEvent(data.event);

        if (data.guest.confirmedAt) {
          setConfirmSuccess("Sua presença já está confirmada para este evento.");
        }
      } catch (err) {
        console.error("[GuestInviteClient] Erro ao carregar convite:", err);
        if (!active) return;
        setError("Erro inesperado ao carregar informações do convite.");
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [effectiveSlug]);

  const formattedDate = useMemo(() => formatDate(event?.eventDate), [event?.eventDate]);

  const isConfirmed = !!guest?.confirmedAt;
  const isPrePaid = event?.type === "PRE_PAGO";

  const trimmedLocation = useMemo(() => (event?.location ?? "").trim(), [event?.location]);
  const hasLocation = trimmedLocation.length > 0;

  const googleMapsUrl = useMemo(() => (hasLocation ? buildGoogleMapsUrl(trimmedLocation) : null), [
    hasLocation,
    trimmedLocation,
  ]);

  const wazeUrl = useMemo(() => (hasLocation ? buildWazeUrl(trimmedLocation) : null), [
    hasLocation,
    trimmedLocation,
  ]);

  async function handleConfirm() {
    if (!guest) return;

    try {
      setConfirming(true);
      setConfirmError(null);
      setConfirmSuccess(null);
      setTicketError(null);
      setTicketId(null);

      const res = await fetch(`/api/events/guests/${encodeURIComponent(guest.slug)}`, {
        method: "POST",
      });

      // Se não estiver logado, o endpoint pode retornar 200 sem ticketId.
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setConfirmError(data?.error ?? "Erro ao registrar sua confirmação de presença.");
        return;
      }

      const updated = (await res.json()) as { confirmedAt?: string | null; ticketId?: string | null };

      setGuest((prev) =>
        prev
          ? {
              ...prev,
              confirmedAt: updated.confirmedAt ?? new Date().toISOString(),
            }
          : prev
      );

      setConfirmSuccess("Sua presença foi confirmada com sucesso.");

      if (updated.ticketId) {
        setTicketId(updated.ticketId);
      } else {
        setTicketError(
          "Você confirmou, mas ainda não foi possível criar o ingresso na sua conta. Faça login e confirme novamente para gerar seu ticket."
        );
      }
    } catch (err) {
      console.error("[GuestInviteClient] Erro ao confirmar presença:", err);
      setConfirmError("Erro inesperado ao registrar a confirmação. Tente novamente.");
    } finally {
      setConfirming(false);
    }
  }

  async function handleDownloadTicketPdf() {
    if (!ticketId) return;

    try {
      setDownloading(true);
      setTicketError(null);

      const res = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/pdf`, { cache: "no-store" });

      if (res.status === 401) {
        const next = encodeURIComponent(`/convite/pessoa/${encodeURIComponent(effectiveSlug)}`);
        router.push(`/login?next=${next}`);
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setTicketError(data?.error ?? "Não foi possível baixar o PDF do ingresso.");
        return;
      }

      const blob = await res.blob();

      const safeEvent = (event?.name ?? "evento")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);

      const fileName = `ingresso-${safeEvent || "evento"}-${ticketId.slice(0, 8)}.pdf`;
      downloadBlob(blob, fileName);
    } catch (err) {
      console.error("[GuestInviteClient] download pdf error:", err);
      setTicketError("Erro inesperado ao baixar o PDF.");
    } finally {
      setDownloading(false);
    }
  }

  const isLoadingView = loading;
  const canConfirm = !error && !isLoadingView && !!guest && !isConfirmed;

  return (
    <div className="min-h-screen bg-app text-app">
      <div className="max-w-2xl mx-auto px-4 py-10 flex flex-col gap-8">
        <header className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Convite individual
          </p>

          <h1 className="text-2xl sm:text-3xl font-semibold text-app">
            {guest ? `Olá, ${guest.name}` : "Convite para evento"}
          </h1>

          <p className="text-sm text-muted max-w-xl">
            Você recebeu um convite exclusivo para participar deste evento. Veja os detalhes abaixo e confirme sua presença.
          </p>
        </header>

        <section className="space-y-3 text-sm">
          <h2 className="text-sm font-semibold text-app">Detalhes do evento</h2>

          <div className="rounded-2xl border border-[var(--border)] bg-card p-4 space-y-2">
            {loading && <p className="text-xs text-muted">Carregando informações do convite...</p>}

            {!loading && error && <p className="text-xs text-red-400">{error}</p>}

            {!loading && !error && event && guest && (
              <div className="space-y-1 text-xs sm:text-sm text-muted">
                <p>
                  <span className="font-semibold text-app">Convidado:</span> {guest.name}
                </p>

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

                {isPrePaid && event.ticketPrice && (
                  <p className="pt-1">
                    <span className="font-semibold text-app">Valor do ingresso:</span> {event.ticketPrice}
                  </p>
                )}

                {isPrePaid && event.paymentLink && (
                  <div className="pt-2 space-y-1">
                    <p className="text-[11px] text-muted">
                      Para garantir sua participação, realize o pagamento pelo link abaixo e, em seguida, confirme sua presença neste convite.
                    </p>
                    <a
                      href={event.paymentLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-500"
                    >
                      Ir para pagamento
                    </a>
                  </div>
                )}
              </div>
            )}

            {!loading && !error && !event && (
              <p className="text-xs text-muted">Não foi possível carregar informações do evento.</p>
            )}
          </div>
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
          <h2 className="text-sm font-semibold text-app">Confirmação de presença</h2>

          {error && <p className="text-xs text-red-400">Não é possível confirmar presença: {error}</p>}

          {!error && (
            <>
              <button
                type="button"
                disabled={!canConfirm || confirming}
                onClick={handleConfirm}
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
              >
                {isConfirmed ? "Presença já confirmada" : confirming ? "Confirmando..." : "Confirmar presença"}
              </button>

              {confirmError && <p className="text-[11px] text-red-400">{confirmError}</p>}

              {confirmSuccess && (
                <div className="mt-2 rounded-lg border border-emerald-700 bg-emerald-900/20 px-3 py-3 space-y-2">
                  <p className="text-xs text-emerald-300">{confirmSuccess}</p>

                  {ticketId ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => router.push(`/ingressos/${encodeURIComponent(ticketId)}`)}
                        className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-app hover:bg-card/70"
                      >
                        Abrir ingresso
                      </button>

                      <button
                        type="button"
                        onClick={handleDownloadTicketPdf}
                        disabled={downloading}
                        className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
                      >
                        {downloading ? "Baixando..." : "Baixar (PDF)"}
                      </button>
                    </div>
                  ) : (
                    ticketError && <p className="text-[11px] text-emerald-200/80">{ticketError}</p>
                  )}
                </div>
              )}

              {!confirmSuccess && ticketError && <p className="text-[11px] text-red-400">{ticketError}</p>}
            </>
          )}
        </section>

        <footer className="pt-4 border-t border-[var(--border)] text-[11px] text-app0 flex flex-wrap items-center justify-between gap-2">
          <span className="break-all">
            Código do convite: <span className="text-muted">{effectiveSlug || "(não informado)"}</span>
          </span>

          {isConfirmed && <span className="text-emerald-300">Obrigado por confirmar sua presença ✨</span>}
        </footer>
      </div>
    </div>
  );
}
