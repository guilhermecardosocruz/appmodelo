"use client";

import { useEffect } from "react";
import { initMercadoPago } from "@mercadopago/sdk-react";
import { useParams, useRouter } from "next/navigation";

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

export default function CheckoutClient() {
  const params = useParams() as { slug?: string };
  const router = useRouter();
  const slug = String(params?.slug ?? "");

  useEffect(() => {
    initMercadoPago(process.env.NEXT_PUBLIC_MP_PUBLIC_KEY!, {
      locale: "pt-BR",
    });
  }, []);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/events/by-invite/${slug}`);
      const event: Event = await res.json();

      if (!event?.id) {
        alert("Evento não encontrado");
        router.push("/");
        return;
      }

      if (event.type !== "PRE_PAGO") {
        alert("Este checkout só funciona para eventos pré-pagos.");
        router.push("/");
        return;
      }

      const mp = new window.MercadoPago(process.env.NEXT_PUBLIC_MP_PUBLIC_KEY!, {
        locale: "pt-BR",
      });

      const bricksBuilder = mp.bricks();

      bricksBuilder.create("payment", "paymentBrick", {
        initialization: {
          amount: Number(event.ticketPrice?.replace("R$", "").replace(",", ".")) || 0,
        },
        customization: {
          visual: {
            style: {
              theme: "dark",        // 🌙 TEMA ESCURO
              borderRadius: "16px",
              valueProp: "optional" // remove texto de propaganda
            },
          },
        },
        callbacks: {
          onSubmit: async ({ formData }: any) => {
            const req = await fetch("/api/payments/process", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                eventId: event.id,
                formData,
              }),
            });

            const data = await req.json();

            if (!req.ok) {
              alert(data.error || "Erro ao processar pagamento.");
              return;
            }

            // depois podemos redirecionar para "Ingresso confirmado"
            alert("Pagamento realizado com sucesso!");
          },
          onError: (error: any) => {
            console.error("Erro no Payment Brick:", error);
          },
        },
      });
    }

    load();
  }, [slug, router]);

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Pagamento</h1>
      <div id="paymentBrick"></div>
    </div>
  );
}
