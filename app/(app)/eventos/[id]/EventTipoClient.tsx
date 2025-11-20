"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type EventType = "PRE_PAGO" | "POS_PAGO" | "FREE";

type Event = {
  id: string;
  name: string;
  type: EventType;
  description?: string | null;
  location?: string | null;
  inviteSlug?: string | null;
  createdAt?: string;
};

type Mode = "free" | "pre" | "pos";

type Props = {
  mode: Mode;
};

function getTitle(mode: Mode) {
  if (mode === "pre") return "Configurações do evento pré pago";
  if (mode === "pos") return "Evento pós pago";
  return "Evento free";
}

function getDescription(mode: Mode) {
  if (mode === "pre") {
    return "Configure aqui o link de checkout (pagamento antecipado) do seu evento pré pago.";
  }
  if (mode === "pos") {
    return "Aqui terá a lógica do evento pós pago.";
  }
  return "Aqui terá a lógica do evento free.";
}

export default function EventTipoClient({ mode }: Props) {
  const params = useParams() as { id?: string };
  const eventId = String(params?.id ?? "").trim();

  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // checkout (pré-pago)
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutSuccess, setCheckoutSuccess] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [generatingCheckout, setGeneratingCheckout] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        setCheckoutError(null);
        setCheckoutSuccess(null);
        setCopyMessage(null);

        console.log(
          "[EventTipoClient] params.id:",
          params?.id,
          "eventId:",
          eventId
        );

        if (!eventId) {
          setError("Evento não encontrado.");
          setEvent(null);
          return;
        }

        console.log(
          "[EventTipoClient] Carregando evento de /api/events/[id]..."
        );
        const res = await fetch(`/api/events/${eventId}`);

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          if (!active) return;

          setError(data?.error ?? "Erro ao carregar evento.");
          setEvent(null);
          return;
        }

        const data = (await res.json()) as Event;
        if (!active) return;

        setEvent(data);
      } catch (err) {
        console.error("[EventTipoClient] Erro no fetch:", err);
        if (!active) return;
        setError("Erro inesperado ao carregar evento.");
        setEvent(null);
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, mode]);

  async function handleGenerateCheckoutLink() {
    if (!eventId) {
      setCheckoutError("Evento não encontrado.");
      return;
    }

    try {
      setGeneratingCheckout(true);
      setCheckoutError(null);
      setCheckoutSuccess(null);

      const randomPart = Math.random().toString(36).slice(2, 8);
      const newSlug = `${eventId.slice(0, 6)}-${randomPart}`;

      const res = await fetch("/api/events", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: eventId,
          inviteSlug: newSlug,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setCheckoutError(data?.error ?? "Erro ao gerar link de checkout.");
        return;
      }

      setEvent((prev) => (prev ? { ...prev, inviteSlug: newSlug } : prev));
      setCheckoutSuccess("Link de checkout atualizado com sucesso.");
    } catch (err) {
      console.error("[EventTipoClient] Erro ao gerar link de checkout:", err);
      setCheckoutError("Erro inesperado ao gerar link de checkout.");
    } finally {
      setGeneratingCheckout(false);
    }
  }

  async function handleCopyCheckoutLink() {
    if (!event?.inviteSlug) {
      setCopyMessage("Nenhum link gerado ainda para copiar.");
      return;
    }

    const path = `/checkout/${event.inviteSlug}`;
    const fullUrl =
      typeof window !== "undefined" ? `${window.location.origin}${path}` : path;

    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopyMessage("Link de checkout copiado para a área de transferência.");
      setTimeout(() => setCopyMessage(null), 3000);
    } catch (err) {
      console.error("[EventTipoClient] Erro ao copiar link de checkout:", err);
      setCopyMessage(
        `Não foi possível copiar automaticamente. Copie manualmente: ${fullUrl}`
      );
    }
  }

  const checkoutPath =
    event?.inviteSlug != null ? `/checkout/${event.inviteSlug}` : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <Link
          href="/dashboard/"
          className="text-xs font-medium text-slate-300 hover:text-slate-100"
        >
          ← Voltar
        </Link>

        {event && (
          <span className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-300 border border-slate-700">
            {event.type}
          </span>
        )}
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-3xl w-full mx-auto flex flex-col gap-4">
        {loading && (
          <p className="text-sm text-slate-300">Carregando evento...</p>
        )}

        {error && !loading && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        {!loading && !error && !event && (
          <p className="text-sm text-slate-300">Evento não encontrado.</p>
        )}

        {event && (
          <>
            <h1 className="text-xl sm:text-2xl font-semibold text-slate-50">
              {event.name}
            </h1>

            <h2 className="text-sm font-medium text-slate-200">
              {getTitle(mode)}
            </h2>

            <p className="text-sm text-slate-300">{getDescription(mode)}</p>

            {/* BLOCO DE CHECKOUT APENAS PARA PRÉ PAGO */}
            {mode === "pre" && (
              <section className="mt-2 flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wide">
                    Link de checkout (pagamento antecipado)
                  </h3>

                  {event.inviteSlug && (
                    <span className="text-[11px] text-slate-400">
                      Código do checkout:{" "}
                      <span className="text-slate-200">
                        {event.inviteSlug}
                      </span>
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-slate-400">
                  Gere o link de checkout e envie para os participantes.
                  Eles irão para uma página onde preenchem seus dados
                  e depois seguem para o pagamento (simulado por enquanto).
                </p>

                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2 mt-1">
                    {/* Ver página de checkout (sempre aparece, mas pode ficar desabilitado) */}
                    {checkoutPath ? (
                      <Link
                        href={checkoutPath}
                        target="_blank"
                        className="inline-flex items-center justify-center rounded-lg border border-slate-600 px-3 py-1.5 text-[11px] font-semibold text-slate-100 hover:bg-slate-800/80"
                      >
                        Ver página de checkout
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-3 py-1.5 text-[11px] font-semibold text-slate-500 cursor-not-allowed"
                      >
                        Ver página de checkout
                      </button>
                    )}

                    {/* Copiar link */}
                    <button
                      type="button"
                      disabled={!event.inviteSlug}
                      onClick={handleCopyCheckoutLink}
                      className="inline-flex items-center justify-center rounded-lg border border-slate-600 px-3 py-1.5 text-[11px] font-semibold text-slate-100 hover:bg-slate-800/80 disabled:opacity-50"
                    >
                      Copiar link de checkout
                    </button>

                    {/* Gerar novo link */}
                    <button
                      type="button"
                      onClick={handleGenerateCheckoutLink}
                      disabled={generatingCheckout}
                      className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
                    >
                      {generatingCheckout
                        ? "Gerando..."
                        : "Gerar novo link de checkout"}
                    </button>
                  </div>

                  {checkoutPath && (
                    <div className="mt-1">
                      <p className="text-[11px] text-slate-400 mb-1">
                        URL do checkout:
                      </p>
                      <code className="block w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-[11px] text-slate-100 break-all">
                        {typeof window !== "undefined"
                          ? `${window.location.origin}${checkoutPath}`
                          : checkoutPath}
                      </code>
                    </div>
                  )}
                </div>

                {checkoutError && (
                  <p className="text-[11px] text-red-400">
                    {checkoutError}
                  </p>
                )}

                {checkoutSuccess && (
                  <p className="text-[11px] text-emerald-400">
                    {checkoutSuccess}
                  </p>
                )}

                {copyMessage && (
                  <p className="text-[11px] text-emerald-300">
                    {copyMessage}
                  </p>
                )}
              </section>
            )}

            <p className="mt-4 text-[11px] text-slate-500">
              (No futuro, aqui vamos montar toda a lógica detalhada desse tipo
              de evento: configurações, regras, integrações, fluxos, etc.)
            </p>
          </>
        )}
      </main>
    </div>
  );
}
