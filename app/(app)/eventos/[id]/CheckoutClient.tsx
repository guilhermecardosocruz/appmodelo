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
    return <p className="p-4 text-red-500">Evento inválido.</p>;
  }

  if (loading && !preferenceId) {
    return <p className="p-4 text-center">Carregando pagamento...</p>;
  }

  if (errorMsg && !preferenceId) {
    return (
      <div className="p-4 text-center text-red-600">
        {errorMsg}
      </div>
    );
  }

  if (!preferenceId) {
    return (
      <div className="p-4 text-center">
        <button
          onClick={loadPreference}
          className="rounded bg-blue-600 px-4 py-2 text-white"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-4">
      <h1 className="text-xl font-semibold mb-4 text-center">
        Pagamento
      </h1>

      <Payment
        initialization={{
          // amount é obrigatório no tipo, mas o valor real vem da preference no backend
          amount: 0,
          preferenceId,
        }}
      />
    </div>
  );
}
