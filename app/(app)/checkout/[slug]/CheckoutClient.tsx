"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type EventType = "PRE_PAGO" | "POS_PAGO" | "FREE";

type CheckoutEvent = {
  id: string;
  name: string;
  type: EventType;
  description?: string | null;
  location?: string | null;
  eventDate?: string | null;
  ticketPrice?: number | null;
};

type CheckoutData = {
  checkoutId: string;
  event: CheckoutEvent;
  amount: number;
  currency: string;
};

type PaymentMethodsCustomization = {
  creditCard?: "all" | string[];
  debitCard?: "all" | string[];
  ticket?: "all" | string[]; // boleto
  bankTransfer?: "all" | string[]; // Pix e similares
};

type PaymentBrickCustomization = {
  paymentMethods: PaymentMethodsCustomization;
  visual?: {
    style?: {
      theme?: "default" | "dark" | "bootstrap" | "flat" | "sharp";
    };
  };
};

type PaymentOnSubmitArgs = {
  // a doc do MP não tipa forte, então usamos unknown
  selectedPaymentMethod: unknown;
  formData: unknown;
};

declare global {
  interface Window {
    MercadoPago: new (
      publicKey: string,
      options?: { locale?: string }
    ) => {
      bricks: () => {
        create: (
          name: string,
          containerId: string,
          options: {
            initialization: { amount: number };
            customization: PaymentBrickCustomization;
            callbacks: {
              onReady?: () => void;
              onError?: (error: unknown) => void;
              onSubmit: (args: PaymentOnSubmitArgs) => Promise<void>;
            };
          }
        ) => Promise<void>;
      };
    };
  }
}

export default function CheckoutClient() {
  const params = useParams() as { slug?: string };
  const slug = String(params.slug ?? "").trim();

  const [checkout, setCheckout] = useState<CheckoutData | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carrega dados do checkout/evento pelo slug
  useEffect(() => {
    if (!slug) return;

    let cancelled = false;

    async function loadCheckout() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/payments/preferences/${slug}`);
        if (!res.ok) {
          throw new Error("Falha ao carregar dados do checkout.");
        }

        const data = (await res.json()) as CheckoutData;
        if (cancelled) return;

        setCheckout(data);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError("Erro ao carregar os dados do checkout.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadCheckout();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Inicializa o Payment Brick
  useEffect(() => {
    if (!checkout) return;
    if (typeof window === "undefined") return;

    const scriptId = "mp-bricks-script";

    const paymentCustomization: PaymentBrickCustomization = {
      paymentMethods: {
        creditCard: "all",
        debitCard: "all",
        ticket: "all", // boleto
        bankTransfer: "all", // Pix
      },
      visual: {
        style: {
          theme: "dark", // tema escuro
        },
      },
    };

    const initializeBrick = async () => {
      try {
        if (!window.MercadoPago) {
          throw new Error("SDK do Mercado Pago não foi carregado.");
        }

        const mp = new window.MercadoPago(
          process.env.NEXT_PUBLIC_MP_PUBLIC_KEY!,
          {
            locale: "pt-BR",
          }
        );

        const bricksBuilder = mp.bricks();

        const containerId = "paymentBrick_container";

        await bricksBuilder.create("payment", containerId, {
          initialization: {
            amount: checkout.amount,
          },
          customization: paymentCustomization,
          callbacks: {
            onReady: () => {
              // Brick pronto
            },
            onError: (err: unknown) => {
              console.error("[PaymentBrick] erro:", err);
              setError(
                "Erro ao carregar os meios de pagamento. Tente novamente em alguns instantes."
              );
            },
            onSubmit: async ({ formData }: PaymentOnSubmitArgs) => {
              try {
                setProcessing(true);
                setError(null);

                const res = await fetch("/api/payments/process", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    // chave de idempotência obrigatória pelo MP
                    "X-Idempotency-Key": crypto.randomUUID(),
                  },
                  body: JSON.stringify({
                    checkoutId: checkout.checkoutId,
                    formData,
                  }),
                });

                if (!res.ok) {
                  let message = "Erro ao processar pagamento no Mercado Pago.";
                  try {
                    const body = (await res.json()) as {
                      message?: string;
                      error?: string;
                    };
                    message = body.message ?? body.error ?? message;
                  } catch {
                    // ignore parse error
                  }
                  throw new Error(message);
                }

                const result = (await res.json()) as {
                  redirectUrl?: string;
                };

                if (result.redirectUrl) {
                  window.location.href = result.redirectUrl;
                } else {
                  // fallback simples
                  window.location.reload();
                }
              } catch (err) {
                console.error(err);
                const message =
                  err instanceof Error
                    ? err.message
                    : "Erro ao processar pagamento.";
                setError(message);
              } finally {
                setProcessing(false);
              }
            },
          },
        });
      } catch (err) {
        console.error(err);
        setError(
          "Não foi possível inicializar o pagamento. Tente novamente em alguns instantes."
        );
      }
    };

    // injeta o script do MP (se ainda não existir)
    const existingScript = document.getElementById(
      scriptId
    ) as HTMLScriptElement | null;

    if (existingScript && window.MercadoPago) {
      void initializeBrick();
      return;
    }

    const script = existingScript ?? document.createElement("script");
    script.id = scriptId;
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;

    const handleLoad = () => {
      void initializeBrick();
    };

    script.addEventListener("load", handleLoad);

    if (!existingScript) {
      document.body.appendChild(script);
    }

    return () => {
      script.removeEventListener("load", handleLoad);
    };
  }, [checkout]);

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <p className="text-sm text-slate-300">Carregando checkout...</p>
      </div>
    );
  }

  if (!checkout) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <p className="text-sm text-red-400">
          Não foi possível carregar o checkout.
        </p>
      </div>
    );
  }

  const { event, amount } = checkout;

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
          Checkout do evento
        </h2>
        <h1 className="mt-2 text-2xl font-bold text-white">{event.name}</h1>
        <p className="mt-1 text-sm text-slate-300">
          Confira os detalhes abaixo e finalize o pagamento pelo Mercado Pago
          sem sair deste aplicativo.
        </p>

        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-100">
          <p>
            <span className="font-semibold">Evento:</span> {event.name}
          </p>
          {event.eventDate && (
            <p>
              <span className="font-semibold">Data:</span> {event.eventDate}
            </p>
          )}
          {event.location && (
            <p>
              <span className="font-semibold">Local:</span> {event.location}
            </p>
          )}
          <p>
            <span className="font-semibold">Valor:</span>{" "}
            {amount.toLocaleString("pt-BR", {
              style: "currency",
              currency: checkout.currency || "BRL",
            })}
          </p>
          <p>
            <span className="font-semibold">Tipo:</span> Evento pré-pago
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-base font-semibold text-white">Pagamento</h2>
        <p className="mt-1 text-sm text-slate-300">
          Escolha a melhor forma de pagamento e conclua sua compra.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div
          id="paymentBrick_container"
          className="mt-4 rounded-xl bg-slate-950/40 p-3"
        />

        {processing && (
          <p className="mt-3 text-xs text-slate-400">
            Processando pagamento, não feche esta página...
          </p>
        )}
      </section>
    </div>
  );
}
