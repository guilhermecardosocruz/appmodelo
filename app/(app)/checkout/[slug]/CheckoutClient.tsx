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

function formatDate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const dia = String(d.getUTCDate()).padStart(2, "0");
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  const ano = d.getUTCFullYear();
  return `${dia}/${mes}/${ano}`;
}

// Parser só para converter ticketPrice -> número (ex.: "R$ 30,00" -> 30.0)
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

// Drible nos tipos do SDK
const PaymentBrick = Payment as any;

export default function CheckoutClient() {
  const params = useParams() as { slug?: string };
  const effectiveSlug = String(params?.slug ?? "").trim();

  const [event, setEvent] = useState<Event | null>(null);
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [eventError, setEventError] = useState<string | null>(null);

  const [brickError, setBrickError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadEvent() {
      try {
        setLoadingEvent(true);
        setEventError(null);
        setEvent(null);
        setBrickError(null);
        setSubmitting(false);
        setSubmitSuccess(false);

        if (!effectiveSlug) {
          setEventError("Link de checkout inválido.");
          return;
        }

        const res = await fetch(
          `/api/events/by-invite/${encodeURIComponent(effectiveSlug)}`,
        );

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          if (!active) return;

          if (res.status === 404) {
            setEventError(
              "Nenhum evento encontrado para este link de checkout.",
            );
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
        console.error("[CheckoutClient] Erro geral no checkout:", err);
        if (!active) return;
        setEventError("Erro inesperado ao carregar informações do evento.");
      } finally {
        if (!active) return;
        setLoadingEvent(false);
      }
    }

    loadEvent();

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

          {event &&
            event.type === "PRE_PAGO" &&
            numericPrice === null && (
              <p className="text-xs text-yellow-400">
                O organizador ainda não configurou um valor numérico válido para
                este evento. Ajuste o campo{" "}
                <span className="font-semibold">Valor do ingresso</span> nas
                configurações do evento para liberar o pagamento.
              </p>
            )}

          {event &&
            event.type === "PRE_PAGO" &&
            numericPrice !== null && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
                {brickError && (
                  <p className="text-xs text-red-400">{brickError}</p>
                )}

                {submitSuccess && (
                  <p className="text-xs text-emerald-400">
                    Pagamento registrado com sucesso! Você receberá a
                    confirmação pelo aplicativo do Mercado Pago.
                  </p>
                )}

                {!submitSuccess && (
                  <div className="mt-2 rounded-xl bg-slate-950 p-3">
                    <PaymentBrick
                      {...({
                        initialization: {
                          amount: numericPrice,
                        },
                        onSubmit: ({ formData }: any) =>
                          new Promise<void>(async (resolve, reject) => {
                            try {
                              setSubmitting(true);
                              setBrickError(null);

                              const res = await fetch(
                                "/api/payments/process",
                                {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    eventId: event.id,
                                    formData,
                                  }),
                                },
                              );

                              const json = await res
                                .json()
                                .catch(() => ({} as any));

                              if (!res.ok) {
                                console.error(
                                  "[PaymentBrick] Falha ao processar pagamento:",
                                  json,
                                );
                                setBrickError(
                                  json?.error ??
                                    "Não foi possível processar o pagamento. Tente novamente em instantes.",
                                );
                                reject();
                                return;
                              }

                              setSubmitSuccess(true);
                              resolve();
                            } catch (error) {
                              console.error(
                                "[PaymentBrick] Erro inesperado:",
                                error,
                              );
                              setBrickError(
                                "Erro inesperado ao processar pagamento. Verifique sua conexão e tente novamente.",
                              );
                              reject(error);
                            } finally {
                              setSubmitting(false);
                            }
                          }),
                        onReady: () => {
                          // opcional: remover skeleton, etc.
                        },
                        onError: (error: any) => {
                          console.error(
                            "[PaymentBrick] Erro ao renderizar:",
                            error,
                          );
                          const msg =
                            error?.message ||
                            error?.cause ||
                            String(error ?? "Erro desconhecido");
                          setBrickError(msg);
                        },
                      } as any)}
                    />
                  </div>
                )}

                {submitting && !submitSuccess && (
                  <p className="mt-2 text-[11px] text-slate-400">
                    Processando pagamento, aguarde alguns instantes...
                  </p>
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
