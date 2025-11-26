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

type PreferenceResponse = {
  preferenceId?: string;
  error?: string;
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

// Mesmo parser de preço do backend, só para exibição
function parsePrice(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;

  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const cleaned = trimmed.replace(/[^\d,.,-]/g, "");
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

  const [preferenceId, setPreferenceId] = useState<string | null>(null);
  const [loadingPreference, setLoadingPreference] = useState(false);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);

  const [brickError, setBrickError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadAll() {
      try {
        setLoadingEvent(true);
        setEventError(null);
        setEvent(null);

        setPreferenceId(null);
        setPreferenceError(null);
        setLoadingPreference(false);
        setBrickError(null);

        if (!effectiveSlug) {
          setEventError("Link de checkout inválido.");
          return;
        }

        // 1) Busca o evento pelo slug (inviteSlug)
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

        // 2) Se for pré-pago, cria a preferência de pagamento
        if (data.type === "PRE_PAGO") {
          setLoadingPreference(true);

          const prefRes = await fetch("/api/payments/preferences", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ eventId: data.id }),
          });

          const prefJson: PreferenceResponse = await prefRes
            .json()
            .catch(() => ({} as PreferenceResponse));

          if (!active) return;

          if (!prefRes.ok || !prefJson.preferenceId) {
            setPreferenceError(
              prefJson.error ?? "Não foi possível iniciar o pagamento.",
            );
            return;
          }

          setPreferenceId(prefJson.preferenceId);
        }
      } catch (err) {
        console.error("[CheckoutClient] Erro geral no checkout:", err);
        if (!active) return;
        setEventError("Erro inesperado ao carregar informações do evento.");
      } finally {
        if (!active) return;
        setLoadingEvent(false);
        setLoadingPreference(false);
      }
    }

    loadAll();

    return () => {
      active = false;
    };
  }, [effectiveSlug]);

  const formattedDate = formatDate(event?.eventDate);

  // Formata o valor do ingresso só para exibição (R$ 30,00)
  const formattedPrice: string | null = (() => {
    if (!event?.ticketPrice) return null;
    const n = parsePrice(event.ticketPrice);
    if (n === null) {
      return String(event.ticketPrice);
    }
    try {
      return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(n);
    } catch {
      return `R$ ${n.toFixed(2)}`;
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
            Confira os detalhes abaixo e finalize o pagamento pelo Mercado Pago.
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
              {loadingPreference && !preferenceId && (
                <p className="text-xs text-slate-400">
                  Preparando pagamento com o Mercado Pago...
                </p>
              )}

              {preferenceError && (
                <p className="text-xs text-red-400">{preferenceError}</p>
              )}

              {brickError && (
                <p className="text-xs text-red-400">
                  Erro no componente de pagamento: {brickError}
                </p>
              )}

              {!loadingPreference &&
                !preferenceError &&
                !preferenceId &&
                !brickError && (
                  <p className="text-xs text-slate-400">
                    Não foi possível iniciar o pagamento. Tente atualizar a
                    página em alguns instantes.
                  </p>
                )}

              {preferenceId && (
                <div className="mt-2 rounded-xl bg-slate-950 p-3">
                  {/* Pix-only via Payment Brick */}
                  <PaymentBrick
                    {...({
                      initialization: {
                        preferenceId,
                        amount: 0, // valor real vem da preference no backend
                      },
                      customization: {
                        paymentMethods: {
                          creditCard: "none",
                          debitCard: "none",
                          ticket: "none",
                          bankTransfer: "all", // habilita Pix
                          mercadoPago: "none",
                        },
                      },
                      callbacks: {
                        onReady: () => {
                          // opcional: esconder skeletons etc.
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
                      },
                    } as any)}
                  />
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
