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
  // deixamos opcional para poder omitir e usar o padrão do MP
  paymentMethods?: PaymentMethodsCustomization;
  visual?: {
    style?: {
      theme?: "default" | "dark" | "bootstrap" | "flat" | "sharp";
    };
  };
};

type PaymentOnSubmitArgs = {
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

  // 1) Carrega dados do checkout/evento pelo slug
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

    void loadCheckout();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // 2) Inicializa o Payment Brick
  useEffect(() => {
    if (!checkout) return;
    if (typeof window === "undefined") return;

    const scriptId = "mp-bricks-script";

    // tema escuro, SEM sobrescrever meios de pagamento
    const paymentCustomization: PaymentBrickCustomization = {
      visual: {
        style: {
          theme: "dark",
        },
      },
    };

    const initializeBrick = async () => {
      try {
        if (!window.MercadoPago) {
          throw new Error("SDK do Mercado Pago não foi carregado.");
        }

        const publicKey = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY;
        if (!publicKey) {
          throw new Error("NEXT_PUBLIC_MP_PUBLIC_KEY não configurada.");
        }

        const mp = new window.MercadoPago(publicKey, {
          locale: "pt-BR",
        });

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

                const idempotencyKey =
                  typeof crypto !== "undefined" && "randomUUID" in crypto
                    ? crypto.randomUUID()
                    : `${Date.now()}-${Math.random()}`;

                const res = await fetch("/api/payments/process", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "X-Idempotency-Key": idempotencyKey,
                  },
                  body: JSON.stringify({
                    checkoutId: checkout.checkoutId,
                    formData,
                  }),
                });

                if (!res.ok) {
                  let message =
                    "Erro ao processar pagamento no Mercado Pago.";
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

    const existingScript = document.getElementById(
      scriptId
    ) as HTMLScriptElement | null;

    const handleLoad = () => {
      void initializeBrick();
    };

    if (existingScript) {
      if (window.MercadoPago) {
        void initializeBrick();
      } else {
        existingScript.addEventListener("load", handleLoad);
      }
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;
    script.addEventListener("load", handleLoad);
    document.body.appendChild(script);

    return () => {
      script.removeEventListener("load", handleLoad);
    };
  }, [checkout]);

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 text-slate-100">
        <p>Carregando checkout...</p>
      </main>
    );
  }

  if (!checkout) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 text-slate-100">
        <p>Checkout não encontrado.</p>
      </main>
    );
  }

  const { event, amount, currency } = checkout;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-slate-100">
      <h1 className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
        Checkout do evento
      </h1>
      <h2 className="mt-2 text-3xl font-bold">{event.name}</h2>
      <p className="mt-1 text-sm text-slate-300">
        Confira os detalhes abaixo e finalize o pagamento pelo Mercado Pago sem
        sair deste aplicativo.
      </p>

      {error && (
        <div className="mt-6 rounded-md border border-red-500/60 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <section className="mt-8 rounded-2xl border border-slate-700 bg-slate-900/60 p-6">
        <h3 className="text-base font-semibold text-slate-100">
          Detalhes do evento
        </h3>
        <dl className="mt-4 space-y-1 text-sm text-slate-300">
          <div>
            <dt className="inline font-semibold text-slate-100">Evento: </dt>
            <dd className="inline">{event.name}</dd>
          </div>
          {event.eventDate && (
            <div>
              <dt className="inline font-semibold text-slate-100">Data: </dt>
              <dd className="inline">{event.eventDate}</dd>
            </div>
          )}
          {event.location && (
            <div>
              <dt className="inline font-semibold text-slate-100">Local: </dt>
              <dd className="inline">{event.location}</dd>
            </div>
          )}
          <div>
            <dt className="inline font-semibold text-slate-100">Valor: </dt>
            <dd className="inline">
              {currency} {amount.toFixed(2)}
            </dd>
          </div>
          <div>
            <dt className="inline font-semibold text-slate-100">Tipo: </dt>
            <dd className="inline">
              {event.type === "PRE_PAGO"
                ? "Evento pré-pago"
                : event.type === "POS_PAGO"
                ? "Evento pós-pago"
                : "Evento gratuito"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-8 rounded-2xl border border-slate-700 bg-slate-900/60 p-6">
        <h3 className="text-base font-semibold text-slate-100">
          Pagamento
        </h3>
        <div className="mt-4">
          <div id="paymentBrick_container" />
        </div>
        {processing && (
          <p className="mt-3 text-xs text-slate-400">
            Processando pagamento, aguarde...
          </p>
        )}
      </section>
    </main>
  );
}
