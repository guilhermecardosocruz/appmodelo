"use client";

import { useEffect, useState } from "react";

export default function RachaPage({ params }: { params: { slug: string } }) {
  const { slug } = params;

  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/events/invite/${slug}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Erro ao carregar convite.");
        } else {
          setEvent(data);
        }
      } catch {
        setError("Erro ao carregar convite.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [slug]);

  if (loading) return <p>Carregando...</p>;

  if (error)
    return (
      <div className="p-4 bg-red-100 text-red-600 rounded">
        {error}
      </div>
    );

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold">Convite para o racha</h1>

      <p className="mt-2 text-gray-700">{event.name}</p>

      <p className="mt-2 text-sm">Local: {event.location || "Não informado"}</p>

      <button
        onClick={() => alert("Confirmar fluxo depois")}
        className="mt-4 bg-blue-600 text-white px-4 py-2 rounded"
      >
        Confirmar presença
      </button>
    </div>
  );
}
