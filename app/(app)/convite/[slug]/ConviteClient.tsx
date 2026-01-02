"use client";

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

type WebShareNavigator = Navigator & {
  share?: (data: {
    files?: File[];
    title?: string;
    text?: string;
    url?: string;
  }) => Promise<void>;
  canShare?: (data: { files?: File[] }) => boolean;
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

async function generateTicketPdf(params: {
  event: Event;
  attendeeName: string;
  inviteCode: string;
}) {
  const { event, attendeeName, inviteCode } = params;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 48;
  const cardX = margin;
  const cardY = height - margin - 260;
  const cardW = width - margin * 2;
  const cardH = 260;

  // fundo do card
  page.drawRectangle({
    x: cardX,
    y: cardY,
    width: cardW,
    height: cardH,
    borderColor: rgb(0.12, 0.12, 0.12),
    borderWidth: 1,
    color: rgb(0.97, 0.97, 0.97),
  });

  // faixa superior
  page.drawRectangle({
    x: cardX,
    y: cardY + cardH - 56,
    width: cardW,
    height: 56,
    color: rgb(0.06, 0.55, 0.31), // verde
  });

  page.drawText("INGRESSO", {
    x: cardX + 18,
    y: cardY + cardH - 38,
    size: 18,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  const typeLabel =
    event.type === "FREE"
      ? "Evento gratuito"
      : event.type === "PRE_PAGO"
      ? "Evento pré-pago"
      : "Evento pós-pago";

  page.drawText(typeLabel, {
    x: cardX + cardW - 18 - fontRegular.widthOfTextAtSize(typeLabel, 10),
    y: cardY + cardH - 34,
    size: 10,
    font: fontRegular,
    color: rgb(1, 1, 1),
  });

  const title = event.name || "Evento";
  page.drawText(title, {
    x: cardX + 18,
    y: cardY + cardH - 86,
    size: 16,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  const dateLabel = formatDate(event.eventDate) ?? "—";
  const locationLabel = (event.location ?? "").trim() || "—";

  const lines: Array<[string, string]> = [
    ["Participante", attendeeName],
    ["Data", dateLabel],
    ["Local", locationLabel],
    ["Código do convite", inviteCode],
    ["Emitido em", formatDate(new Date().toISOString()) ?? "—"],
  ];

  let y = cardY + cardH - 120;
  for (const [k, v] of lines) {
    page.drawText(`${k}:`, {
      x: cardX + 18,
      y,
      size: 10,
      font: fontBold,
      color: rgb(0.15, 0.15, 0.15),
    });

    const valueX = cardX + 18 + 110;
    const safeV = String(v ?? "");
    page.drawText(safeV, {
      x: valueX,
      y,
      size: 10,
      font: fontRegular,
      color: rgb(0.15, 0.15, 0.15),
    });

    y -= 18;
  }

  page.drawText(
    "Apresente este ingresso na entrada do evento (arquivo PDF).",
    {
      x: cardX + 18,
      y: cardY + 22,
      size: 9,
      font: fontRegular,
      color: rgb(0.25, 0.25, 0.25),
    }
  );

  const savedBytes = await pdfDoc.save();
  // IMPORTANT: cria um Uint8Array padrão (ArrayBuffer), compatível com BlobPart no TS
  const bytes = new Uint8Array(savedBytes);
  const blob = new Blob([bytes], { type: "application/pdf" });

  const fileName = `ingresso-${(event.id ?? "evento").slice(0, 8)}.pdf`;
  const file = new File([blob], fileName, { type: "application/pdf" });

  const objectUrl = URL.createObjectURL(blob);
  return { blob, file, fileName, objectUrl };
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

  const [ticketUrl, setTicketUrl] = useState<string | null>(null);
  const [ticketFile, setTicketFile] = useState<File | null>(null);
  const [ticketFileName, setTicketFileName] = useState<string | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [generatingTicket, setGeneratingTicket] = useState(false);

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

        const res = await fetch(
          `/api/events/by-invite/${encodeURIComponent(effectiveSlug)}`
        );

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

  useEffect(() => {
    // cleanup do objectURL antigo
    return () => {
      if (ticketUrl) URL.revokeObjectURL(ticketUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formattedDate = useMemo(() => formatDate(event?.eventDate), [event?.eventDate]);

  const trimmedLocation = (event?.location ?? "").trim();
  const hasLocation = trimmedLocation.length > 0;

  const googleMapsUrl = hasLocation
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmedLocation)}`
    : null;

  const wazeUrl = hasLocation
    ? `https://waze.com/ul?q=${encodeURIComponent(trimmedLocation)}&navigate=yes`
    : null;

  const isPrePaid = event?.type === "PRE_PAGO";

  const checkoutSlug =
    event?.inviteSlug?.trim() ||
    effectiveSlug ||
    (event?.id ? event.id : "");

  const hasCheckout = isPrePaid && checkoutSlug;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Por favor, digite seu nome para confirmar a presença.");
      setConfirmedName(null);
      return;
    }

    if (!event || !event.id) {
      setFormError("Ainda não foi possível identificar o evento. Tente novamente.");
      setConfirmedName(null);
      return;
    }

    try {
      setConfirming(true);
      setFormError(null);
      setTicketError(null);

      const res = await fetch(`/api/events/${event.id}/confirmados`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setFormError(data?.error ?? "Erro ao registrar a confirmação de presença.");
        setConfirmedName(null);
        return;
      }

      setConfirmedName(trimmed);

      // gera ingresso PDF logo após confirmar (evento FREE)
      if (event.type === "FREE") {
        await handleGenerateTicket(trimmed);
      }
    } catch (err) {
      console.error("[ConviteClient] Erro ao confirmar presença:", err);
      setFormError("Erro inesperado ao registrar a confirmação. Tente novamente.");
      setConfirmedName(null);
    } finally {
      setConfirming(false);
    }
  }

  async function handleGenerateTicket(attendeeName?: string) {
    if (!event) return;
    if (event.type !== "FREE") return;

    const person = (attendeeName ?? confirmedName ?? name).trim();
    if (!person) {
      setTicketError("Digite seu nome para gerar o ingresso.");
      return;
    }

    try {
      setGeneratingTicket(true);
      setTicketError(null);

      // revoke antigo
      if (ticketUrl) URL.revokeObjectURL(ticketUrl);

      const { file, fileName, objectUrl } = await generateTicketPdf({
        event,
        attendeeName: person,
        inviteCode: effectiveSlug || "(não informado)",
      });

      setTicketUrl(objectUrl);
      setTicketFile(file);
      setTicketFileName(fileName);
    } catch (err) {
      console.error("[ConviteClient] Erro ao gerar ingresso:", err);
      setTicketError("Não foi possível gerar o ingresso. Tente novamente.");
    } finally {
      setGeneratingTicket(false);
    }
  }

  function handleDownloadTicket() {
    if (!ticketUrl) return;
    const a = document.createElement("a");
    a.href = ticketUrl;
    a.download = ticketFileName ?? "ingresso.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function handleShareTicket() {
    if (!ticketFile || !ticketUrl) return;

    const nav = navigator as WebShareNavigator;

    // Tenta Web Share com arquivo (melhor experiência no mobile/WhatsApp)
    try {
      const canShareFiles =
        typeof nav !== "undefined" &&
        typeof nav.share === "function" &&
        typeof nav.canShare === "function" &&
        nav.canShare({ files: [ticketFile] });

      if (canShareFiles && typeof nav.share === "function") {
        await nav.share({
          files: [ticketFile],
          title: "Ingresso",
          text: "Segue meu ingresso do evento.",
        });
        return;
      }
    } catch (err) {
      console.warn("[ConviteClient] share(files) falhou:", err);
    }

    // Fallback: abre o PDF em nova aba (usuário pode compartilhar por lá)
    window.open(ticketUrl, "_blank", "noopener,noreferrer");
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
            Confira os detalhes do evento e confirme sua presença. Após confirmar,
            você poderá baixar ou compartilhar seu ingresso (PDF).
          </p>
        </header>

        <section className="space-y-3 text-sm">
          <h2 className="text-sm font-semibold text-app">Detalhes do evento</h2>

          <div className="rounded-2xl border border-[var(--border)] bg-card p-4 space-y-2">
            {loadingEvent && (
              <p className="text-xs text-muted">Carregando informações do evento...</p>
            )}

            {!loadingEvent && eventError && (
              <p className="text-xs text-red-400">{eventError}</p>
            )}

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
                      para pagar online. Você precisará fazer login antes de pagar.
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
              <p className="text-xs text-muted">Não foi possível carregar informações do evento.</p>
            )}
          </div>
        </section>

        {hasLocation && (
          <section className="space-y-3 text-sm">
            <h2 className="text-sm font-semibold text-app">Como chegar</h2>
            <div className="rounded-2xl border border-[var(--border)] bg-card p-4 space-y-2">
              <p className="text-[11px] text-muted">
                Use os atalhos abaixo para abrir o endereço no seu app de mapas.
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
            <div className="mt-2 rounded-lg border border-emerald-700 bg-emerald-900/20 px-3 py-2">
              <p className="text-xs text-emerald-300">
                Presença confirmada para <span className="font-semibold">{confirmedName}</span>.
              </p>
              <p className="mt-1 text-[10px] text-emerald-200/80">
                A confirmação foi registrada na lista de confirmados do evento.
              </p>
            </div>
          )}

          {/* Ingresso FREE: baixar/compartilhar */}
          {event?.type === "FREE" && confirmedName && (
            <div className="mt-3 rounded-2xl border border-[var(--border)] bg-card p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-app">Seu ingresso (PDF)</h3>

                <button
                  type="button"
                  onClick={() => void handleGenerateTicket(confirmedName)}
                  disabled={generatingTicket}
                  className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-app hover:bg-card/70 disabled:opacity-60"
                >
                  {generatingTicket ? "Gerando..." : ticketUrl ? "Gerar novamente" : "Gerar ingresso"}
                </button>
              </div>

              {ticketError && <p className="text-[11px] text-red-400">{ticketError}</p>}

              {ticketUrl && (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadTicket}
                      className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-500"
                    >
                      Baixar PDF
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleShareTicket()}
                      className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-2 text-[11px] font-semibold text-app hover:bg-card/70"
                    >
                      Compartilhar
                    </button>

                    <a
                      href={ticketUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-2 text-[11px] font-semibold text-app hover:bg-card/70"
                    >
                      Abrir PDF
                    </a>
                  </div>

                  <p className="text-[10px] text-app0">
                    Dica: no celular, o botão “Compartilhar” normalmente permite enviar direto pelo WhatsApp
                    quando o navegador suporta compartilhamento de arquivos.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        <footer className="pt-4 border-t border-[var(--border)] text-[11px] text-app0 flex flex-wrap items-center justify-between gap-2">
          <span className="break-all">
            Código do convite:{" "}
            <span className="text-muted">{effectiveSlug || "(não informado)"}</span>
          </span>

          {confirmedName && (
            <span className="text-emerald-300">Obrigado por confirmar sua presença ✨</span>
          )}
        </footer>
      </div>
    </div>
  );
}
