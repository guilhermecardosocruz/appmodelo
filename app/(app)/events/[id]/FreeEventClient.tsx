"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type FreeEventProps = {
  event: {
    id: string;
    name: string;
    type: string;
    description: string;
    location: string;
    inviteSlug: string;
  };
};

export default function FreeEventClient({ event }: FreeEventProps) {
  const [name, setName] = useState(event.name);
  const [description, setDescription] = useState(event.description);
  const [location, setLocation] = useState(event.location);
  const [inviteSlug, setInviteSlug] = useState(event.inviteSlug);
  const [origin, setOrigin] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingMessage, setSavingMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const inviteUrl =
    inviteSlug && origin ? `${origin}/invite/${inviteSlug}` : "";

  async function handleSave() {
    setError(null);
    setSaving(true);
    setSavingMessage(null);

    try {
      const res = await fetch(`/api/events/${event.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description: description || null,
          location: location || null,
          inviteSlug: inviteSlug || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Erro ao atualizar evento.");
        return;
      }

      setSavingMessage("Dados do evento salvos com sucesso.");
    } catch (err) {
      console.error(err);
      setError("Erro inesperado ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  function generateRandomSlug() {
    return `${event.id.slice(0, 6)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  }

  async function handleGenerateInviteLink() {
    setError(null);
    setGeneratingLink(true);
    setSavingMessage(null);

    try {
      const newSlug = inviteSlug || generateRandomSlug();
      setInviteSlug(newSlug);

      const res = await fetch(`/api/events/${event.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inviteSlug: newSlug,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Erro ao gerar link de convite.");
        return;
      }

      setSavingMessage("Link de convite gerado e salvo.");
    } catch (err) {
      console.error(err);
      setError("Erro inesperado ao gerar link.");
    } finally {
      setGeneratingLink(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <Link
          href="/dashboard"
          className="text-xs font-medium text-slate-300 hover:text-slate-100"
        >
          ← Voltar
        </Link>

        <span className="inline-flex items-center rounded-full bg-emerald-900/40 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-emerald-300 border border-emerald-700">
          Evento Free
        </span>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-3xl w-full mx-auto flex flex-col gap-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5">
          <h1 className="text-lg sm:text-xl font-semibold text-slate-50">
            Configuração do evento free
          </h1>

          {/* Nome */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-300">
              Nome do evento
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              placeholder="Nome do evento"
            />
          </div>

          {/* Descrição */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-300">
              Descrição
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[80px] rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              placeholder="Descreva brevemente o evento, público, objetivo, etc."
            />
          </div>

          {/* Local */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-300">
              Local
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              placeholder="Ex.: Ginásio Municipal, Escola X, Online, etc."
            />
          </div>

          {/* Link de convite */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-slate-300">
                Link de convite
              </label>
              <button
                type="button"
                onClick={handleGenerateInviteLink}
                disabled={generatingLink}
                className="inline-flex items-center rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
              >
                {generatingLink ? "Gerando..." : "Gerar link"}
              </button>
            </div>

            <input
              type="text"
              value={inviteUrl}
              readOnly
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 shadow-sm focus-visible:outline-none"
              placeholder="Nenhum link gerado ainda."
            />
            <p className="text-[11px] text-slate-500">
              Esse será o link que você poderá enviar como convite para as
              pessoas se inscreverem no evento (rota /invite ainda será
              implementada).
            </p>
          </div>

          {error && (
            <p className="text-xs text-red-400">
              {error}
            </p>
          )}

          {savingMessage && (
            <p className="text-xs text-emerald-400">
              {savingMessage}
            </p>
          )}

          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        </div>

        <p className="text-[11px] text-slate-500">
          Em breve, nesta mesma tela, podemos adicionar métricas, lista de
          inscritos, botão para exportar planilha, etc. Tudo específico para
          eventos do tipo free.
        </p>
      </main>
    </div>
  );
}
