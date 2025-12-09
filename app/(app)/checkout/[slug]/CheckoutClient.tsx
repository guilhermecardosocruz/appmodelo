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
  bankTransfer?: "all" | string[]; // Pix
};

type PaymentBrickCustomization = {
  paymentMethods: PaymentMethodsCustomization;
  visual?: {
    style?: {
      theme?: "default" | "dark" | "bootstrap" | "flat" | "sharp";
    };
  };
};

type BrickPayer = {
  email: string;
  identification?: {
    type: string;
    number: string;
  };
};

type BrickFormData = {
  token: string;
  payment_method_id: string;
  issuer_id?: string;
  installments: number;
  payer: BrickPayer;
};

type PaymentOnSubmitArgs = {
  selectedPaymentMethod: string;
  formData: BrickFormData;
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

    void loadCheckout();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Inicializa o Payment Brick (tema escuro, apenas cartão + Pix)
  useEffect(() => {
    if (!checkout) return;
    if (typeof window === "undefined") return;

    const scriptId = "mp-bricks-script";
    const containerId = "paymentBrick_container";

    const paymentCustomization: PaymentBrickCustomization = {
      // Só cartão de crédito e Pix (bankTransfer)
      paymentMethods: {
        creditCard: "all",
        bankTransfer: "all",
      },
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

        // Limpa o container antes de recriar o Brick
        const container = document.getElementById(containerId);
        if (container) {
          container.innerHTML = "";
        }

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

                const {
                  token,
                  payment_method_id,
                  issuer_id,
                  installments,
                  payer,
                } = formData;

                const res = await fetch("/api/payments/process", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "X-Idempotency-Key": crypto.randomUUID(),
                  },
                  body: JSON.stringify({
                    token,
                    payment_method_id,
                    issuer_id,
                    installments,
                    transaction_amount: checkout.amount,
                    description: checkout.event.name,
                    payer,
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

                const result = await res.json();

                // Se a API do MP retornar um link (caso de redirecionamento),
                // você pode tratar aqui. Como estamos usando Payment API direta,
                // normalmente o status já vem na resposta.
                console.log("Pagamento aprovado/pendente:", result);
                window.alert("Pagamento processado com sucesso ou em análise.");
                window.location.reload();
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

    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    const handleLoad = () => {
      void initializeBrick();
    };

    if (script && window.MercadoPago) {
      void initializeBrick();
    } else {
      if (!script) {
        script = document.createElement("script");
        script.id = scriptId;
        script.src = "https://sdk.mercadopago.com/js/v2";
        script.async = true;
        document.body.appendChild(script);
      }
      script.addEventListener("load", handleLoad);
    }

    return () => {
      if (script) {
        script.removeEventListener("load", handleLoad);
      }
    };
  }, [checkout]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50">
        <div className="text-sm text-slate-300">
          Carregando dados do checkout...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50">
        <div className="max-w-md rounded-xl border border-red-500/40 bg-red-950/40 p-4 text-sm">
          <p className="font-semibold mb-1">Ops, algo deu errado</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!checkout) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50">
        <div className="text-sm text-red-400">Checkout não encontrado.</div>
      </div>
    );
  }

  const { event } = checkout;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-xl">
        <header className="mb-4 space-y-1">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Pagamento seguro com Mercado Pago
          </p>
          <h1 className="text-lg font-semibold">{event.name}</h1>
          <p className="text-sm text-slate-300">
            Valor:{" "}
            <span className="font-semibold">
              {checkout.amount.toLocaleString("pt-BR", {
                style: "currency",
                currency: checkout.currency,
              })}
            </span>
          </p>
          {event.location && (
            <p className="text-xs text-slate-400">{event.location}</p>
          )}
        </header>

        <div id="paymentBrick_container" />

        {processing && (
          <p className="mt-3 text-xs text-slate-400">
            Processando pagamento, não feche esta página...
          </p>
        )}
      </div>
    </div>
  );
}
