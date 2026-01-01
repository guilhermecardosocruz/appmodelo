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

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function GuestInviteClient({ slug }: Props) {
  const params = useParams() as { slug?: string };
  const effectiveSlug = String(params?.slug ?? slug ?? "").trim();

  const [event, setEvent] = useState<Event | null>(null);
  const [guest, setGuest] = useState<Guest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmSuccess, setConfirmSuccess] = useState<string | null>(null);

  async function buildTicketPdfFile() {
    const safeEventName = (event?.name ?? "Evento").slice(0, 80);
    const safeGuestName = (guest?.name ?? "Convidado").slice(0, 80);

    // Placeholder simples (PDF fake) — substitua quando tiver o gerador real.
    const text = `INGRESSO\n\nEvento: ${safeEventName}\nConvidado: ${safeGuestName}\nCodigo: ${effectiveSlug}\n`;
    const blob = new Blob([text], { type: "application/pdf" });
    const fileName = `ingresso-${(event?.id ?? "evento").slice(0, 8)}.pdf`;
    const file = new File([blob], fileName, { type: "application/pdf" });

    return { blob, file, fileName };
  }

  async function handleShareOrDownload(kind: "share" | "download") {
    try {
      const { blob, file, fileName } = await buildTicketPdfFile();

      if (kind === "download") {
        downloadBlob(blob, fileName);
        return;
      }

      const nav =
        typeof navigator !== "undefined"
          ? (navigator as unknown as {
              share?: (data: {
                title?: string;
                text?: string;
                files?: File[];
              }) => Promise<void>;
              canShare?: (data: { files: File[] }) => boolean;
            })
          : null;

      const canShareFiles = !!nav?.canShare?.({ files: [file] });

      if (nav?.share && canShareFiles) {
        await nav.share({
          title: "Meu ingresso",
          text: "Segue meu ingresso (PDF).",
          files: [file],
        });
        return;
      }

      // Fallback: se não suportar share com arquivo, baixa
      downloadBlob(blob, fileName);
    } catch (err) {
      console.error("[GuestInviteClient] share/download error:", err);
    }
  }

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

        if (!effectiveSlug) {
          setError("Código de convite inválido.");
          return;
        }

        const res = await fetch(
          `/api/events/guests/${encodeURIComponent(effectiveSlug)}`
        );

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

        const data = (await res.json()) as {
          guest: Guest;
          event: Event;
        };

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

  async function handleConfirm() {
    if (!guest) return;

    try {
      setConfirming(true);
      setConfirmError(null);
      setConfirmSuccess(null);

      const res = await fetch(
        `/api/events/guests/${encodeURIComponent(guest.slug)}`,
        {
          method: "POST",
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setConfirmError(
          data?.error ?? "Erro ao registrar sua confirmação de presença."
        );
        return;
      }

      const updated = (await res.json()) as {
        confirmedAt?: string | null;
      };

      setGuest((prev) =>
        prev
          ? {
              ...prev,
              confirmedAt: updated.confirmedAt ?? new Date().toISOString(),
            }
          : prev
      );

      setConfirmSuccess("Sua presença foi confirmada com sucesso.");
    } catch (err) {
      console.error("[GuestInviteClient] Erro ao confirmar presença:", err);
      setConfirmError(
        "Erro inesperado ao registrar a confirmação. Tente novamente."
      );
    } finally {
      setConfirming(false);
    }
  }

  const formattedDate = formatDate(event?.eventDate);
  const isConfirmed = !!guest?.confirmedAt;

  const trimmedLocation = (event?.location ?? "").trim();
  const hasLocation = trimmedLocation.length > 0;

  const googleMapsUrl = hasLocation
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        trimmedLocation
      )}`
    : null;

  const wazeUrl = hasLocation
    ? `https://waze.com/ul?q=${encodeURIComponent(
        trimmedLocation
      )}&navigate=yes`
    : null;

  const isPrePaid = event?.type === "PRE_PAGO";

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
            Você recebeu um convite exclusivo para participar deste evento. Veja
            os detalhes abaixo e confirme sua presença.
          </p>
        </header>

        <section className="space-y-3 text-sm">
          <h2 className="text-sm font-semibold text-app">
            Detalhes do evento
          </h2>

          <div className="rounded-2xl border border-[var(--border)] bg-card p-4 space-y-2">
            {loading && (
              <p className="text-xs text-muted">
                Carregando informações do convite...
              </p>
            )}

            {!loading && error && (
              <p className="text-xs text-red-400">{error}</p>
            )}

            {!loading && !error && event && guest && (
              <div className="space-y-1 text-xs sm:text-sm text-muted">
                <p>
                  <span className="font-semibold text-app">
                    Convidado:
                  </span>{" "}
                  {guest.name}
                </p>

                <p>
                  <span className="font-semibold text-app">Evento:</span>{" "}
                  {event.name}
                </p>

                {formattedDate && (
                  <p>
                    <span className="font-semibold text-app">Data:</span>{" "}
                    {formattedDate}
                  </p>
                )}

                {event.location && (
                  <p>
                    <span className="font-semibold text-app">
                      Local:
                    </span>{" "}
                    {event.location}
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
                    <span className="font-semibold text-app">
                      Descrição:
                    </span>{" "}
                    {event.description}
                  </p>
                )}

                {isPrePaid && event.ticketPrice && (
                  <p className="pt-1">
                    <span className="font-semibold text-app">
                      Valor do ingresso:
                    </span>{" "}
                    {event.ticketPrice}
                  </p>
                )}

                {isPrePaid && event.paymentLink && (
                  <div className="pt-2 space-y-1">
                    <p className="text-[11px] text-muted">
                      Para garantir sua participação, realize o pagamento pelo
                      link abaixo e, em seguida, confirme sua presença neste
                      convite.
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
              <p className="text-xs text-muted">
                Não foi possível carregar informações do evento.
              </p>
            )}
          </div>
        </section>

        {hasLocation && (
          <section className="space-y-3 text-sm">
            <h2 className="text-sm font-semibold text-app">
              Como chegar
            </h2>
            <div className="rounded-2xl border border-[var(--border)] bg-card p-4 space-y-2">
              <p className="text-[11px] text-muted">
                Use os atalhos abaixo para abrir o endereço no seu aplicativo de
                mapas preferido.
              </p>
              <div className="flex flex-wrap gap-2 mt-1">
                {googleMapsUrl && (
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-app hover:bg-slate-800/80"
                  >
                    Abrir no Google Maps
                  </a>
                )}
                {wazeUrl && (
                  <a
                    href={wazeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-app hover:bg-slate-800/80"
                  >
                    Abrir no Waze
                  </a>
                )}
              </div>
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-app">
            Confirmação de presença
          </h2>

          {error && (
            <p className="text-xs text-red-400">
              Não é possível confirmar presença: {error}
            </p>
          )}

          {!error && (
            <>
              <button
                type="button"
                disabled={confirming || loading || !guest || isConfirmed}
                onClick={() => void handleConfirm()}
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
              >
                {isConfirmed
                  ? "Presença já confirmada"
                  : confirming
                  ? "Confirmando..."
                  : "Confirmar presença"}
              </button>

              {confirmError && (
                <p className="text-[11px] text-red-400">{confirmError}</p>
              )}

              {confirmSuccess && (
                <div className="mt-2 rounded-lg border border-emerald-700 bg-emerald-900/20 px-3 py-2">
                  <p className="text-xs text-emerald-300">
                    {confirmSuccess}
                  </p>
                  <p className="mt-1 text-[10px] text-emerald-200/80">
                    Sua confirmação já foi registrada para o organizador deste
                    evento.
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleShareOrDownload("download")}
                      className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-app hover:bg-card/70"
                    >
                      Baixar ingresso (PDF)
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleShareOrDownload("share")}
                      className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-500"
                    >
                      Compartilhar
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        <footer className="pt-4 border-t border-[var(--border)] text-[11px] text-app0 flex flex-wrap items-center justify-between gap-2">
          <span className="break-all">
            Código do convite:{" "}
            <span className="text-muted">
              {effectiveSlug || "(não informado)"}
            </span>
          </span>

          {isConfirmed && (
            <span className="text-emerald-300">
              Obrigado por confirmar sua presença ✨
            </span>
          )}
        </footer>
      </div>
    </div>
  );
}
