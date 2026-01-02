"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import SessionStatus from "@/components/SessionStatus";

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

async function generateQrDataUrl(text: string): Promise<string> {
  const mod = await import("qrcode");
  return mod.toDataURL(text, {
    margin: 1,
    width: 260,
    errorCorrectionLevel: "M",
  });
}

function svgDataUrl(svg: string) {
  const encoded = encodeURIComponent(svg)
    .replace(/%0A/g, "")
    .replace(/%20/g, " ")
    .replace(/%3D/g, "=")
    .replace(/%3A/g, ":")
    .replace(/%2F/g, "/");
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
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

function uint8ToBlob(bytes: Uint8Array, mime: string) {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return new Blob([ab], { type: mime });
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

  const [ticketPdfBlob, setTicketPdfBlob] = useState<Blob | null>(null);
  const [ticketFileName, setTicketFileName] = useState<string | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [generatingTicket, setGeneratingTicket] = useState(false);

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

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

          if (res.status === 404) {
            setEventError("Nenhum evento encontrado para este convite.");
          } else {
            setEventError(data?.error ?? "Erro ao carregar informações do evento.");
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
  }, [effectiveSlug]);

  const formattedDate = formatDate(event?.eventDate);
  const trimmedLocation = useMemo(() => (event?.location ?? "").trim(), [event?.location]);
  const hasLocation = trimmedLocation.length > 0;

  const googleMapsUrl = useMemo(
    () => (hasLocation ? buildGoogleMapsUrl(trimmedLocation) : null),
    [hasLocation, trimmedLocation]
  );

  const wazeUrl = useMemo(() => (hasLocation ? buildWazeUrl(trimmedLocation) : null), [hasLocation, trimmedLocation]);

  const isPrePaid = event?.type === "PRE_PAGO";
  const checkoutSlug = event?.inviteSlug?.trim() || effectiveSlug || (event?.id ? event.id : "");
  const hasCheckout = isPrePaid && checkoutSlug;

  const confirmationPayloadText = useMemo(() => {
    const eventId = event?.id ?? "";
    const guestName = confirmedName ?? "";
    const slugText = effectiveSlug || "";
    const createdAt = new Date().toISOString();
    return JSON.stringify({ kind: "FREE_CONFIRMATION", eventId, inviteSlug: slugText, name: guestName, createdAt }, null, 0);
  }, [event?.id, confirmedName, effectiveSlug]);

  useEffect(() => {
    let active = true;

    async function genQr() {
      if (!event?.id || !confirmedName) return;
      try {
        setQrError(null);
        const url = await generateQrDataUrl(confirmationPayloadText);
        if (!active) return;
        setQrDataUrl(url);
      } catch (err) {
        console.error("[ConviteClient] QR error:", err);
        if (!active) return;
        setQrError("Não foi possível gerar o QR Code.");
      }
    }

    void genQr();
    return () => {
      active = false;
    };
  }, [event?.id, confirmedName, confirmationPayloadText]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Por favor, digite seu nome para confirmar a presença.");
      setConfirmedName(null);
      return;
    }

    if (!event || !event.id) {
      setFormError("Ainda não foi possível identificar o evento deste convite. Tente novamente.");
      setConfirmedName(null);
      return;
    }

    try {
      setConfirming(true);
      setFormError(null);

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
      setTicketPdfBlob(null);
      setTicketFileName(null);
      setTicketError(null);
    } catch (err) {
      console.error("[ConviteClient] Erro ao confirmar presença:", err);
      setFormError("Erro inesperado ao registrar a confirmação. Tente novamente.");
      setConfirmedName(null);
    } finally {
      setConfirming(false);
    }
  }

  async function buildTicketPdf(): Promise<{ blob: Blob; fileName: string }> {
    if (!event?.id || !confirmedName) throw new Error("missing data");

    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]); // A4
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    const marginX = 48;
    let y = 800;

    page.drawText("INGRESSO - EVENTO GRATUITO", {
      x: marginX,
      y,
      size: 18,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });

    y -= 30;
    page.drawText(`Evento: ${event.name}`, { x: marginX, y, size: 12, font, color: rgb(0.15, 0.15, 0.15) });

    y -= 18;
    if (formattedDate) {
      page.drawText(`Data: ${formattedDate}`, { x: marginX, y, size: 12, font, color: rgb(0.15, 0.15, 0.15) });
      y -= 18;
    }

    if (hasLocation) {
      page.drawText(`Local: ${trimmedLocation}`, { x: marginX, y, size: 12, font, color: rgb(0.15, 0.15, 0.15) });
      y -= 18;
    }

    page.drawText(`Convidado: ${confirmedName}`, {
      x: marginX,
      y,
      size: 12,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });

    y -= 26;
    page.drawText("Apresente este ingresso na entrada.", { x: marginX, y, size: 11, font, color: rgb(0.2, 0.2, 0.2) });

    if (qrDataUrl) {
      try {
        const dataPart = qrDataUrl.split(",")[1] ?? "";
        const bytes = Uint8Array.from(atob(dataPart), (c) => c.charCodeAt(0));
        const png = await doc.embedPng(bytes);
        page.drawImage(png, { x: marginX, y: 520, width: 180, height: 180 });
        page.drawText("QR Code de confirmação", { x: marginX, y: 505, size: 10, font, color: rgb(0.25, 0.25, 0.25) });
      } catch (err) {
        console.warn("[ConviteClient] Falha ao embutir QR no PDF:", err);
      }
    }

    const mapsLine = googleMapsUrl ? `Maps: ${googleMapsUrl}` : null;
    const wazeLine = wazeUrl ? `Waze: ${wazeUrl}` : null;

    let linksY = 470;
    if (mapsLine) {
      page.drawText(mapsLine, { x: marginX, y: linksY, size: 8, font, color: rgb(0.2, 0.35, 0.2) });
      linksY -= 12;
    }
    if (wazeLine) {
      page.drawText(wazeLine, { x: marginX, y: linksY, size: 8, font, color: rgb(0.2, 0.35, 0.2) });
    }

    const bytes = await doc.save();
    const blob = uint8ToBlob(bytes, "application/pdf");

    const fileName = `ingresso-${event.id.slice(0, 8)}.pdf`;
    return { blob, fileName };
  }

  async function handleGenerateTicket() {
    if (!event?.id || !confirmedName) return;

    try {
      setGeneratingTicket(true);
      setTicketError(null);
      const { blob, fileName } = await buildTicketPdf();
      setTicketPdfBlob(blob);
      setTicketFileName(fileName);
    } catch (err) {
      console.error("[ConviteClient] erro gerando ticket:", err);
      setTicketError("Não foi possível gerar o ingresso em PDF.");
    } finally {
      setGeneratingTicket(false);
    }
  }

  async function handleDownload() {
    if (!ticketPdfBlob || !ticketFileName) return;
    downloadBlob(ticketPdfBlob, ticketFileName);
  }

  async function handleShare() {
    if (!ticketPdfBlob || !ticketFileName) return;

    try {
      const file = new File([ticketPdfBlob], ticketFileName, { type: "application/pdf" });

      const nav = navigator as unknown as {
        share?: (data: { title?: string; text?: string; files?: File[] }) => Promise<void>;
        canShare?: (data: { files?: File[] }) => boolean;
      };

      const canShareFiles = typeof nav !== "undefined" && typeof nav.canShare === "function" ? nav.canShare({ files: [file] }) : false;

      if (typeof nav !== "undefined" && typeof nav.share === "function" && canShareFiles) {
        await nav.share({ title: "Ingresso do evento", text: `Ingresso - ${event?.name ?? "Evento"}`, files: [file] });
        return;
      }

      downloadBlob(ticketPdfBlob, ticketFileName);
    } catch (err) {
      console.error("[ConviteClient] share error:", err);
      downloadBlob(ticketPdfBlob, ticketFileName);
    }
  }

  const qrImgSrc = useMemo(() => {
    if (qrDataUrl) return qrDataUrl;
    if (!event?.id || !confirmedName) return null;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="260"><rect width="100%" height="100%" fill="#0b1220"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#9ca3af" font-family="Arial" font-size="14">Gerando QR...</text></svg>`;
    return svgDataUrl(svg);
  }, [qrDataUrl, event?.id, confirmedName]);

  return (
    <div className="min-h-screen bg-app text-app">
      <div className="max-w-2xl mx-auto px-4 py-10 flex flex-col gap-8">
        <header className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400">Confirmação de presença</p>
            <SessionStatus />
          </div>

          <h1 className="text-2xl sm:text-3xl font-semibold text-app">{event?.name ?? "Convite para evento"}</h1>
          <p className="text-sm text-muted max-w-xl">Confira os detalhes do evento e, em seguida, confirme sua presença preenchendo seu nome.</p>
        </header>

        <section className="space-y-3 text-sm">
          <h2 className="text-sm font-semibold text-app">Detalhes do evento</h2>

          <div className="rounded-2xl border border-[var(--border)] bg-card p-4 space-y-2">
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
                  {event.type === "FREE" ? "Evento gratuito" : event.type === "PRE_PAGO" ? "Evento pré-pago" : "Evento pós-pago"}
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

                {hasCheckout && (
                  <div className="pt-3 space-y-1">
                    <p className="text-[11px] text-muted">
                      Para garantir sua participação, clique em <span className="font-semibold text-app">Comprar ingresso</span> para fazer o pagamento online.
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

            {!loadingEvent && !eventError && !event && <p className="text-xs text-muted">Não foi possível carregar informações do evento.</p>}
          </div>
        </section>

        {hasLocation && (
          <section className="space-y-3 text-sm">
            <h2 className="text-sm font-semibold text-app">Como chegar</h2>
            <div className="rounded-2xl border border-[var(--border)] bg-card p-4 space-y-2">
              <p className="text-[11px] text-muted">Use os atalhos abaixo para abrir o endereço no seu aplicativo de mapas preferido.</p>
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

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted">Seu nome completo</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app placeholder:text-app0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                placeholder="Digite seu nome para confirmar presença"
                disabled={confirming || loadingEvent || !!eventError}
              />
            </div>

            {formError && <p className="text-[11px] text-red-400">{formError}</p>}

            <button
              type="submit"
              disabled={confirming || loadingEvent || !!eventError}
              className="mt-1 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
            >
              {confirming ? "Confirmando..." : "Confirmar presença"}
            </button>
          </form>

          {confirmedName && (
            <div className="mt-2 rounded-lg border border-emerald-700 bg-emerald-900/20 px-3 py-3 space-y-2">
              <div>
                <p className="text-xs text-emerald-300">
                  Presença confirmada para <span className="font-semibold">{confirmedName}</span>.
                </p>
                <p className="mt-1 text-[10px] text-emerald-200/80">
                  Se você estiver logado, este evento já foi salvo em <span className="font-semibold">Meus ingressos</span>.
                </p>
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-card p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-app">QR Code de confirmação</span>
                  {qrError && <span className="text-[11px] text-red-400">{qrError}</span>}
                </div>

                {qrImgSrc && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrImgSrc}
                    alt="QR Code de confirmação"
                    className="w-[220px] h-[220px] rounded-lg border border-[var(--border)] bg-app object-contain"
                  />
                )}

                <p className="text-[10px] text-muted">Este QR Code ajuda no check-in na entrada do evento.</p>
              </div>

              {ticketError && <p className="text-[11px] text-red-400">{ticketError}</p>}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleGenerateTicket}
                  disabled={generatingTicket}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
                >
                  {generatingTicket ? "Gerando ingresso..." : "Gerar ingresso (PDF)"}
                </button>

                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={!ticketPdfBlob || !ticketFileName}
                  className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-app hover:bg-card/70 disabled:opacity-50"
                >
                  Baixar
                </button>

                <button
                  type="button"
                  onClick={handleShare}
                  disabled={!ticketPdfBlob || !ticketFileName}
                  className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-app hover:bg-card/70 disabled:opacity-50"
                >
                  Compartilhar
                </button>
              </div>
            </div>
          )}
        </section>

        <footer className="pt-4 border-t border-[var(--border)] text-[11px] text-app0 flex flex-wrap items-center justify-between gap-2">
          <span className="break-all">
            Código do convite: <span className="text-muted">{effectiveSlug || "(não informado)"}</span>
          </span>
          {confirmedName && <span className="text-emerald-300">Obrigado por confirmar sua presença ✨</span>}
        </footer>
      </div>
    </div>
  );
}
