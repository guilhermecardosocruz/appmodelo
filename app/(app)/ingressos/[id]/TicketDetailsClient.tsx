"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type EventType = "PRE_PAGO" | "POS_PAGO" | "FREE";

type TicketDetails = {
  id: string;
  status: "ACTIVE" | "CANCELLED";
  createdAt: string;
  attendeeName: string | null;
  user: { id: string; name: string; email: string };
  event: {
    id: string;
    name: string;
    type: EventType;
    description?: string | null;
    location?: string | null;
    eventDate?: string | null;
    ticketPrice?: string | null;
  };
};

function formatDate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const ano = d.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

async function generateQrDataUrl(text: string): Promise<string> {
  const mod = await import("qrcode");
  return mod.toDataURL(text, {
    margin: 1,
    width: 260,
    errorCorrectionLevel: "M",
  });
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

export default function TicketDetailsClient() {
  const router = useRouter();
  const params = useParams() as { id?: string };
  const ticketId = String(params?.id ?? "").trim();

  const [data, setData] = useState<TicketDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  const [downloading, setDownloading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfName, setPdfName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        if (!ticketId) {
          setError("Ingresso inválido.");
          return;
        }

        const res = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}`, {
          cache: "no-store",
        });

        if (res.status === 401) {
          const next = encodeURIComponent(`/ingressos/${ticketId}`);
          router.push(`/login?next=${next}`);
          return;
        }

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setError(body?.error ?? "Não foi possível carregar este ingresso.");
          return;
        }

        const json = (await res.json()) as TicketDetails;
        if (!active) return;

        setData(json);
      } catch (err) {
        console.error(err);
        if (!active) return;
        setError("Erro inesperado ao carregar o ingresso.");
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [router, ticketId]);

  const eventDate = formatDate(data?.event?.eventDate ?? null);
  const createdAt = formatDate(data?.createdAt ?? null);

  const qrPayload = useMemo(() => {
    if (!data) return null;

    // ✅ payload estável e 100% amarrado ao ticket
    // (sem depender de nome do evento/usuário)
    return JSON.stringify(
      {
        kind: "TICKET",
        ticketId: data.id,
      },
      null,
      0,
    );
  }, [data]);

  useEffect(() => {
    let active = true;

    async function genQr() {
      if (!qrPayload) return;

      try {
        setQrError(null);
        const url = await generateQrDataUrl(qrPayload);
        if (!active) return;
        setQrDataUrl(url);
      } catch (err) {
        console.error(err);
        if (!active) return;
        setQrError("Não foi possível gerar o QR Code.");
      }
    }

    void genQr();
    return () => {
      active = false;
    };
  }, [qrPayload]);

  async function handleDownloadPdf() {
    if (!data) return;

    try {
      setDownloading(true);
      setPdfError(null);

      const res = await fetch(`/api/tickets/${encodeURIComponent(data.id)}/pdf`, {
        cache: "no-store",
      });

      if (res.status === 401) {
        const next = encodeURIComponent(`/ingressos/${data.id}`);
        router.push(`/login?next=${next}`);
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setPdfError(body?.error ?? "Não foi possível baixar o PDF.");
        return;
      }

      const blob = await res.blob();

      const safeEvent = (data.event.name ?? "evento")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);

      const fileName = `ingresso-${safeEvent || "evento"}-${data.id.slice(0, 8)}.pdf`;

      setPdfBlob(blob);
      setPdfName(fileName);

      downloadBlob(blob, fileName);
    } catch (err) {
      console.error(err);
      setPdfError("Erro inesperado ao baixar o PDF.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleShareWhats() {
    if (!data) return;

    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "";

    const link = `${origin}/ingressos/${encodeURIComponent(data.id)}`;
    const text = `Meu ingresso: ${data.event.name}\n${link}`;

    // 1) Se já baixou o PDF, tenta compartilhar arquivo
    if (pdfBlob && pdfName) {
      try {
        const file = new File([pdfBlob], pdfName, { type: "application/pdf" });

        const nav = navigator as unknown as {
          share?: (data: { title?: string; text?: string; files?: File[] }) => Promise<void>;
          canShare?: (data: { files?: File[] }) => boolean;
        };

        const canShareFiles =
          typeof nav !== "undefined" && typeof nav.canShare === "function"
            ? nav.canShare({ files: [file] })
            : false;

        if (typeof nav !== "undefined" && typeof nav.share === "function" && canShareFiles) {
          await nav.share({
            title: "Ingresso do evento",
            text,
            files: [file],
          });
          return;
        }
      } catch (err) {
        console.warn("[TicketDetails] share files falhou:", err);
      }
    }

    // 2) Fallback: WhatsApp com link
    const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(wa, "_blank", "noopener,noreferrer");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-app text-app">
        <div className="max-w-3xl mx-auto px-4 py-10">
          <p className="text-sm text-muted">Carregando ingresso...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-app text-app">
        <div className="max-w-3xl mx-auto px-4 py-10">
          <div className="rounded-2xl border border-[var(--border)] bg-card p-4">
            <p className="text-sm text-red-400">{error ?? "Ingresso não encontrado."}</p>
            <button
              type="button"
              onClick={() => router.push("/ingressos")}
              className="mt-3 inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-app hover:bg-card/70"
            >
              Voltar para Meus ingressos
            </button>
          </div>
        </div>
      </div>
    );
  }

  const statusLabel = data.status === "ACTIVE" ? "Ativo" : "Cancelado";
  const isActive = data.status === "ACTIVE";
  const participant = data.attendeeName ?? data.user.name;

  return (
    <div className="min-h-screen bg-app text-app">
      <div className="max-w-3xl mx-auto px-4 py-10 flex flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
              Ingresso
            </p>
            <h1 className="text-2xl sm:text-3xl font-semibold text-app">
              {data.event.name}
            </h1>
            <p className="text-sm text-muted">
              {data.event.type === "FREE"
                ? "Evento gratuito"
                : data.event.type === "PRE_PAGO"
                  ? "Evento pré-pago"
                  : "Evento pós-pago"}
              {eventDate ? ` • ${eventDate}` : ""}
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/ingressos")}
            className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-app hover:bg-card/70"
          >
            Voltar
          </button>
        </header>

        <section className="rounded-2xl border border-[var(--border)] bg-card p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-app">Detalhes</span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                isActive
                  ? "bg-emerald-900/40 text-emerald-300 border border-emerald-600/60"
                  : "bg-card text-muted border border-slate-700/80"
              }`}
            >
              {statusLabel}
            </span>
          </div>

          <div className="text-xs sm:text-sm text-muted space-y-1">
            <p>
              <span className="font-semibold text-app">Participante:</span>{" "}
              {participant}
            </p>

            {data.event.location && (
              <p>
                <span className="font-semibold text-app">Local:</span>{" "}
                {data.event.location}
              </p>
            )}

            {eventDate && (
              <p>
                <span className="font-semibold text-app">Data:</span>{" "}
                {eventDate}
              </p>
            )}

            {createdAt && (
              <p className="text-[11px] text-app0 pt-1">
                Ingresso gerado em {createdAt}.
              </p>
            )}

            <p className="text-[11px] text-app0 break-all">
              Ticket ID: {data.id}
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-app">QR Code</span>
            {qrError && <span className="text-[11px] text-red-400">{qrError}</span>}
          </div>

          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt="QR Code do ingresso"
              className="w-[220px] h-[220px] rounded-lg border border-[var(--border)] bg-app object-contain"
            />
          ) : (
            <p className="text-[11px] text-muted">Gerando QR Code…</p>
          )}

          <p className="text-[10px] text-muted">
            Este QR Code pode ser usado para check-in na entrada (ou validação futura).
          </p>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-app">PDF</span>
            {pdfError && <span className="text-[11px] text-red-400">{pdfError}</span>}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
            >
              {downloading ? "Baixando..." : "Baixar"}
            </button>

            <button
              type="button"
              onClick={handleShareWhats}
              className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-app hover:bg-card/70"
            >
              Enviar no WhatsApp
            </button>
          </div>

          <p className="text-[10px] text-muted">
            Dica: no celular, depois de baixar uma vez, o botão do WhatsApp tenta compartilhar o PDF (se o sistema suportar).
            Se não suportar, ele envia o link do ingresso.
          </p>
        </section>
      </div>
    </div>
  );
}
