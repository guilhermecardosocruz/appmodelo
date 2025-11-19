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
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Campos do formulário
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState(""); // por enquanto só front
  const [description, setDescription] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [confirmedList, setConfirmedList] = useState(""); // lista de confirmados (1 por linha, por enquanto só front)
  const [location, setLocation] = useState("");

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
        setInviteLink(found.inviteSlug ?? "");

        // Esses dois ainda não estão integrados ao backend
        setEventDate("");
        setConfirmedList("");
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
          inviteSlug: inviteLink.trim() || null,
          // eventDate e confirmedList ainda não estão indo para o backend
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

            {/* Link para convite */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-300">
                Link para convite
              </label>
              <input
                type="text"
                value={inviteLink}
                onChange={(e) => setInviteLink(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                placeholder="Cole aqui o link de convite ou código que será usado"
              />
              <p className="text-[10px] text-slate-500">
                Esse campo é salvo no banco (inviteSlug) e poderá ser usado para gerar links de convite.
              </p>
            </div>

            {/* Lista de confirmados */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-300">
                Lista de confirmados
              </label>
              <textarea
                value={confirmedList}
                onChange={(e) => setConfirmedList(e.target.value)}
                rows={4}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 resize-y"
                placeholder="Digite um nome por linha, por enquanto essa lista é apenas visual (em breve será integrada com o backend)."
              />
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
