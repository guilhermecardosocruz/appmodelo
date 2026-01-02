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

  page.drawRectangle({
    x: cardX,
    y: cardY,
    width: cardW,
    height: cardH,
    borderColor: rgb(0.12, 0.12, 0.12),
    borderWidth: 1,
    color: rgb(0.97, 0.97, 0.97),
  });

  page.drawRectangle({
    x: cardX,
    y: cardY + cardH - 56,
    width: cardW,
    height: 56,
    color: rgb(0.06, 0.55, 0.31),
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
    page.drawText(String(v ?? ""), {
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
  const bytes = new Uint8Array(savedBytes);
  const blob = new Blob([bytes], { type: "application/pdf" });

  const fileName = `ingresso-${(event.id ?? "evento").slice(0, 8)}.pdf`;
  const file = new File([blob], fileName, { type: "application/pdf" });

  const objectUrl = URL.createObjectURL(blob);
  return { blob, file, fileName, objectUrl };
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

  const [ticketUrl, setTicketUrl] = useState<string | null>(null);
  const [ticketFile, setTicketFile] = useState<File | null>(null);
  const [ticketFileName, setTicketFileName] = useState<string | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [generatingTicket, setGeneratingTicket] = useState(false);

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
          // Se já confirmado e for FREE, já deixa gerar o PDF
          if (data.event.type === "FREE") {
            void handleGenerateTicket(data.event, data.guest.name, data.guest.slug);
          }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSlug]);

  useEffect(() => {
    return () => {
      if (ticketUrl) URL.revokeObjectURL(ticketUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formattedDate = useMemo(() => formatDate(event?.eventDate), [event?.eventDate]);
  const isConfirmed = !!guest?.confirmedAt;

  const trimmedLocation = (event?.location ?? "").trim();
  const hasLocation = trimmedLocation.length > 0;

  const googleMapsUrl = hasLocation
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmedLocation)}`
    : null;

  const wazeUrl = hasLocation
    ? `https://waze.com/ul?q=${encodeURIComponent(trimmedLocation)}&navigate=yes`
    : null;

  const isPrePaid = event?.type === "PRE_PAGO";

  async function handleConfirm() {
    if (!guest) return;

    try {
      setConfirming(true);
      setConfirmError(null);
      setConfirmSuccess(null);
      setTicketError(null);

      const res = await fetch(`/api/events/guests/${encodeURIComponent(guest.slug)}`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setConfirmError(data?.error ?? "Erro ao registrar sua confirmação de presença.");
        return;
      }

      const updated = (await res.json()) as { confirmedAt?: string | null };

      const confirmedAt = updated.confirmedAt ?? new Date().toISOString();
      setGuest((prev) => (prev ? { ...prev, confirmedAt } : prev));
      setConfirmSuccess("Sua presença foi confirmada com sucesso.");

      if (event?.type === "FREE") {
        await handleGenerateTicket(event, guest.name, guest.slug);
      }
    } catch (err) {
      console.error("[GuestInviteClient] Erro ao confirmar presença:", err);
      setConfirmError("Erro inesperado ao registrar a confirmação. Tente novamente.");
    } finally {
      setConfirming(false);
    }
  }

  async function handleGenerateTicket(ev: Event, attendeeName: string, inviteCode: string) {
    try {
      setGeneratingTicket(true);
      setTicketError(null);

      if (ticketUrl) URL.revokeObjectURL(ticketUrl);

      const { file, fileName, objectUrl } = await generateTicketPdf({
        event: ev,
        attendeeName,
        inviteCode,
      });

      setTicketUrl(objectUrl);
      setTicketFile(file);
      setTicketFileName(fileName);
    } catch (err) {
      console.error("[GuestInviteClient] Erro ao gerar ingresso:", err);
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
      console.warn("[GuestInviteClient] share(files) falhou:", err);
    }

    window.open(ticketUrl, "_blank", "noopener,noreferrer");
  }

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
            Veja os detalhes e confirme sua presença. Após confirmar, você poderá baixar ou compartilhar seu ingresso (PDF).
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
                      Para garantir sua participação, realize o pagamento pelo link abaixo e, em seguida, confirme sua presença.
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
          <h2 className="text-sm font-semibold text-app">Confirmação de presença</h2>

          {error && (
            <p className="text-xs text-red-400">Não é possível confirmar presença: {error}</p>
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

              {confirmError && <p className="text-[11px] text-red-400">{confirmError}</p>}

              {confirmSuccess && (
                <div className="mt-2 rounded-lg border border-emerald-700 bg-emerald-900/20 px-3 py-2">
                  <p className="text-xs text-emerald-300">{confirmSuccess}</p>
                  <p className="mt-1 text-[10px] text-emerald-200/80">
                    Sua confirmação já foi registrada para o organizador deste evento.
                  </p>
                </div>
              )}
            </>
          )}

          {/* Ingresso FREE: baixar/compartilhar (sempre que confirmado) */}
          {event?.type === "FREE" && isConfirmed && guest && (
            <div className="mt-3 rounded-2xl border border-[var(--border)] bg-card p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-app">Seu ingresso (PDF)</h3>

                <button
                  type="button"
                  onClick={() => void handleGenerateTicket(event, guest.name, guest.slug)}
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
                    Dica: no celular, “Compartilhar” normalmente permite enviar direto pelo WhatsApp se o navegador suportar.
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

          {isConfirmed && <span className="text-emerald-300">Obrigado por confirmar sua presença ✨</span>}
        </footer>
      </div>
    </div>
  );
}
