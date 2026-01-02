"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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

function buildMapsLinks(location: string | null | undefined) {
  const trimmed = String(location ?? "").trim();
  const hasLocation = trimmed.length > 0;

  const googleMapsUrl = hasLocation
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`
    : null;

  const wazeUrl = hasLocation
    ? `https://waze.com/ul?q=${encodeURIComponent(trimmed)}&navigate=yes`
    : null;

  return { hasLocation, googleMapsUrl, wazeUrl };
}

function bytesToBlob(bytes: Uint8Array, mime: string) {
  // garante um Uint8Array "normal" com ArrayBuffer compatível
  const safeBytes = Uint8Array.from(bytes);
  return new Blob([safeBytes], { type: mime });
}

type ShareNavigator = Navigator & {
  canShare?: (data?: { files?: File[]; title?: string; text?: string; url?: string }) => boolean;
};

async function generateQrDataUrl(text: string): Promise<string> {
  // evita problemas de bundle/SSR: importa no runtime do client
  const mod = (await import("qrcode")) as unknown as {
    toDataURL: (t: string, opts?: { margin?: number; width?: number; errorCorrectionLevel?: "L" | "M" | "Q" | "H" }) => Promise<string>;
  };

  return mod.toDataURL(text, {
    margin: 1,
    width: 512,
    errorCorrectionLevel: "M",
  });
}

