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
  ticketPrice?: string | null;
  paymentLink?: string | null;
  inviteSlug?: string | null;
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
  const params = useParams() as { slug?: string };
  const effectiveSlug = String(params?.slug ?? slug ?? "").trim();

  const [event, setEvent] = useState<Event | null>(null);
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [eventError, setEventError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [confirmedName, setConfirmedName] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // (opcional) helpers: download/compartilhar um “PDF”
  // OBS: aqui é só para manter o build estável e suportar Web Share sem @ts-expect-error.
  // Se você já tem a geração real de PDF em outro trecho, pode reaproveitar e remover isto depois.
  async function buildTicketPdfFile() {
    const safeEventName = (event?.name ?? "Evento").slice(0, 80);
    const safeGuestName = (confirmedName ?? name ?? "Convidado").slice(0, 80);

    // Conteúdo simples (placeholder) — se você já gera um PDF real, substitua este bloco.
    const text = `INGRESSO\n\nEvento: ${safeEventName}\nConvidado: ${safeGuestName}\nCodigo: ${effectiveSlug}\n`;
    const blob = new Blob([text], { type: "application/pdf" });

    const fileName = `ingresso-${(event?.id ?? "evento").slice(0, 8)}.pdf`;
    const file = new File([blob], fileName, { type: "application/pdf" });

    return { blob, file, fileName };
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

  async function handleShareOrDownload(kind: "share" | "download") {
    try {
      const { blob, file, fileName } = await buildTicketPdfFile();

      if (kind === "download") {
        downloadBlob(blob, fileName);
        return;
      }

      // Web Share API com arquivo (mobile costuma suportar)
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

      // Fallback: se não dá pra compartilhar arquivo, baixa.
      downloadBlob(blob, fileName);
    } catch (err) {
      console.error("[ConviteClient] share/download error:", err);
      // fallback final: nada (evita quebrar UX)
    }
  }

  useEffect(() => {
    let active = true;

    async function loadEvent() {
      try {
        setLoadingEvent(true);
        setEventError(null);
        setEvent(null);

        console.log(
          "[ConviteClient] slug props:",
          slug,
          "params.slug:",
          params?.slug,
          "effectiveSlug:",
          effectiveSlug,
        );

        if (!effectiveSlug) {
          setEventError("Código de convite inválido.");
          return;
        }

        const res = await fetch(
          `/api/events/by-invite/${encodeURIComponent(effectiveSlug)}`,
        );

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          if (!active) return;

          if (res.status === 404) {
            setEventError("Nenhum evento encontrado para este convite.");
          } else {
            setEventError(
              data?.error ?? "Erro ao carregar informações do evento.",
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

    void loadEvent();

    return () => {
      active = false;
    };
  }, [effectiveSlug, slug, params?.slug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Por favor, digite seu nome para confirmar a presença.");
      setConfirmedName(null);
      return;
    }

    if (!event || !event.id) {
      setFormError(
        "Ainda não foi possível identificar o evento deste convite. Tente novamente em alguns segundos.",
      );
      setConfirmedName(null);
      return;
    }

    try {
      setConfirming(true);
      setFormError(null);

      const res = await fetch(`/api/events/${event.id}/confirmados`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmed,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setFormError(
          data?.error ?? "Erro ao registrar a confirmação de presença.",
        );
        setConfirmedName(null);
        return;
      }

      setConfirmedName(trimmed);
    } catch (err) {
      console.error("[ConviteClient] Erro ao confirmar presença:", err);
      setFormError(
        "Erro inesperado ao registrar a confirmação. Tente novamente.",
      );
      setConfirmedName(null);
    } finally {
      setConfirming(false);
    }
  }

  const formattedDate = formatDate(event?.eventDate);
  const trimmedLocation = (event?.location ?? "").trim();
  const hasLocation = trimmedLocation.length > 0;

  const googleMapsUrl = hasLocation
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        trimmedLocation,
      )}`
    : null;

  const wazeUrl = hasLocation
    ? `https://waze.com/ul?q=${encodeURIComponent(
        trimmedLocation,
      )}&navigate=yes`
    : null;

  const isPrePaid = event?.type === "PRE_PAGO";

  const checkoutSlug =
    event?.inviteSlug?.trim() ||
    effectiveSlug ||
    (event?.id ? event.id : "");

  const hasCheckout = isPrePaid && checkoutSlug;

  return (
    <div className="min-h-screen bg-app text-app">
      <div className="max-w-2xl mx-auto px-4 py-10 flex flex-col gap-8">
        <header className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Confirmação de presença
          </p>

          <h1 className="text-2xl sm:text-3xl font-semibold text-app">
            {event?.name ?? "Convite para evento"}
          </h1>

          <p className="text-sm text-muted max-w-xl">
            Confira os detalhes do evento e, em seguida, confirme sua presença
            preenchendo seu nome logo abaixo.
          </p>
        </header>

        <section className="space-y-3 text-sm">
          <h2 className="text-sm font-semibold text-app">
            Detalhes do evento
          </h2>

          <div className="rounded-2xl border border-[var(--border)] bg-card p-4 space-y-2">
            {loadingEvent && (
              <p className="text-xs text-muted">
                Carregando informações do evento...
              </p>
            )}

            {!loadingEvent && eventError && (
              <p className="text-xs text-red-400">{eventError}</p>
            )}

            {!loadingEvent && !eventError && event && (
              <div className="space-y-1 text-xs sm:text-sm text-muted">
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

                {hasCheckout && (
                  <div className="pt-3 space-y-1">
                    <p className="text-[11px] text-muted">
                      Para garantir sua participação, clique em{" "}
                      <span className="font-semibold text-app">
                        Comprar ingresso
                      </span>{" "}
                      para fazer o pagamento online. Você precisará criar uma
                      conta ou fazer login antes de pagar.
                    </p>
                    <a
                      href={`/checkout/${encodeURIComponent(checkoutSlug)}`}
                      className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-500"
                    >
                      Comprar ingresso
                    </a>
                  </div>
                )}
              </div>
            )}

            {!loadingEvent && !eventError && !event && (
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
            Confirmar presença
          </h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted">
                Seu nome completo
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app placeholder:text-app0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                placeholder="Digite seu nome para confirmar presença"
                disabled={confirming || loadingEvent || !!eventError}
              />
            </div>

            {formError && (
              <p className="text-[11px] text-red-400">{formError}</p>
            )}

            <button
              type="submit"
              disabled={confirming || loadingEvent || !!eventError}
              className="mt-1 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
            >
              {confirming ? "Confirmando..." : "Confirmar presença"}
            </button>
          </form>

          {confirmedName && (
            <div className="mt-2 rounded-lg border border-emerald-700 bg-emerald-900/20 px-3 py-2">
              <p className="text-xs text-emerald-300">
                Presença confirmada para{" "}
                <span className="font-semibold">{confirmedName}</span>.
              </p>
              <p className="mt-1 text-[10px] text-emerald-200/80">
                Esta confirmação já foi registrada na lista de confirmados do
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
        </section>

        <footer className="pt-4 border-t border-[var(--border)] text-[11px] text-app0 flex flex-wrap items-center justify-between gap-2">
          <span className="break-all">
            Código do convite:{" "}
            <span className="text-muted">
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
