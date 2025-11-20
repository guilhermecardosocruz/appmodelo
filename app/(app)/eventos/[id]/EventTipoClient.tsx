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

type Guest = {
  id: string;
  name: string;
  slug: string;
  confirmedAt?: string | null;
};

type Mode = "free" | "pre" | "pos";

type Props = {
  mode: Mode;
};

function getTitle(mode: Mode) {
  if (mode === "pre") return "Configurações do evento pré pago";
  if (mode === "pos") return "Evento pós pago";
  return "Evento free";
}

function getDescription(mode: Mode) {
  if (mode === "pre") {
    return "Aqui você configura os detalhes do evento pré pago e obtém os links de convite para enviar aos convidados.";
  }
  if (mode === "pos") {
    return "Aqui terá a lógica do evento pós pago.";
  }
  return "Aqui terá a lógica do evento free.";
}

export default function EventTipoClient({ mode }: Props) {
  const params = useParams() as { id?: string };
  const eventId = String(params?.id ?? "").trim();

  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Convites (link aberto)
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [generatingInvite, setGeneratingInvite] = useState(false);

  // Convidados individuais
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loadingGuests, setLoadingGuests] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);
  const [showGuests, setShowGuests] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        setInviteError(null);
        setInviteSuccess(null);
        setCopyMessage(null);

        console.log(
          "[EventTipoClient] params.id:",
          params?.id,
          "eventId:",
          eventId
        );

        if (!eventId) {
          setError("Evento não encontrado.");
          setEvent(null);
          return;
        }

        console.log(
          "[EventTipoClient] Carregando evento de /api/events/[id]..."
        );
        const res = await fetch(`/api/events/${eventId}`);

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          if (!active) return;

          setError(data?.error ?? "Erro ao carregar evento.");
          setEvent(null);
          return;
        }

        const data = (await res.json()) as Event;
        if (!active) return;

        setEvent(data);

        // Carrega convidados individuais (se houver rota)
        try {
          setLoadingGuests(true);
          setGuestError(null);

          const guestsRes = await fetch(`/api/events/${eventId}/guests`);

          if (!guestsRes.ok) {
            const gData = await guestsRes.json().catch(() => null);
            if (!active) return;
            setGuestError(
              gData?.error ??
                "Erro ao carregar convites individuais (lista de convidados)."
            );
          } else {
            const gData = (await guestsRes.json()) as { guests?: Guest[] };
            if (!active) return;
            setGuests(gData.guests ?? []);
          }
        } catch (err) {
          console.error(
            "[EventTipoClient] Erro ao carregar convidados individuais:",
            err
          );
          if (!active) return;
          setGuestError(
            "Erro inesperado ao carregar convites individuais deste evento."
          );
        } finally {
          if (!active) return;
          setLoadingGuests(false);
        }
      } catch (err) {
        console.error("[EventTipoClient] Erro no fetch:", err);
        if (!active) return;
        setError("Erro inesperado ao carregar evento.");
        setEvent(null);
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
  }, [eventId, mode]);

  async function handleGenerateInviteLink() {
    if (!eventId) {
      setInviteError("Evento não encontrado.");
      return;
    }

    try {
      setGeneratingInvite(true);
      setInviteError(null);
      setInviteSuccess(null);

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
        setInviteError(data?.error ?? "Erro ao gerar link de convite.");
        return;
      }

      setEvent((prev) => (prev ? { ...prev, inviteSlug: newSlug } : prev));
      setInviteSuccess("Link de convite atualizado com sucesso.");
    } catch (err) {
      console.error("[EventTipoClient] Erro ao gerar link:", err);
      setInviteError("Erro inesperado ao gerar link de convite.");
    } finally {
      setGeneratingInvite(false);
    }
  }

  async function handleCopyInviteLink() {
    if (!event?.inviteSlug) return;

    const path = `/convite/${event.inviteSlug}`;
    const fullUrl =
      typeof window !== "undefined" ? `${window.location.origin}${path}` : path;

    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopyMessage("Link copiado para a área de transferência.");
      setTimeout(() => setCopyMessage(null), 3000);
    } catch (err) {
      console.error("[EventTipoClient] Erro ao copiar link:", err);
      setCopyMessage(
        `Não foi possível copiar automaticamente. Copie manualmente: ${fullUrl}`
      );
    }
  }

  const invitePath =
    event?.inviteSlug != null ? `/convite/${event.inviteSlug}` : null;
  const hasInvite = !!invitePath;

  const hasIndividualInvites = guests.length > 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <Link
          href="/dashboard/"
          className="text-xs font-medium text-slate-300 hover:text-slate-100"
        >
          ← Voltar
        </Link>

        {event && (
          <span className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-300 border border-slate-700">
            {event.type}
          </span>
        )}
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-3xl w-full mx-auto flex flex-col gap-4">
        {loading && (
          <p className="text-sm text-slate-300">Carregando evento...</p>
        )}

        {error && !loading && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        {!loading && !error && !event && (
          <p className="text-sm text-slate-300">Evento não encontrado.</p>
        )}

        {event && (
          <>
            <h1 className="text-xl sm:text-2xl font-semibold text-slate-50">
              {event.name}
            </h1>

            <h2 className="text-sm font-medium text-slate-200">
              {getTitle(mode)}
            </h2>

            <p className="text-sm text-slate-300">{getDescription(mode)}</p>

            {/* Bloco de convites e compartilhamento */}
            <section className="mt-2 flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wide">
                  Convites e compartilhamento
                </h3>

                {event.inviteSlug && (
                  <span className="text-[11px] text-slate-400">
                    Código do convite:{" "}
                    <span className="text-slate-200">
                      {event.inviteSlug}
                    </span>
                  </span>
                )}
              </div>

              <p className="text-[11px] text-slate-400">
                Gere o link de convite para compartilhar com os convidados. Os
                convites individuais usam a mesma base de evento, mas geram um
                link exclusivo para cada pessoa.
              </p>

              <div className="flex flex-wrap gap-2 mt-1">
                {/* Ver convite */}
                {hasInvite ? (
                  <Link
                    href={invitePath!}
                    target="_blank"
                    className="inline-flex items-center justify-center rounded-lg border border-slate-600 px-3 py-1.5 text-[11px] font-semibold text-slate-100 hover:bg-slate-800/80"
                  >
                    Ver convite
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-3 py-1.5 text-[11px] font-semibold text-slate-500 cursor-not-allowed"
                  >
                    Ver convite
                  </button>
                )}

                {/* Copiar link */}
                <button
                  type="button"
                  disabled={!hasInvite}
                  onClick={handleCopyInviteLink}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-600 px-3 py-1.5 text-[11px] font-semibold text-slate-100 hover:bg-slate-800/80 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Copiar link
                </button>

                {/* Gerar novo link */}
                <button
                  type="button"
                  onClick={handleGenerateInviteLink}
                  disabled={generatingInvite}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
                >
                  {generatingInvite ? "Gerando..." : "Gerar novo link de convite"}
                </button>

                {/* Ver convites individuais */}
                <button
                  type="button"
                  onClick={() => setShowGuests((prev) => !prev)}
                  disabled={!hasIndividualInvites}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-600 px-3 py-1.5 text-[11px] font-semibold text-slate-100 hover:bg-slate-800/80 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Ver convites individuais
                  {hasIndividualInvites ? ` (${guests.length})` : ""}
                </button>
              </div>

              {inviteError && (
                <p className="text-[11px] text-red-400">{inviteError}</p>
              )}

              {inviteSuccess && (
                <p className="text-[11px] text-emerald-400">
                  {inviteSuccess}
                </p>
              )}

              {copyMessage && (
                <p className="text-[11px] text-emerald-300">
                  {copyMessage}
                </p>
              )}

              {/* Lista de convites individuais (se houver) */}
              {showGuests && (
                <div className="mt-3 border-t border-slate-800 pt-2">
                  {loadingGuests && (
                    <p className="text-[11px] text-slate-400">
                      Carregando convites individuais...
                    </p>
                  )}

                  {guestError && !loadingGuests && (
                    <p className="text-[11px] text-red-400">
                      {guestError}
                    </p>
                  )}

                  {!loadingGuests && !guestError && guests.length === 0 && (
                    <p className="text-[11px] text-slate-500">
                      Ainda não há convites individuais cadastrados para este
                      evento.
                    </p>
                  )}

                  {!loadingGuests && !guestError && guests.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] text-slate-400">
                        Convites individuais gerados para os convidados
                        abaixo. Cada linha possui um link exclusivo para
                        envio.
                      </p>
                      <ul className="divide-y divide-slate-800">
                        {guests.map((guest, index) => {
                          const guestPath = guest.slug
                            ? `/convite/pessoa/${guest.slug}`
                            : null;
                          const isConfirmed = !!guest.confirmedAt;
                          const fullGuestUrl =
                            guestPath && typeof window !== "undefined"
                              ? `${window.location.origin}${guestPath}`
                              : guestPath ?? "";

                          return (
                            <li
                              key={guest.id}
                              className="py-2 flex flex-col gap-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-3">
                                  <span className="w-6 text-[11px] text-slate-500">
                                    #{index + 1}
                                  </span>
                                  <span className="text-sm text-slate-50">
                                    {guest.name}
                                  </span>
                                </div>
                                <span className="text-[11px]">
                                  {isConfirmed ? (
                                    <span className="text-emerald-400">
                                      Confirmado
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">
                                      Pendente
                                    </span>
                                  )}
                                </span>
                              </div>

                              {guestPath && (
                                <a
                                  href={guestPath}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[11px] text-emerald-400 hover:text-emerald-300 underline-offset-2 hover:underline break-all"
                                >
                                  {fullGuestUrl}
                                </a>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Placeholder explicando que o restante virá depois */}
            <p className="mt-4 text-[11px] text-slate-500">
              (Em breve, nesta mesma tela, vamos adicionar formulários completos
              para configurar regras de pagamento, políticas de reembolso, lotes
              e outras automações do evento pré pago.)
            </p>
          </>
        )}
      </main>
    </div>
  );
}
