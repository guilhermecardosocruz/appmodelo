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
  latitude?: number | null;
  longitude?: number | null;
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

type UserSuggestion = {
  id: string;
  name: string;
  email: string;
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

  // Coordenadas de localização (apontador)
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Lista de convidados
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loadingGuests, setLoadingGuests] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);
  const [newGuestName, setNewGuestName] = useState("");
  const [addingGuest, setAddingGuest] = useState(false);

  // Busca de usuários para sugerir nomes
  const [userSuggestions, setUserSuggestions] = useState<UserSuggestion[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  // Seleção de sugestões (modo "lista + confirmar")
  const [selectedSuggestions, setSelectedSuggestions] = useState<string[]>([]);
  const [addingFromSuggestions, setAddingFromSuggestions] = useState(false);

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

        if (typeof found.latitude === "number") {
          setLatitude(found.latitude);
        } else {
          setLatitude(null);
        }

        if (typeof found.longitude === "number") {
          setLongitude(found.longitude);
        } else {
          setLongitude(null);
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

    void load();

    return () => {
      active = false;
    };
  }, [eventId]);

  // Busca de usuários por nome/e-mail enquanto digita o convidado
  useEffect(() => {
    let active = true;

    const query = newGuestName.trim();
    if (query.length < 2) {
      setUserSuggestions([]);
      setSelectedSuggestions([]);
      setSearchingUsers(false);
      return;
    }

    setSearchingUsers(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(query)}`,
          {
            credentials: "include",
            signal: controller.signal,
          },
        );

        if (!active) return;

        if (!res.ok) {
          console.warn("[FreeEventClient] Falha ao buscar usuários");
          setUserSuggestions([]);
          setSelectedSuggestions([]);
          return;
        }

        const data = (await res.json().catch(() => null)) as
          | { users?: UserSuggestion[] }
          | null;

        if (!active) return;

        const users = data?.users ?? [];
        setUserSuggestions(users);

        // Remove seleções que não existem mais na lista
        setSelectedSuggestions((prev) =>
          prev.filter((id) => users.some((u) => u.id === id)),
        );
      } catch (err) {
        if (!active) return;
        if ((err as Error)?.name !== "AbortError") {
          console.error("[FreeEventClient] Erro na busca de usuários:", err);
        }
        setUserSuggestions([]);
        setSelectedSuggestions([]);
      } finally {
        if (!active) return;
        setSearchingUsers(false);
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [newGuestName]);

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

      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          location: location.trim() || null,
          eventDate: eventDate || null,
          latitude,
          longitude,
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

      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}`, {
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

      setInviteSlug(newSlug);
      setSuccess("Link de convite atualizado com sucesso.");
    } catch (err) {
      console.error("[FreeEventClient] Erro ao gerar link:", err);
      setError("Erro inesperado ao gerar link de convite.");
    } finally {
      setGeneratingLink(false);
    }
  }

  // Adiciona convidado digitado manualmente
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
      setUserSuggestions([]);
      setSelectedSuggestions([]);
    } catch (err) {
      console.error("[FreeEventClient] Erro ao adicionar convidado:", err);
      setGuestError("Erro inesperado ao adicionar convidado.");
    } finally {
      setAddingGuest(false);
    }
  }

  // Alterna seleção de uma sugestão
  function toggleSuggestion(userId: string) {
    setSelectedSuggestions((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  }

  // Adiciona todos os selecionados (usuários com conta)
  async function handleAddSelectedSuggestions() {
    if (!eventId) {
      setGuestError("Evento não encontrado.");
      return;
    }

    if (!selectedSuggestions.length) {
      setGuestError("Selecione pelo menos uma pessoa da lista de sugestões.");
      return;
    }

    const toAdd = userSuggestions.filter((u) =>
      selectedSuggestions.includes(u.id),
    );
    if (!toAdd.length) {
      setGuestError("Nenhuma sugestão válida encontrada para adicionar.");
      return;
    }

    try {
      setAddingFromSuggestions(true);
      setGuestError(null);

      const newGuests: Guest[] = [];

      for (const u of toAdd) {
        const res = await fetch(`/api/events/${eventId}/guests`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: u.name }),
        });

        const data = (await res.json().catch(() => null)) as
          | Guest
          | { error?: string }
          | null;

        if (!res.ok) {
          const msg =
            data && "error" in data && typeof data.error === "string"
              ? data.error
              : "Erro ao adicionar alguns convidados sugeridos.";
          setGuestError(msg);
          break;
        }

        if (data && "id" in data) {
          newGuests.push(data as Guest);
        }
      }

      if (newGuests.length) {
        setGuests((prev) => [...prev, ...newGuests]);
      }

      // Mantém o texto digitado, mas limpa seleção
      setSelectedSuggestions([]);
    } catch (err) {
      console.error(
        "[FreeEventClient] Erro ao adicionar convidados sugeridos:",
        err,
      );
      setGuestError("Erro inesperado ao adicionar convidados sugeridos.");
    } finally {
      setAddingFromSuggestions(false);
    }
  }

  function handleUseCurrentLocation() {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setGeoError("Seu navegador não permite acesso à localização.");
      return;
    }

    setGeoLoading(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = position.coords;
        const lat = coords.latitude;
        const lng = coords.longitude;

        setLatitude(lat);
        setLongitude(lng);

        // Se o campo de texto estiver vazio, preenche com as coordenadas
        setLocation((prev) => {
          const trimmed = prev.trim();
          if (trimmed) return prev;
          return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        });

        setGeoLoading(false);
      },
      (err) => {
        console.error("[FreeEventClient] geolocation error:", err);
        setGeoError(
          "Não foi possível obter sua localização. Verifique as permissões do navegador.",
        );
        setGeoLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
      },
    );
  }

  const invitePath = inviteSlug ? `/convite/${inviteSlug}` : null;
  const confirmedListPath = eventId ? `/eventos/${eventId}/confirmados` : null;
  const portariaPath = eventId ? `/eventos/${eventId}/portaria` : null;

  // Localização e links de mapa
  const trimmedLocation = location.trim();
  const hasLocationText = trimmedLocation.length > 0;
  const hasGeo = typeof latitude === "number" && typeof longitude === "number";

  const mapQuery = hasGeo
    ? `${latitude!.toFixed(6)},${longitude!.toFixed(6)}`
    : trimmedLocation;

  const hasLocationForLinks = mapQuery.length > 0;

  const googleMapsUrl = hasLocationForLinks
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        mapQuery,
      )}`
    : null;

  const wazeUrl = hasLocationForLinks
    ? `https://waze.com/ul?q=${encodeURIComponent(mapQuery)}&navigate=yes`
    : null;

  // Ordena convidados por nome
  const sortedGuests = [...guests].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }),
  );

  const totalSelectedSuggestions = selectedSuggestions.length;

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

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  disabled={geoLoading}
                  className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-app hover:bg-card/70 disabled:opacity-60"
                >
                  {geoLoading
                    ? "Capturando localização..."
                    : "Usar minha localização atual"}
                </button>

                {hasGeo && (
                  <span className="text-[10px] text-app0">
                    Coordenadas salvas: {latitude?.toFixed(5)},{" "}
                    {longitude?.toFixed(5)}
                  </span>
                )}
              </div>

              {geoError && (
                <p className="text-[10px] text-red-500 mt-1">{geoError}</p>
              )}
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

            {/* Atalhos de mapa (somente se tiver localização ou coordenadas) */}
            {hasLocationForLinks && (
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

                {hasLocationText && (
                  <p className="text-[10px] text-app0 break-all">
                    Endereço atual: {trimmedLocation}
                  </p>
                )}
                {hasGeo && (
                  <p className="text-[10px] text-app0">
                    Coordenadas: {latitude?.toFixed(6)}, {longitude?.toFixed(6)}
                  </p>
                )}
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

            {/* Tela de portaria / leitor de ingressos */}
            <div className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted">
                  Tela da portaria (leitor de ingressos)
                </span>

                {portariaPath && (
                  <Link
                    href={portariaPath}
                    className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-app hover:bg-card/70"
                  >
                    Abrir tela da portaria
                  </Link>
                )}
              </div>
              <p className="text-[11px] text-muted">
                Use esta tela na entrada do evento para ler os QR Codes dos
                ingressos e registrar a entrada dos participantes. Ela mostra
                também a lista completa em ordem alfabética.
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
              <div className="flex flex-col gap-1">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={newGuestName}
                    onChange={(e) => setNewGuestName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleAddGuest();
                      }
                    }}
                    className="flex-1 rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app placeholder:text-app0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    placeholder="Nome do convidado (ex: João Silva)"
                    disabled={addingGuest || addingFromSuggestions}
                  />
                  <button
                    type="button"
                    disabled={addingGuest || addingFromSuggestions}
                    onClick={handleAddGuest}
                    className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
                  >
                    {addingGuest ? "Adicionando..." : "Adicionar convidado"}
                  </button>
                </div>

                {searchingUsers && (
                  <p className="text-[10px] text-app0 mt-1">
                    Procurando usuários cadastrados...
                  </p>
                )}

                {!searchingUsers &&
                  userSuggestions.length > 0 &&
                  newGuestName.trim().length >= 2 && (
                    <div className="mt-1 rounded-xl border border-dashed border-[var(--border)] bg-app/40 p-2">
                      <p className="text-[10px] text-app0 mb-1">
                        Usuários que já têm conta no aplicativo. Selecione um ou
                        mais nomes e depois clique em &quot;Adicionar
                        selecionados&quot;:
                      </p>
                      <ul className="max-h-40 overflow-y-auto space-y-1">
                        {userSuggestions.map((u) => {
                          const isSelected = selectedSuggestions.includes(u.id);
                          return (
                            <li key={u.id}>
                              <button
                                type="button"
                                onClick={() => toggleSuggestion(u.id)}
                                className={`w-full text-left rounded-lg px-2 py-1 text-[11px] flex flex-col border ${
                                  isSelected
                                    ? "border-emerald-600 bg-emerald-600/10"
                                    : "border-transparent hover:bg-card/80"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-semibold text-app">
                                    {u.name}
                                  </span>
                                  <span className="text-[10px] text-app0">
                                    {isSelected ? "Selecionado" : "Selecionar"}
                                  </span>
                                </div>
                                <span className="text-[10px] text-app0">
                                  {u.email}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="text-[10px] text-app0">
                          Selecionados:{" "}
                          <span className="font-semibold">
                            {totalSelectedSuggestions}
                          </span>
                        </p>
                        <button
                          type="button"
                          onClick={handleAddSelectedSuggestions}
                          disabled={
                            addingFromSuggestions || totalSelectedSuggestions === 0
                          }
                          className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
                        >
                          {addingFromSuggestions
                            ? "Adicionando..."
                            : totalSelectedSuggestions > 0
                            ? `Adicionar selecionados (${totalSelectedSuggestions})`
                            : "Adicionar selecionados"}
                        </button>
                      </div>
                    </div>
                  )}
              </div>

              {/* Mensagens logo abaixo do campo */}
              {guestError && (
                <p className="text-[11px] text-red-500">{guestError}</p>
              )}

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
