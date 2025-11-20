"use client";

import { useEffect, useState } from "react";
import { Payment } from "@mercadopago/sdk-react";
import { useParams } from "next/navigation";

export default function CheckoutClient() {
  const params = useParams();
  const eventId = String(params?.id ?? "");

  const [preferenceId, setPreferenceId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/payments/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });

      const data = await res.json();
      setPreferenceId(data.preferenceId);
    }

    load();
  }, [eventId]);

  if (!preferenceId) {
    return <p className="p-4 text-center">Carregando pagamento...</p>;
  }

  return (
    <div className="max-w-xl mx-auto p-4">
      <h1 className="text-xl font-semibold mb-4 text-center">Pagamento</h1>

      <Payment
        initialization={{
          preferenceId,
        }}
        customization={{
          visual: { style: { theme: "default" } },
        }}
      />
    </div>
  );
}
