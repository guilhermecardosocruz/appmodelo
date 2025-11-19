"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type EventType = "PRE_PAGO" | "POS_PAGO" | "FREE";

type Event = {
  id: string;
  name: string;
  type: EventType;
  description?: string | null;
  location?: string | null;
  inviteSlug?: string | null;
  createdAt?: string;
};

export default function FreeEventClient() {
  const params = useParams() as { id?: string };
  const eventId = String(params?.id ?? "").trim();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Campos do formulário
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState(""); // ainda só front
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [inviteSlug, setInviteSlug] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        setSuccess(null);

        if (!eventId) {
          setError("Evento não encontrado.");
          return;
        }

        const res = await fetch("/api/events");
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          if (!active) return;
          setError(data?.error ?? "Erro ao carregar evento.");
          return;
        }

        const all = (await res.json()) as Event[];
        if (!active) return;

        const found = all.find((e) => e.id === eventId) ?? null;

        if (!found) {
          setError("Evento não encontrado.");
          return;
        }

        // Preenche os campos com o que já existe no banco
        setName(found.name ?? "");
        setDescription(found.description ?? "");
        setLocation(found.location ?? "");
        setInviteSlug(found.inviteSlug ?? null);

        // Esses ainda não estão integrados ao backend
        setEventDate("");
      } catch (err) {
        console.error("[FreeEventClient] Erro no fetch:", err);
        if (!active) return;
        setError("Erro inesperado ao carregar evento.");
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [eventId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!eventId) {
      setError("Evento não encontrado.");
      return;
    }

    if (!name.trim()) {
      setError("O nome do evento não pode ficar vazio.");
      setSuccess(null);
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const res = await fetch("/api/events", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: eventId,
          name: name.trim(),
          description: description.trim() || null,
          location: location.trim() || null,
          // inviteSlug é tratado separadamente no botão de gerar link
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Erro ao salvar alterações.");
        return;
      }

      setSuccess("Alterações salvas com sucesso.");
    } catch (err) {
      console.error("[FreeEventClient] Erro ao salvar:", err);
      setError("Erro inesperado ao salvar alterações.");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateInviteLink() {
    if (!eventId) {
      setError("Evento não encontrado.");
      return;
    }

    try {
      setGeneratingLink(true);
      setError(null);
      setSuccess(null);

      // Gera um slug simples e amigável
      const randomPart = Math.random().toString(36).slice(2, 8);
      const newSlug = `${eventId.slice(0, 6)}-${randomPart}`;

      const res = await fetch("/api/events", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: eventId,
          inviteSlug: newSlug,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Erro ao gerar link de convite.");
        return;
      }

      setInviteSlug(newSlug);
      setSuccess("Link de convite gerado com sucesso.");
    } catch (err) {
      console.error("[FreeEventClient] Erro ao gerar link:", err);
      setError("Erro inesperado ao gerar link de convite.");
    } finally {
      setGeneratingLink(false);
    }
  }

  const invitePath = inviteSlug ? `/convite/${inviteSlug}` : null;
  const confirmedListPath = eventId ? `/eventos/${eventId}/confirmados` : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <Link
          href="/dashboard/"
          className="text-xs font-medium text-slate-300 hover:text-slate-100"
        >
          ← Voltar
        </Link>

        <span className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-300 border border-slate-700">
          Evento free
        </span>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-3xl w-full mx-auto flex flex-col gap-4">
        {loading && (
          <p className="text-sm text-slate-300">Carregando evento...</p>
        )}

        {!loading && error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        {!loading && !error && (
          <form
            onSubmit={handleSave}
            className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-6"
          >
            <h1 className="text-lg sm:text-xl font-semibold text-slate-50">
              Configurações do evento free
            </h1>

            {success && (
              <p className="text-xs text-emerald-400">
                {success}
              </p>
            )}

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
                placeholder="Digite o nome do evento"
              />
            </div>

            {/* Data do evento (por enquanto só front) */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-300">
                Data do evento
              </label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              />
              <p className="text-[10px] text-slate-500">
                (Em breve vamos salvar essa data no banco.)
              </p>
            </div>

            {/* Descrição */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-300">
                Descrição do evento
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 resize-y"
                placeholder="Descreva brevemente o evento, público alvo, regras, etc."
              />
            </div>

            {/* Link para convite - gerado pelo sistema */}
            <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-300">
                  Link para convite
                </span>

                {!inviteSlug && (
                  <button
                    type="button"
                    disabled={generatingLink}
                    onClick={handleGenerateInviteLink}
                    className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
                  >
                    {generatingLink ? "Gerando..." : "Gerar link de convite"}
                  </button>
                )}
              </div>

              {inviteSlug && invitePath && (
                <div className="flex flex-col gap-1">
                  <Link
                    href={invitePath}
                    className="truncate text-xs text-emerald-400 hover:text-emerald-300 underline-offset-2 hover:underline"
                  >
                    {invitePath}
                  </Link>
                  <p className="text-[10px] text-slate-500">
                    Esse link abre a tela de confirmação. No futuro, as confirmações irão alimentar automaticamente a lista de confirmados.
                  </p>
                </div>
              )}

              {!inviteSlug && (
                <p className="text-[11px] text-slate-500">
                  Nenhum link gerado ainda. Clique em &quot;Gerar link de convite&quot; para criar um link único deste evento.
                </p>
              )}
            </div>

            {/* Lista de confirmados - agora vira acesso para nova página */}
            <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-300">
                  Lista de confirmados
                </span>

                {confirmedListPath && (
                  <Link
                    href={confirmedListPath}
                    className="inline-flex items-center justify-center rounded-lg border border-slate-600 px-3 py-1.5 text-[11px] font-semibold text-slate-100 hover:bg-slate-800/80"
                  >
                    Ver lista
                  </Link>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                A lista de confirmados será exibida em uma página dedicada. No futuro, ela será preenchida automaticamente conforme as pessoas confirmarem presença pelo link de convite.
              </p>
            </div>

            {/* Localização */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-300">
                Localização do evento
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                placeholder="Ex: Auditório principal, Sala 101, endereço, etc."
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
              >
                {saving ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
