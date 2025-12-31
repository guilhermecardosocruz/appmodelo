/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { Payment } from "@mercadopago/sdk-react";
import { useParams } from "next/navigation";

type PreferenceResponse = {
  preferenceId: string;
};

export default function CheckoutClient() {
  const params = useParams() as { id?: string };
  const eventId = String(params?.id ?? "").trim();

  const [preferenceId, setPreferenceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function loadPreference() {
    if (!eventId) return;
    try {
      setLoading(true);
      setErrorMsg(null);

      const res = await fetch("/api/payments/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ eventId }),
      });

      const data: PreferenceResponse & { error?: string } = await res.json();

      if (!res.ok || !data.preferenceId) {
        setErrorMsg(data.error ?? "Não foi possível iniciar o pagamento.");
        return;
      }

      setPreferenceId(data.preferenceId);
    } catch (error) {
      console.error(error);
      setErrorMsg("Erro ao conectar com o servidor de pagamento.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPreference();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  if (!eventId) {
    return (
      <div className="min-h-screen bg-app text-app flex items-center justify-center p-4">
        <p className="text-sm text-red-500">Evento inválido.</p>
      </div>
    );
  }

  if (loading && !preferenceId) {
    return (
      <div className="min-h-screen bg-app text-app flex items-center justify-center p-4">
        <p className="text-sm text-muted">Carregando pagamento...</p>
      </div>
    );
  }

  if (errorMsg && !preferenceId) {
    return (
      <div className="min-h-screen bg-app text-app flex items-center justify-center p-4">
        <div className="max-w-md rounded-xl border border-[var(--border)] bg-card p-4 text-sm">
          <p className="font-semibold mb-1">Ops, algo deu errado</p>
          <p className="text-red-500">{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (!preferenceId) {
    return (
      <div className="min-h-screen bg-app text-app flex items-center justify-center p-4">
        <div className="max-w-md rounded-xl border border-[var(--border)] bg-card p-4 text-sm text-center">
          <button
            onClick={loadPreference}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-white font-semibold hover:bg-emerald-500"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  // Drible nos tipos do SDK: usamos o componente tipado como any
  const PaymentBrick = Payment as any;

  return (
    <div className="min-h-screen bg-app text-app flex items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-2xl border border-[var(--border)] bg-card p-4">
        <h1 className="text-xl font-semibold mb-4 text-center text-app">
          Pagamento
        </h1>

        <PaymentBrick
          initialization={{
            preferenceId,
          }}
        />
      </div>
    </div>
  );
}
