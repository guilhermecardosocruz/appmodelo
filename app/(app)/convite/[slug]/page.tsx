"use client";

import { useState } from "react";

type PageProps = {
  params: {
    slug: string;
  };
};

export default function ConvitePage({ params }: PageProps) {
  const [name, setName] = useState("");
  const [confirmedName, setConfirmedName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = name.trim();
    if (!trimmed) {
      setError("Por favor, digite seu nome para confirmar a presença.");
      setConfirmedName(null);
      return;
    }

    setError(null);
    setConfirmedName(trimmed);

    // Futuro: aqui vamos enviar essa confirmação para o backend
    // junto com o slug do convite (params.slug).
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <h1 className="text-lg font-semibold mb-2 text-center">
          Confirmação de presença
        </h1>

        <p className="text-xs text-slate-400 mb-4 text-center">
          Este link é exclusivo para confirmação de presença neste evento.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-300">
              Seu nome completo
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              placeholder="Digite seu nome para confirmar presença"
            />
          </div>

          {error && (
            <p className="text-[11px] text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="mt-1 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500"
          >
            Confirmar presença
          </button>
        </form>

        {confirmedName && (
          <div className="mt-4 rounded-lg border border-emerald-700 bg-emerald-900/20 px-3 py-2">
            <p className="text-xs text-emerald-300">
              Presença confirmada para{" "}
              <span className="font-semibold">{confirmedName}</span>.
            </p>
            <p className="mt-1 text-[10px] text-emerald-200/80">
              Em breve, esta confirmação será registrada automaticamente na
              lista de confirmados do evento.
            </p>
          </div>
        )}

        <p className="mt-4 text-[10px] text-slate-500 text-center break-all">
          Código do convite: <span className="text-slate-400">{params.slug}</span>
        </p>
      </div>
    </div>
  );
}
