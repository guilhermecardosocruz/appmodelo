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
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    location,
  )}`;
}

function buildWazeUrl(location: string) {
  return `https://waze.com/ul?q=${encodeURIComponent(location)}&navigate=yes`;
}

async function generateQrDataUrl(text: string): Promise<string> {
  // Tipagem local pra não depender de @types/qrcode
  const mod = (await import("qrcode")) as unknown as {
    toDataURL: (
      t: string,
      opts?: {
        margin?: number;
        width?: number;
        errorCorrectionLevel?: "L" | "M" | "Q" | "H";
      },
    ) => Promise<string>;
  };

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

  // ticket state
  const [ticketPdfBlob, setTicketPdfBlob] = useState<Blob | null>(null);
  const [ticketFileName, setTicketFileName] = useState<string | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [generatingTicket, setGeneratingTicket] = useState(false);

  // qr state
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

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

        setTicketPdfBlob(null);
        setTicketFileName(null);
        setTicketError(null);
        setGeneratingTicket(false);

        setQrDataUrl(null);
        setQrError(null);

        if (!effectiveSlug) {
          setError("Código de convite inválido.");
          return;
        }

        const res = await fetch(
          `/api/events/guests/${encodeURIComponent(effectiveSlug)}`,
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

  const formattedDate = useMemo(
    () => formatDate(event?.eventDate),
    [event?.eventDate],
  );

  const isConfirmed = !!guest?.confirmedAt;
  const isPrePaid = event?.type === "PRE_PAGO";

  const trimmedLocation = useMemo(
    () => (event?.location ?? "").trim(),
    [event?.location],
  );
  const hasLocation = trimmedLocation.length > 0;

  const googleMapsUrl = useMemo(
    () => (hasLocation ? buildGoogleMapsUrl(trimmedLocation) : null),
    [hasLocation, trimmedLocation],
  );

  const wazeUrl = useMemo(
    () => (hasLocation ? buildWazeUrl(trimmedLocation) : null),
    [hasLocation, trimmedLocation],
  );

  const confirmationPayloadText = useMemo(() => {
    const eventId = event?.id ?? "";
    const guestName = guest?.name ?? "";
    const guestSlug = guest?.slug ?? "";
    const confirmedAt = guest?.confirmedAt ?? null;

    return JSON.stringify(
      {
        kind: "GUEST_CONFIRMATION",
        eventId,
        guestSlug,
        name: guestName,
        confirmedAt,
      },
      null,
      0,
    );
  }, [event?.id, guest?.name, guest?.slug, guest?.confirmedAt]);

  useEffect(() => {
    let active = true;

    async function genQr() {
      if (!event?.id || !guest?.name || !isConfirmed) return;

      try {
        setQrError(null);
        const url = await generateQrDataUrl(confirmationPayloadText);
        if (!active) return;
        setQrDataUrl(url);
      } catch (err) {
        console.error("[GuestInviteClient] QR error:", err);
        if (!active) return;
        setQrError("Não foi possível gerar o QR Code.");
      }
    }

    void genQr();
    return () => {
      active = false;
    };
  }, [event?.id, guest?.name, isConfirmed, confirmationPayloadText]);

  async function handleConfirm() {
    if (!guest) return;

    try {
      setConfirming(true);
      setConfirmError(null);
      setConfirmSuccess(null);

      const res = await fetch(
        `/api/events/guests/${encodeURIComponent(guest.slug)}`,
        { method: "POST" },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setConfirmError(
          data?.error ?? "Erro ao registrar sua confirmação de presença.",
        );
        return;
      }

      const updated = (await res.json()) as { confirmedAt?: string | null };

      setGuest((prev) =>
        prev
          ? {
              ...prev,
              confirmedAt: updated.confirmedAt ?? new Date().toISOString(),
            }
          : prev,
      );

      setConfirmSuccess("Sua presença foi confirmada com sucesso.");

      // reseta ticket gerado (vai regenerar com QR e status atual)
      setTicketPdfBlob(null);
      setTicketFileName(null);
      setTicketError(null);
    } catch (err) {
      console.error("[GuestInviteClient] Erro ao confirmar presença:", err);
      setConfirmError(
        "Erro inesperado ao registrar a confirmação. Tente novamente.",
      );
    } finally {
      setConfirming(false);
    }
  }

  async function buildTicketPdf(): Promise<{ blob: Blob; fileName: string }> {
    if (!event?.id || !guest?.name) throw new Error("missing data");

    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]); // A4
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    const marginX = 48;
    let y = 800;

    page.drawText("INGRESSO - EVENTO", {
      x: marginX,
      y,
      size: 18,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });

    y -= 30;
    page.drawText(`Evento: ${event.name}`, {
      x: marginX,
      y,
      size: 12,
      font,
      color: rgb(0.15, 0.15, 0.15),
    });

    y -= 18;
    if (formattedDate) {
      page.drawText(`Data: ${formattedDate}`, {
        x: marginX,
        y,
        size: 12,
        font,
        color: rgb(0.15, 0.15, 0.15),
      });
      y -= 18;
    }

    if (hasLocation) {
      page.drawText(`Local: ${trimmedLocation}`, {
        x: marginX,
        y,
        size: 12,
        font,
        color: rgb(0.15, 0.15, 0.15),
      });
      y -= 18;
    }

    page.drawText(`Convidado: ${guest.name}`, {
      x: marginX,
      y,
      size: 12,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });

    y -= 26;
    page.drawText("Apresente este ingresso na entrada.", {
      x: marginX,
      y,
      size: 11,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });

    // QR embutido no PDF (se já estiver pronto)
    if (qrDataUrl) {
      try {
        const dataPart = qrDataUrl.split(",")[1] ?? "";
        const pngBytes = Uint8Array.from(atob(dataPart), (c) =>
          c.charCodeAt(0),
        );
        const png = await doc.embedPng(pngBytes);

        page.drawImage(png, {
          x: marginX,
          y: 520,
          width: 180,
          height: 180,
        });

        page.drawText("QR Code de confirmação", {
          x: marginX,
          y: 505,
          size: 10,
          font,
          color: rgb(0.25, 0.25, 0.25),
        });
      } catch (err) {
        console.warn("[GuestInviteClient] Falha ao embutir QR no PDF:", err);
      }
    }

    // Links para deslocamento (Maps/Waze) dentro do PDF
    const mapsLine = googleMapsUrl ? `Maps: ${googleMapsUrl}` : null;
    const wazeLine = wazeUrl ? `Waze: ${wazeUrl}` : null;

    let linksY = 470;
    if (mapsLine) {
      page.drawText(mapsLine, {
        x: marginX,
        y: linksY,
        size: 8,
        font,
        color: rgb(0.2, 0.35, 0.2),
      });
      linksY -= 12;
    }
    if (wazeLine) {
      page.drawText(wazeLine, {
        x: marginX,
        y: linksY,
        size: 8,
        font,
        color: rgb(0.2, 0.35, 0.2),
      });
    }

    // ✅ FIX BlobPart: garante Uint8Array "safe" com ArrayBuffer (sem SharedArrayBuffer/ArrayBufferLike no tipo)
    const raw = await doc.save(); // Uint8Array
    const safeBytes = new Uint8Array(raw); // força buffer ArrayBuffer tipado corretamente
    const blob = new Blob([safeBytes], { type: "application/pdf" });

    const fileName = `ingresso-${event.id.slice(0, 8)}.pdf`;
    return { blob, fileName };
  }

  async function handleGenerateTicket() {
    if (!event?.id || !guest?.name || !isConfirmed) return;

    try {
      setGeneratingTicket(true);
      setTicketError(null);

      const { blob, fileName } = await buildTicketPdf();
      setTicketPdfBlob(blob);
      setTicketFileName(fileName);
    } catch (err) {
      console.error("[GuestInviteClient] erro gerando ticket:", err);
      setTicketError("Não foi possível gerar o ingresso em PDF.");
    } finally {
      setGeneratingTicket(false);
    }
  }

  function handleDownload() {
    if (!ticketPdfBlob || !ticketFileName) return;
    downloadBlob(ticketPdfBlob, ticketFileName);
  }

  async function handleShare() {
    if (!ticketPdfBlob || !ticketFileName) return;

    try {
      const file = new File([ticketPdfBlob], ticketFileName, {
        type: "application/pdf",
      });

      const nav = navigator as unknown as {
        share?: (data: {
          title?: string;
          text?: string;
          files?: File[];
        }) => Promise<void>;
        canShare?: (data: { files?: File[] }) => boolean;
      };

      const canShareFiles =
        typeof nav !== "undefined" && typeof nav.canShare === "function"
          ? nav.canShare({ files: [file] })
          : false;

      if (
        typeof nav !== "undefined" &&
        typeof nav.share === "function" &&
        canShareFiles
      ) {
        await nav.share({
          title: "Ingresso do evento",
          text: `Ingresso - ${event?.name ?? "Evento"}`,
          files: [file],
        });
        return;
      }

      downloadBlob(ticketPdfBlob, ticketFileName);
    } catch (err) {
      console.error("[GuestInviteClient] share error:", err);
      downloadBlob(ticketPdfBlob, ticketFileName);
    }
  }

  const qrImgSrc = useMemo(() => {
    if (qrDataUrl) return qrDataUrl;
    if (!event?.id || !guest?.name || !isConfirmed) return null;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="260"><rect width="100%" height="100%" fill="#0b1220"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#9ca3af" font-family="Arial" font-size="14">Gerando QR...</text></svg>`;
    return svgDataUrl(svg);
  }, [qrDataUrl, event?.id, guest?.name, isConfirmed]);

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
          <h2 className="text-sm font-semibold text-app">Detalhes do evento</h2>

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
                  <span className="font-semibold text-app">Convidado:</span>{" "}
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

        {/* ✅ MAPS + WAZE */}
        {hasLocation && (
          <section className="space-y-3 text-sm">
            <h2 className="text-sm font-semibold text-app">Como chegar</h2>
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
                onClick={handleConfirm}
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
                <div className="mt-2 rounded-lg border border-emerald-700 bg-emerald-900/20 px-3 py-3 space-y-2">
                  <div>
                    <p className="text-xs text-emerald-300">{confirmSuccess}</p>
                    <p className="mt-1 text-[10px] text-emerald-200/80">
                      Agora você pode gerar o ingresso em PDF e baixar ou
                      compartilhar.
                    </p>
                  </div>

                  {/* QR para check-in */}
                  <div className="rounded-xl border border-[var(--border)] bg-card p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-app">
                        QR Code de confirmação
                      </span>
                      {qrError && (
                        <span className="text-[11px] text-red-400">
                          {qrError}
                        </span>
                      )}
                    </div>

                    {qrImgSrc && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={qrImgSrc}
                        alt="QR Code de confirmação"
                        className="w-[220px] h-[220px] rounded-lg border border-[var(--border)] bg-app object-contain"
                      />
                    )}

                    <p className="text-[10px] text-muted">
                      Este QR Code ajuda no check-in na entrada do evento.
                    </p>
                  </div>

                  {/* PDF actions */}
                  {ticketError && (
                    <p className="text-[11px] text-red-400">{ticketError}</p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleGenerateTicket}
                      disabled={generatingTicket || !isConfirmed}
                      className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
                    >
                      {generatingTicket
                        ? "Gerando ingresso..."
                        : "Gerar ingresso (PDF)"}
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