async function dataUrlToBytes(dataUrl: string): Promise<Uint8Array> {
  const res = await fetch(dataUrl);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
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

  // Ticket (PDF) state
  const [ticketBusy, setTicketBusy] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [ticketInfo, setTicketInfo] = useState<string | null>(null);
  const [qrPreviewDataUrl, setQrPreviewDataUrl] = useState<string | null>(null);

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

        const res = await fetch(`/api/events/by-invite/${encodeURIComponent(effectiveSlug)}`);

        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Por favor, digite seu nome para confirmar a presença.");
      setConfirmedName(null);
      return;
    }

    if (!event || !event.id) {
      setFormError("Ainda não foi possível identificar o evento deste convite. Tente novamente em alguns segundos.");
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
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setFormError(data?.error ?? "Erro ao registrar a confirmação de presença.");
        setConfirmedName(null);
        return;
      }

      setConfirmedName(trimmed);
    } catch (err) {
      console.error("[ConviteClient] Erro ao confirmar presença:", err);
      setFormError("Erro inesperado ao registrar a confirmação. Tente novamente.");
      setConfirmedName(null);
    } finally {
      setConfirming(false);
    }
  }

  const formattedDate = formatDate(event?.eventDate);
  const { hasLocation, googleMapsUrl, wazeUrl } = useMemo(
    () => buildMapsLinks(event?.location),
    [event?.location],
  );

  const isPrePaid = event?.type === "PRE_PAGO";

  const checkoutSlug =
    event?.inviteSlug?.trim() ||
    effectiveSlug ||
    (event?.id ? event.id : "");

  const hasCheckout = isPrePaid && checkoutSlug;

  const verifyUrl = useMemo(() => {
    // QR para check-in na entrada (pode ser lido e abrir o link no celular do organizador)
    // Coloquei algo estável: a própria URL do convite + indicador de check-in.
    // Se depois você criar um endpoint de validação, é só trocar aqui.
    if (typeof window === "undefined") return "";
    const base = window.location.origin;
    return `${base}/convite/${encodeURIComponent(effectiveSlug)}?checkin=1`;
  }, [effectiveSlug]);

  async function ensureQrPreview() {
    if (qrPreviewDataUrl) return;
    try {
      const dataUrl = await generateQrDataUrl(verifyUrl);
      setQrPreviewDataUrl(dataUrl);
    } catch (err) {
      console.error("[ConviteClient] Erro ao gerar preview QR:", err);
      setQrPreviewDataUrl(null);
    }
  }

  async function generateTicketPdfBytes() {
    if (!event || !confirmedName) {
      throw new Error("Evento ou nome confirmado ausente.");
    }

    // QR data
    const qrDataUrl = await generateQrDataUrl(verifyUrl);
    const qrBytes = await dataUrlToBytes(qrDataUrl);

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const primary = rgb(0.06, 0.72, 0.50); // emerald-ish
    const muted = rgb(0.45, 0.45, 0.45);

    // Header
    page.drawText("INGRESSO", { x: 50, y: 790, size: 24, font: fontBold, color: primary });
    page.drawText("Confirmação de presença", { x: 50, y: 770, size: 12, font, color: muted });

    // Box
    page.drawRectangle({
      x: 50,
      y: 520,
      width: 495,
      height: 220,
      borderColor: rgb(0.85, 0.85, 0.85),
      borderWidth: 1,
      color: rgb(0.98, 0.98, 0.98),
    });

    // Event info
    const eventName = event.name || "Evento";
    page.drawText("Evento:", { x: 70, y: 710, size: 12, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(eventName, { x: 140, y: 710, size: 12, font, color: rgb(0.1, 0.1, 0.1) });

    page.drawText("Participante:", { x: 70, y: 685, size: 12, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(confirmedName, { x: 170, y: 685, size: 12, font, color: rgb(0.1, 0.1, 0.1) });

    if (formattedDate) {
      page.drawText("Data:", { x: 70, y: 660, size: 12, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
      page.drawText(formattedDate, { x: 140, y: 660, size: 12, font, color: rgb(0.1, 0.1, 0.1) });
    }

    const loc = String(event.location ?? "").trim();
    if (loc) {
      page.drawText("Local:", { x: 70, y: 635, size: 12, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
      page.drawText(loc, { x: 140, y: 635, size: 12, font, color: rgb(0.1, 0.1, 0.1), maxWidth: 260 });
    }

    // QR
    const qrImage = await pdfDoc.embedPng(qrBytes);
    const qrSize = 140;

    page.drawText("QR de validação", { x: 380, y: 710, size: 12, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
    page.drawImage(qrImage, { x: 380, y: 560, width: qrSize, height: qrSize });

    page.drawText("Use na entrada do evento", { x: 380, y: 545, size: 9, font, color: muted });

    // Footer
    page.drawText("Dica:", { x: 50, y: 480, size: 10, font: fontBold, color: muted });
    page.drawText("Você pode baixar ou compartilhar este PDF pelo WhatsApp.", { x: 80, y: 480, size: 10, font, color: muted });

    page.drawText("Código do convite:", { x: 50, y: 460, size: 10, font: fontBold, color: muted });
    page.drawText(effectiveSlug || "-", { x: 155, y: 460, size: 10, font, color: muted });

    // PDF bytes
    const saved = await pdfDoc.save();
    return Uint8Array.from(saved);
  }

  async function downloadOrShareTicket(action: "download" | "share") {
    try {
      setTicketBusy(true);
      setTicketError(null);
      setTicketInfo(null);

      await ensureQrPreview();

      const bytes = await generateTicketPdfBytes();
      const blob = bytesToBlob(bytes, "application/pdf");

      const fileName = `ingresso-${(event?.id ?? "evento").slice(0, 8)}.pdf`;
      const file = new File([blob], fileName, { type: "application/pdf" });

      const nav = navigator as ShareNavigator;

      if (action === "share" && typeof nav.share === "function") {
        const canShareFiles = typeof nav.canShare === "function" ? nav.canShare({ files: [file] }) : false;

        if (canShareFiles) {
          await nav.share({
            title: "Ingresso do evento",
            text: "Segue meu ingresso em PDF.",
            files: [file],
          });
          setTicketInfo("Ingresso compartilhado com sucesso.");
          return;
        }
      }

      // fallback download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setTicketInfo(action === "share"
        ? "Seu dispositivo não suportou compartilhamento com arquivo. Baixamos o PDF para você compartilhar manualmente."
        : "Ingresso baixado em PDF."
      );
    } catch (err) {
      console.error("[ConviteClient] Erro ao gerar/baixar/compartilhar ingresso:", err);
      setTicketError("Não foi possível gerar o ingresso agora. Tente novamente.");
    } finally {
      setTicketBusy(false);
    }
  }

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
            Confira os detalhes do evento e, em seguida, confirme sua presença preenchendo seu nome logo abaixo.
          </p>
        </header>

        <section className="space-y-3 text-sm">
          <h2 className="text-sm font-semibold text-app">Detalhes do evento</h2>

          <div className="rounded-2xl border border-[var(--border)] bg-card p-4 space-y-2">
            {loadingEvent && <p className="text-xs text-muted">Carregando informações do evento...</p>}

            {!loadingEvent && eventError && <p className="text-xs text-red-400">{eventError}</p>}

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
                    <span className="font-semibold text-app">Local:</span>{" "}
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
                    <span className="font-semibold text-app">Descrição:</span>{" "}
                    {event.description}
                  </p>
                )}

                {isPrePaid && event.ticketPrice && (
                  <p className="pt-1">
                    <span className="font-semibold text-app">Valor do ingresso:</span>{" "}
                    {event.ticketPrice}
                  </p>
                )}

                {hasCheckout && (
                  <div className="pt-3 space-y-1">
                    <p className="text-[11px] text-muted">
                      Para garantir sua participação, clique em{" "}
                      <span className="font-semibold text-app">Comprar ingresso</span>{" "}
                      para fazer o pagamento online. Você precisará criar uma conta ou fazer login antes de pagar.
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
              <p className="text-xs text-emerald-300">
                Presença confirmada para <span className="font-semibold">{confirmedName}</span>.
              </p>

              <p className="text-[10px] text-emerald-200/80">
                Agora você pode gerar seu ingresso com QR para apresentar na entrada.
              </p>

              {qrPreviewDataUrl && (
                <div className="flex items-center gap-3 pt-1">
                  <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-[var(--border)] bg-card">
                    <Image
                      src={qrPreviewDataUrl}
                      alt="QR Code de validação"
                      fill
                      sizes="80px"
                      className="object-contain"
                    />
                  </div>
                  <div className="text-[10px] text-emerald-200/80">
                    <div className="font-semibold text-emerald-200">QR de validação</div>
                    <div>Use na entrada do evento</div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => void downloadOrShareTicket("download")}
                  disabled={ticketBusy}
                  className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-2 text-[11px] font-semibold text-app hover:bg-card/70 disabled:opacity-60"
                >
                  {ticketBusy ? "Gerando..." : "Baixar PDF"}
                </button>

                <button
                  type="button"
                  onClick={() => void downloadOrShareTicket("share")}
                  disabled={ticketBusy}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
                >
                  {ticketBusy ? "Gerando..." : "Compartilhar"}
                </button>
              </div>

              {ticketError && <p className="text-[11px] text-red-300">{ticketError}</p>}
              {ticketInfo && <p className="text-[11px] text-emerald-200/80">{ticketInfo}</p>}
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
