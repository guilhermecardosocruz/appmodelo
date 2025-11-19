"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Confirmation = {
  id: string;
  name: string;
  createdAt: string;
};

export default function ConfirmadosClient() {
  const params = useParams() as { id?: string };
  const effectiveEventId = String(params?.id ?? "").trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmations, setConfirmations] = useState<Confirmation[]>([]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        console.log(
          "[ConfirmadosClient] params.id:",
          params?.id,
          "effectiveEventId:",
          effectiveEventId
        );

        if (!effectiveEventId) {
          setError("Evento não encontrado.");
          return;
        }

        const res = await fetch(`/api/events/${effectiveEventId}/confirmados`);

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          if (!active) return;
          setError(data?.error ?? "Erro ao carregar confirmados.");
          return;
        }

        const data = (await res.json()) as {
          confirmations?: Confirmation[];
        };

        if (!active) return;
        setConfirmations(data.confirmations ?? []);
      } catch (err) {
        console.error("[ConfirmadosClient] Erro ao carregar:", err);
        if (!active) return;
        setError("Erro inesperado ao carregar confirmados.");
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveEventId]);

  if (loading) {
    return (
      <p className="text-sm text-slate-300">
        Carregando lista de confirmados...
      </p>
    );
  }

  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (!confirmations.length) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-slate-50 mb-2">
          Confirmados neste evento
        </h2>
        <p className="text-sm text-slate-300">
          Ainda não há ninguém confirmado para este evento.
        </p>
        <p className="mt-2 text-[11px] text-slate-500">
          Assim que as pessoas confirmarem presença através do link de convite,
          elas aparecerão aqui automaticamente.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-6 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-50">
          Confirmados neste evento
        </h2>
        <p className="text-xs text-slate-400">
          Total:{" "}
          <span className="font-semibold text-slate-100">
            {confirmations.length}
          </span>
        </p>
      </div>

      <ul className="divide-y divide-slate-800">
        {confirmations.map((c, index) => (
          <li
            key={c.id}
            className="flex items-center justify-between gap-2 py-2"
          >
            <div className="flex items-center gap-3">
              <span className="w-6 text-[11px] text-slate-500">
                #{index + 1}
              </span>
              <span className="text-sm text-slate-100">{c.name}</span>
            </div>
            <span className="text-[11px] text-slate-500">
              {new Date(c.createdAt).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
