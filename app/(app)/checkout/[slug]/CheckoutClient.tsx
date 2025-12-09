/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Payment } from "@mercadopago/sdk-react";

type EventType = "PRE_PAGO" | "POS_PAGO" | "FREE";

type Event = {
  id: string;
  name: string;
  type: EventType;
  description?: string | null;
  location?: string | null;
  eventDate?: string | null;
  ticketPrice?: string | null;
};

type PreferenceErrorResponse = {
  error?: string;
  message?: string;
};

// Formata data YYYY-MM-DDTHH:MM:SSZ -> DD/MM/AAAA
function formatDate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const dia = String(d.getUTCDate()).padStart(2, "0");
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  const ano = d.getUTCFullYear();
  return `${dia}/${mes}/${ano}`;
}

// Converte string de preço brasileiro para número
function parsePrice(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;

  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const cleaned = trimmed.replace(/[^\d,.\-]/g, "");
  if (!cleaned) return null;

  const normalized = cleaned.replace(/\./g, "").replace(",", ".");

  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;

  return Number(n.toFixed(2));
}

// Drible nos tipos do SDK: usamos o componente tipado como any
const PaymentBrick = Payment as any;

export default function CheckoutClient() {
  const params = useParams() as { slug?: string };
  const effectiveSlug = String(params?.slug ?? "").trim();

  const [event, setEvent] = useState<Event | null>(null);
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [eventError, setEventError] = useState<string | null>(null);

  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadAll() {
      try {
        setLoadingEvent(true);
        setEventError(null);
        setEvent(null);
        setPaymentError(null);

        if (!effectiveSlug) {
          setEventError("Link de checkout inválido.");
          return;
        }

        // 1) Busca o evento pelo slug (inviteSlug)
        const res = await fetch(
          `/api/events/by-invite/${encodeURIComponent(effectiveSlug)}`
        );

        if (!res.ok) {
          const data = (await res
            .json()
            .catch(() => null)) as PreferenceErrorResponse | null;
          if (!active) return;

          if (res.status === 404) {
            setEventError(
              "Nenhum evento encontrado para este link de checkout."
            );
          } else {
            setEventError(
              data?.error ?? data?.message ?? "Erro ao carregar informações do evento."
            );
          }
          return;
        }

        const data = (await res.json()) as Event;
        if (!active) return;
        setEvent(data);
      } catch (err) {
        console.error("[CheckoutClient] Erro geral no checkout:", err);
        if (!active) return;
        setEventError("Erro inesperado ao carregar informações do evento.");
      } finally {
        if (!active) return;
        setLoadingEvent(false);
      }
    }

    loadAll();

    return () => {
      active = false;
    };
  }, [effectiveSlug]);

  const formattedDate = formatDate(event?.eventDate);

  const numericPrice: number | null = parsePrice(event?.ticketPrice ?? null);

  const formattedPrice: string | null = (() => {
    if (numericPrice === null) {
      if (!event?.ticketPrice) return null;
      return String(event.ticketPrice);
    }
    try {
      return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(numericPrice);
    } catch {
      return `R$ ${numericPrice.toFixed(2)}`;
    }
  })();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10">
        <header className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Checkout do evento
          </p>

          <h1 className="text-2xl font-semibold text-slate-50 sm:text-3xl">
            {event?.name ?? "Confirmação e pagamento"}
          </h1>

          <p className="max-w-xl text-sm text-slate-400">
            Confira os detalhes abaixo e finalize o pagamento pelo Mercado Pago
            sem sair deste aplicativo.
          </p>
        </header>

        <section className="space-y-3 text-sm">
          <h2 className="text-sm font-semibold text-slate-200">
            Detalhes do evento
          </h2>

          <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            {loadingEvent && (
              <p className="text-xs text-slate-400">
                Carregando informações do evento...
              </p>
            )}

            {!loadingEvent && eventError && (
              <p className="text-xs text-red-400">{eventError}</p>
            )}

            {!loadingEvent && !eventError && event && (
              <div className="space-y-1 text-xs text-slate-300 sm:text-sm">
                <p>
                  <span className="font-semibold text-slate-100">Evento:</span>{" "}
                  {event.name}
                </p>

                {formattedDate && (
                  <p>
                    <span className="font-semibold text-slate-100">Data:</span>{" "}
                    {formattedDate}
                  </p>
                )}

                {event.location && (
                  <p>
                    <span className="font-semibold text-slate-100">Local:</span>{" "}
                    {event.location}
                  </p>
                )}

                {formattedPrice && (
                  <p>
                    <span className="font-semibold text-slate-100">Valor:</span>{" "}
                    {formattedPrice}
                  </p>
                )}

                <p>
                  <span className="font-semibold text-slate-100">Tipo:</span>{" "}
                  {event.type === "PRE_PAGO"
                    ? "Evento pré-pago"
                    : event.type === "POS_PAGO"
                    ? "Evento pós-pago"
                    : "Evento gratuito"}
                </p>

                {event.description && (
                  <p className="pt-1">
                    <span className="font-semibold text-slate-100">
                      Descrição:
                    </span>{" "}
                    {event.description}
                  </p>
                )}
              </div>
            )}

            {!loadingEvent && !eventError && !event && (
              <p className="text-xs text-slate-400">
                Não foi possível carregar informações do evento.
              </p>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">Pagamento</h2>

          {event && event.type !== "PRE_PAGO" && (
            <p className="text-xs text-slate-400">
              Este checkout é pensado para eventos pré pagos. O tipo atual do
              evento é:{" "}
              <span className="font-semibold text-slate-100">
                {event.type === "POS_PAGO"
                  ? "Pós-pago"
                  : event.type === "FREE"
                  ? "Gratuito"
                  : event.type}
              </span>
              .
            </p>
          )}

          {event && event.type === "PRE_PAGO" && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
              {numericPrice === null && (
                <p className="text-xs text-red-400">
                  Valor do ingresso não configurado corretamente. Ajuste o campo
                  &quot;Valor do ingresso&quot; nas configurações do evento.
                </p>
              )}

              {paymentError && (
                <p className="mb-2 text-xs text-red-400">{paymentError}</p>
              )}

              {numericPrice !== null && (
                <div className="mt-1 rounded-xl bg-slate-950 p-3">
                  <PaymentBrick
                    initialization={{
                      amount: numericPrice,
                    }}
                    customization={{
                      visual: {
                        style: {
                          theme: "dark",
                        },
                      },
                    }}
                    onSubmit={async (params: any) => {
                      try {
                        setProcessingPayment(true);
                        setPaymentError(null);

                        const res = await fetch("/api/payments/process", {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({
                            eventId: event.id,
                            formData: params?.formData ?? params,
                          }),
                        });

                        const data: PreferenceErrorResponse = await res
                          .json()
                          .catch(() => ({} as PreferenceErrorResponse));

                        if (!res.ok) {
                          const msg =
                            data.error ??
                            data.message ??
                            "Erro ao processar pagamento no Mercado Pago.";
                          setPaymentError(
                            `Erro ao processar pagamento no Mercado Pago (status ${res.status}). Detalhe: ${msg}`
                          );
                          return { status: "error" };
                        }

                        // sucesso no backend (criou pagamento no MP + registrou no sistema)
                        return { status: "success" };
                      } catch (error: any) {
                        console.error(
                          "[CheckoutClient] Erro ao processar pagamento:",
                          error
                        );
                        setPaymentError(
                          error?.message ??
                            "Erro inesperado ao processar pagamento. Tente novamente."
                        );
                        return { status: "error" };
                      } finally {
                        setProcessingPayment(false);
                      }
                    }}
                    onReady={() => {
                      // opcional: esconder skeletons/spinners
                    }}
                    onError={(error: any) => {
                      console.error(
                        "[PaymentBrick] Erro ao renderizar:",
                        error
                      );
                      const msg =
                        error?.message ??
                        error?.cause ??
                        "Erro ao carregar os meios de pagamento. Tente novamente.";
                      setPaymentError(msg);
                    }}
                  />
                  {processingPayment && (
                    <p className="mt-2 text-[11px] text-slate-400">
                      Processando pagamento, aguarde...
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-900 pt-4 text-[11px] text-slate-500">
          <span className="break-all">
            Código do checkout:{" "}
            <span className="text-slate-300">
              {effectiveSlug || "(não informado)"}
            </span>
          </span>
        </footer>
      </div>
    </div>
  );
}
