/* eslint-disable react/no-unescaped-entities */
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
  eventDate?: string | null; // ISO string
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
  const [eventDate, setEventDate] = useState(""); // "YYYY-MM-DD"
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

        // Carrega evento pelo ID
        const eventRes = await fetch(`/api/events/${eventId}`);
        if (!eventRes.ok) {
          const data = await eventRes.json().catch(() => null);
          if (!active) return;
          setError(data?.error ?? "Erro ao carregar evento.");
          return;
        }

        const found = (await eventRes.json()) as Event;
        if (!active) return;

        setName(found.name ?? "");
        setDescription(found.description ?? "");
        setLocation(found.location ?? "");
        setInviteSlug(found.inviteSlug ?? null);

        if (found.eventDate) {
          const onlyDate = found.eventDate.slice(0, 10);
          setEventDate(onlyDate);
        } else {
          setEventDate("");
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
        headers: {
          "Content-Type": "application/json",
        },
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
      setSuccess("Link de convite atualizado com sucesso.");
    } catch (err) {
      console.error("[FreeEventClient] Erro ao gerar link:", err);
      setError("Erro inesperado ao gerar link de convite.");
    } finally {
      setGeneratingLink(false);
    }
  }

  // agora não é mais submit de form, é uma ação disparada pelo botão
  async function handleAddGuest() {
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
        headers: {
          "Content-Type": "application/json",
        },
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

  // Localização e links de mapa
  const trimmedLocation = location.trim();
  const hasLocation = trimmedLocation.length > 0;

  const googleMapsUrl = hasLocation
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        trimmedLocation
      )}`
    : null;

  const wazeUrl = hasLocation
    ? `https://waze.com/ul?q=${encodeURIComponent(
        trimmedLocation
      )}&navigate=yes`
    : null;

  // Ordena convidados por nome
  const sortedGuests = [...guests].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
  );

  return (
    <div className="min-h-screen bg-app text-app flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
        <Link
          href="/dashboard/"
          className="text-xs font-medium text-muted hover:text-app"
        >
          ← Voltar
        </Link>

        <span className="inline-flex items-center rounded-full bg-card px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted border border-[var(--border)]">
          Evento free
        </span>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-3xl w-full mx-auto flex flex-col gap-4">
        {loading && <p className="text-sm text-muted">Carregando evento...</p>}

        {!loading && error && <p className="text-sm text-red-500">{error}</p>}

        {!loading && !error && (
          <form
            onSubmit={handleSave}
            className="flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-card p-4 sm:p-6"
          >
            <h1 className="text-lg sm:text-xl font-semibold text-app">
              Configurações do evento free
            </h1>

            {success && <p className="text-xs text-emerald-500">{success}</p>}

            {/* Nome */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted">
                Nome do evento
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app placeholder:text-app0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                placeholder="Digite o nome do evento"
              />
            </div>

            {/* Data do evento */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted">
                Data do evento
              </label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app placeholder:text-app0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              />
              <p className="text-[10px] text-app0">
                Essa data é salva junto com o evento.
              </p>
            </div>

            {/* Local do evento */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted">
                Local do evento
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app placeholder:text-app0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                placeholder="Ex.: Rua Nome da Rua, 123 - Bairro, Cidade - UF"
              />
              <p className="text-[10px] text-app0">
                Formato sugerido: "Rua Nome da Rua, 123 - Bairro, Cidade - UF".
              </p>
              <p className="text-[10px] text-app0">
                Esse endereço será usado para gerar atalhos para Google Maps e
                Waze. Evite abreviações muito fora do padrão para não confundir
                o mapa.
              </p>
            </div>

            {/* Descrição */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted">
                Descrição do evento
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app placeholder:text-app0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 resize-y"
                placeholder="Descreva brevemente o evento, público alvo, regras, etc."
              />
            </div>

            {/* Atalhos de mapa (somente se tiver localização) */}
            {hasLocation && (
              <div className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-card p-3">
                <span className="text-xs font-medium text-muted">
                  Como chegar ao local
                </span>
                <p className="text-[11px] text-app0">
                  Use os atalhos abaixo para abrir o endereço direto no
                  aplicativo de mapas do celular ou no navegador.
                </p>

                <div className="flex flex-wrap gap-2 mt-1">
                  {googleMapsUrl && (
                    <a
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-app hover:bg-card/70"
                    >
                      Abrir no Google Maps
                    </a>
                  )}

                  {wazeUrl && (
                    <a
                      href={wazeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-app hover:bg-card/70"
                    >
                      Abrir no Waze
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Link para convite aberto */}
            <div className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted">
                  Link de convite aberto
                </span>

                <button
                  type="button"
                  disabled={generatingLink}
                  onClick={handleGenerateInviteLink}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
                >
                  {generatingLink
                    ? "Gerando..."
                    : inviteSlug
                    ? "Gerar novo link"
                    : "Gerar link de convite"}
                </button>
              </div>

              {inviteSlug && invitePath && (
                <div className="flex flex-col gap-1">
                  <Link
                    href={invitePath}
                    className="truncate text-xs text-emerald-500 hover:text-emerald-600 underline-offset-2 hover:underline"
                  >
                    {invitePath}
                  </Link>
                  <p className="text-[10px] text-app0">
                    Esse link abre a tela de confirmação genérica. Qualquer
                    pessoa com o link pode confirmar presença.
                  </p>
                </div>
              )}

              {!inviteSlug && (
                <p className="text-[11px] text-app0">
                  Nenhum link gerado ainda. Clique em &quot;Gerar link de
                  convite&quot; para criar um link único deste evento.
                </p>
              )}
            </div>

            {/* Lista de confirmados (link aberto) */}
            <div className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted">
                  Lista de confirmados (link aberto)
                </span>

                {confirmedListPath && (
                  <Link
                    href={confirmedListPath}
                    className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-app hover:bg-card/70"
                  >
                    Ver lista
                  </Link>
                )}
              </div>
              <p className="text-[11px] text-muted">
                Essa lista mostra todas as pessoas que confirmaram presença a
                partir do link aberto de convite.
              </p>
            </div>

            {/* Lista de convidados nomeados */}
            <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-card p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-app">
                  Lista de convidados
                </h2>
                {loadingGuests && (
                  <span className="text-[11px] text-muted">
                    Carregando convidados...
                  </span>
                )}
              </div>

              {/* Campo para adicionar convidado (sem form aninhado) */}
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={newGuestName}
                  onChange={(e) => setNewGuestName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddGuest();
                    }
                  }}
                  className="flex-1 rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app placeholder:text-app0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  placeholder="Nome do convidado (ex: João Silva)"
                  disabled={addingGuest}
                />
                <button
                  type="button"
                  disabled={addingGuest}
                  onClick={handleAddGuest}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
                >
                  {addingGuest ? "Adicionando..." : "Adicionar convidado"}
                </button>
              </div>

              {/* Mensagens logo abaixo do campo */}
              {guestError && <p className="text-[11px] text-red-500">{guestError}</p>}

              {!loadingGuests && !sortedGuests.length && !guestError && (
                <p className="text-[11px] text-app0">
                  Nenhum convidado adicionado ainda. Comece adicionando nomes
                  acima para gerar links de convite individuais.
                </p>
              )}

              {/* Lista em ordem alfabética */}
              {sortedGuests.length > 0 && (
                <div className="mt-1 space-y-2">
                  <p className="text-[11px] text-muted">
                    Os convidados abaixo estão ordenados por nome. Quem ainda
                    não confirmou tem um link exclusivo de convite.
                  </p>

                  <ul className="divide-y divide-[var(--border)]">
                    {sortedGuests.map((guest, index) => {
                      const guestPath = guest.slug
                        ? `/convite/pessoa/${guest.slug}`
                        : null;
                      const isConfirmed = !!guest.confirmedAt;

                      return (
                        <li key={guest.id} className="py-2 flex flex-col gap-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-3">
                              <span className="w-6 text-[11px] text-app0">
                                #{index + 1}
                              </span>
                              <span className="text-sm text-app">
                                {guest.name}
                              </span>
                            </div>
                            <span className="text-[11px]">
                              {isConfirmed ? (
                                <span className="text-emerald-500">
                                  Confirmado
                                </span>
                              ) : (
                                <span className="text-muted">Pendente</span>
                              )}
                            </span>
                          </div>

                          {/* Link só para quem ainda não confirmou */}
                          {!isConfirmed && guestPath && (
                            <Link
                              href={guestPath}
                              className="text-[11px] text-emerald-500 hover:text-emerald-600 underline-offset-2 hover:underline break-all"
                            >
                              {guestPath}
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
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
