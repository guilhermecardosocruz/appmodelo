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
  eventDate?: string | null;
  createdAt?: string;
};

type Guest = {
  id: string;
  name: string;
  slug: string;
  confirmedAt?: string | null;
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
  const [eventDate, setEventDate] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [inviteSlug, setInviteSlug] = useState<string | null>(null);

  // Lista de convidados
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loadingGuests, setLoadingGuests] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);
  const [newGuestName, setNewGuestName] = useState("");
  const [addingGuest, setAddingGuest] = useState(false);

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

        // Carrega eventos
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

        setName(found.name ?? "");
        setDescription(found.description ?? "");
        setLocation(found.location ?? "");
        setInviteSlug(found.inviteSlug ?? null);

        if (found.eventDate) {
          const onlyDate = found.eventDate.slice(0, 10);
          setEventDate(onlyDate);
        }

        // Carrega convidados
        setLoadingGuests(true);
        setGuestError(null);

        const guestsRes = await fetch(`/api/events/${eventId}/guests`);
        if (!guestsRes.ok) {
          const data = await guestsRes.json().catch(() => null);
          if (!active) return;
          setGuestError(data?.error ?? "Erro ao carregar lista de convidados.");
        } else {
          const data = (await guestsRes.json()) as { guests?: Guest[] };
          if (!active) return;
          setGuests(data.guests ?? []);
        }
      } catch (err) {
        console.error("[FreeEventClient] Erro no fetch:", err);
        if (!active) return;
        setError("Erro inesperado ao carregar evento.");
      } finally {
        if (!active) return;
        setLoading(false);
        setLoadingGuests(false);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: eventId,
          name: name.trim(),
          description: description.trim() || null,
          location: location.trim() || null,
          eventDate: eventDate || null,
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

      const randomPart = Math.random().toString(36).slice(2, 8);
      const newSlug = `${eventId.slice(0, 6)}-${randomPart}`;

      const res = await fetch("/api/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: eventId, inviteSlug: newSlug }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Erro ao gerar link de convite.");
        return;
      }

      setInviteSlug(newSlug);
      setSuccess("Link de convite atualizado com sucesso.");
    } catch (err) {
      console.error("[FreeEventClient] Erro ao gerar link:", err);
      setError("Erro inesperado ao gerar link de convite.");
    } finally {
      setGeneratingLink(false);
    }
  }

  async function handleAddGuest(e: React.FormEvent) {
    e.preventDefault();
    if (!eventId) {
      setGuestError("Evento não encontrado.");
      return;
    }

    const trimmed = newGuestName.trim();
    if (!trimmed) {
      setGuestError("Digite o nome do convidado antes de adicionar.");
      return;
    }

    try {
      setAddingGuest(true);
      setGuestError(null);

      const res = await fetch(`/api/events/${eventId}/guests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setGuestError(data?.error ?? "Erro ao adicionar convidado.");
        return;
      }

      const created = (await res.json()) as Guest;

      setGuests((prev) => [...prev, created]);
      setNewGuestName("");
    } catch (err) {
      console.error("[FreeEventClient] Erro ao adicionar convidado:", err);
      setGuestError("Erro inesperado ao adicionar convidado.");
    } finally {
      setAddingGuest(false);
    }
  }

  const invitePath = inviteSlug ? `/convite/${inviteSlug}` : null;
  const confirmedListPath = eventId ? `/eventos/${eventId}/confirmados` : null;

  const sortedGuests = [...guests].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
  );

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
        {loading && <p className="text-sm text-slate-300">Carregando evento...</p>}
        {!loading && error && <p className="text-sm text-red-400">{error}</p>}

        {!loading && !error && (
          <form
            onSubmit={handleSave}
            className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-6"
          >
            <h1 className="text-lg sm:text-xl font-semibold text-slate-50">
              Configurações do evento free
            </h1>

            {success && <p className="text-xs text-emerald-400">{success}</p>}

            <!-- Nome -->
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-300">Nome do evento</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50"
                placeholder="Digite o nome do evento"
              />
            </div>

            <!-- Data -->
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-300">Data do evento</label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50"
              />
            </div>

            <!-- Descrição -->
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-300">Descrição</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50"
                rows={4}
              />
            </div>

            <!-- Link aberto -->
            <div className="flex flex-col gap-2 p-3 border rounded-xl border-slate-800 bg-slate-950/60">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-300">
                  Link de convite aberto
                </span>
                <button
                  type="button"
                  disabled={generatingLink}
                  onClick={handleGenerateInviteLink}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white"
                >
                  {generatingLink ? "Gerando..." : "Gerar novo link"}
                </button>
              </div>

              {inviteSlug && invitePath && (
                <Link href={invitePath} className="text-xs text-emerald-400 break-all">
                  {invitePath}
                </Link>
              )}
            </div>

            <!-- Lista de convidados -->
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/80 p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-50">Lista de convidados</h2>
                {loadingGuests && (
                  <span className="text-[11px] text-slate-400">Carregando convidados...</span>
                )}
              </div>

              <form onSubmit={handleAddGuest} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={newGuestName}
                  onChange={(e) => setNewGuestName(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2
