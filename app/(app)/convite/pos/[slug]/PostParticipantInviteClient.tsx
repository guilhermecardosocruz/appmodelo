"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import SessionStatus from "@/components/SessionStatus";

type EventType = "PRE_PAGO" | "POS_PAGO" | "FREE";

type Event = {
  id: string;
  name: string;
  type: EventType;
  description?: string | null;
  location?: string | null;
  eventDate?: string | null; // ISO
};

type PostParticipant = {
  id: string;
  name: string;
  userId?: string | null;
  createdAt?: string | null;
};

type MeResponse =
  | { authenticated: false }
  | {
      authenticated: true;
      user: {
        id: string;
        name: string;
        email: string;
      };
    };

type Props = {
  slug: string;
};

function formatDate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dia = String(d.getUTCDate()).padStart(2, "0");
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  const ano = d.getUTCFullYear();
  return `${dia}/${mes}/${ano}`;
}

function buildGoogleMapsUrl(location: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    location,
  )}`;
}

function buildWazeUrl(location: string) {
  return `https://waze.com/ul?q=${encodeURIComponent(
    location,
  )}&navigate=yes`;
}

export default function PostParticipantInviteClient({ slug }: Props) {
  const params = useParams() as { slug?: string };
  const router = useRouter();
  const effectiveSlug = String(params?.slug ?? slug ?? "").trim();

  const [event, setEvent] = useState<Event | null>(null);
  const [participant, setParticipant] = useState<PostParticipant | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionName, setSessionName] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // Carrega dados do convite (evento + participante)
  useEffect(() => {
    let active = true;

    async function loadInvite() {
      try {
        setLoadingInvite(true);
        setInviteError(null);
        setEvent(null);
        setParticipant(null);

        if (!effectiveSlug) {
          setInviteError("Código de convite inválido.");
          return;
        }

        const res = await fetch(
          `/api/events/post-participants/${encodeURIComponent(effectiveSlug)}`,
          {
            credentials: "include",
          },
        );

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          if (!active) return;

          if (res.status === 404) {
            setInviteError(
              "Nenhum convite pós-pago encontrado para este código.",
            );
          } else {
            setInviteError(
              data?.error ?? "Erro ao carregar informações do convite.",
            );
          }
          return;
        }

        const data = (await res.json()) as {
          event: Event;
          participant: PostParticipant;
        };

        if (!active) return;

        setEvent(data.event);
        setParticipant(data.participant);
      } catch (err) {
        console.error(
          "[PostParticipantInviteClient] Erro ao carregar convite:",
          err,
        );
        if (!active) return;
        setInviteError("Erro inesperado ao carregar o convite.");
      } finally {
        if (!active) return;
        setLoadingInvite(false);
      }
    }

    void loadInvite();
    return () => {
      active = false;
    };
  }, [effectiveSlug]);

  // Checa sessão
  useEffect(() => {
    let active = true;

    async function loadAuth() {
      try {
        setAuthLoading(true);
        const res = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        });

        if (!active) return;

        if (!res.ok) {
          setIsAuthenticated(false);
          setSessionName(null);
          setSessionEmail(null);
          setSessionUserId(null);
          return;
        }

        const data = (await res.json()) as MeResponse;
        if (!active) return;

        if (!data.authenticated) {
          setIsAuthenticated(false);
          setSessionName(null);
          setSessionEmail(null);
          setSessionUserId(null);
          return;
        }

        setIsAuthenticated(true);
        setSessionName(data.user.name);
        setSessionEmail(data.user.email);
        setSessionUserId(data.user.id);
      } catch (err) {
        console.error(
          "[PostParticipantInviteClient] Erro ao carregar sessão:",
          err,
        );
        if (!active) return;
        setIsAuthenticated(false);
        setSessionName(null);
        setSessionEmail(null);
        setSessionUserId(null);
      } finally {
        if (!active) return;
        setAuthLoading(false);
      }
    }

    void loadAuth();
    return () => {
      active = false;
    };
  }, []);

  const formattedDate = formatDate(event?.eventDate);
  const trimmedLocation = useMemo(
    () => (event?.location ?? "").trim(),
    [event?.location],
  );
  const hasLocation = trimmedLocation.length > 0;

  const googleMapsUrl = useMemo(
    () => (hasLocation ? buildGoogleMapsUrl(trimmedLocation) : null),
    [hasLocation, trimmedLocation],
  );
  const wazeUrl = useMemo(
    () => (hasLocation ? buildWazeUrl(trimmedLocation) : null),
    [hasLocation, trimmedLocation],
  );

  const invitePath = useMemo(() => {
    if (!effectiveSlug) return "/dashboard";
    return `/convite/pos/${encodeURIComponent(effectiveSlug)}`;
  }, [effectiveSlug]);

  const inviteAlreadyLinked = !!participant?.userId;
  const inviteLinkedToMe =
    inviteAlreadyLinked &&
    !!sessionUserId &&
    participant?.userId === sessionUserId;

  async function handleConfirm() {
    if (!event || !participant) {
      setConfirmError(
        "Convite ainda não foi carregado. Tente novamente em instantes.",
      );
      return;
    }

    setConfirmError(null);

    try {
      setConfirming(true);

      const res = await fetch(
        `/api/events/post-participants/${encodeURIComponent(effectiveSlug)}`,
        {
          method: "POST",
          credentials: "include",
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg: string =
          data?.error ?? "Erro ao confirmar sua participação neste evento.";
        setConfirmError(msg);
        return;
      }

      // Atualiza estado local para refletir vínculo
      const data = (await res.json()) as {
        ok: boolean;
        alreadyLinked?: boolean;
        eventId?: string;
        participantId?: string;
      };

      if (data.ok) {
        // Redireciona para o dashboard, onde o evento já deve aparecer
        router.push("/dashboard");
      } else {
        setConfirmError(
          "Não foi possível confirmar sua participação. Tente novamente.",
        );
      }
    } catch (err) {
      console.error(
        "[PostParticipantInviteClient] Erro ao confirmar convite:",
        err,
      );
      setConfirmError(
        "Erro inesperado ao confirmar participação. Tente novamente em instantes.",
      );
    } finally {
      setConfirming(false);
    }
  }

  const primaryButtonLabel = (() => {
    if (confirming) return "Confirmando...";
    if (inviteLinkedToMe) return "Convite já confirmado";
    return "Confirmar participação e ir para o painel";
  })();

  return (
    <div className="min-h-screen bg-app text-app">
      <div className="max-w-2xl mx-auto px-4 py-10 flex flex-col gap-8">
        <header className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Convite pós-pago (participante)
          </p>

          <h1 className="text-2xl sm:text-3xl font-semibold text-app">
            {event ? event.name : "Convite para evento pós-pago"}
          </h1>

          <p className="text-sm text-muted max-w-xl">
            Este convite é para o participante{" "}
            <span className="font-semibold text-app">
              {participant?.name ?? "do racha"}
            </span>
            . Ao confirmar, este evento será exibido no seu dashboard com os
            mesmos limites de edição de um convidado.
          </p>

          <SessionStatus />
        </header>

        <section className="rounded-2xl border border-[var(--border)] bg-card p-4 space-y-2">
          {loadingInvite && (
            <p className="text-xs text-muted">
              Carregando informações do convite...
            </p>
          )}
          {!loadingInvite && inviteError && (
            <p className="text-xs text-red-400">{inviteError}</p>
          )}

          {!loadingInvite && !inviteError && event && participant && (
            <div className="space-y-1 text-xs sm:text-sm text-muted">
              <p>
                <span className="font-semibold text-app">Evento:</span>{" "}
                {event.name}
              </p>

              {formattedDate && (
                <p>
                  <span className="font-semibold text-app">Data:</span>{" "}
                  {formattedDate}
                </p>
              )}

              {event.location && (
                <p>
                  <span className="font-semibold text-app">Local:</span>{" "}
                  {event.location}
                </p>
              )}

              <p>
                <span className="font-semibold text-app">Participante:</span>{" "}
                {participant.name}
              </p>

              {inviteAlreadyLinked && (
                <p
                  className={
                    inviteLinkedToMe
                      ? "pt-1 text-emerald-300"
                      : "pt-1 text-amber-300"
                  }
                >
                  {inviteLinkedToMe
                    ? "Este convite já está vinculado à sua conta."
                    : "Este convite já foi vinculado à conta de outra pessoa."}
                </p>
              )}
            </div>
          )}
        </section>

        {hasLocation && (
          <section className="space-y-3 text-sm">
            <h2 className="text-sm font-semibold text-app">Como chegar</h2>
            <div className="rounded-2xl border border-[var(--border)] bg-card p-4 space-y-2">
              <p className="text-[11px] text-muted">
                Use os atalhos abaixo para abrir o endereço no seu aplicativo de
                mapas preferido.
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
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-app">
            Confirmar participação
          </h2>

          {inviteError && (
            <p className="text-xs text-red-400">
              Não é possível confirmar presença: {inviteError}
            </p>
          )}

          {!inviteError && (
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">
                  Participante
                </label>
                <input
                  value={participant?.name ?? ""}
                  readOnly
                  className="rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app shadow-sm opacity-80"
                />
                {sessionName && (
                  <p className="text-[10px] text-app0">
                    Você está logado como{" "}
                    <span className="font-semibold text-app">
                      {sessionName}
                    </span>
                    . Este convite é para{" "}
                    <span className="font-semibold text-app">
                      {participant?.name ?? "o participante"}
                    </span>
                    .
                  </p>
                )}
              </div>

              {!isAuthenticated && (
                <div className="space-y-3">
                  <div className="rounded-xl bg-card/60 border border-[var(--border)] px-3 py-2">
                    <p className="text-[10px] text-app0">
                      Para confirmar este convite pós-pago e ver o evento no seu
                      dashboard, faça login ou crie uma conta. Depois, você será
                      redirecionado de volta a esta página.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/login?next=${encodeURIComponent(invitePath)}`,
                        )
                      }
                      className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold text-app hover:bg-card/70"
                    >
                      Fazer login
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/register?next=${encodeURIComponent(invitePath)}`,
                        )
                      }
                      className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500"
                    >
                      Criar conta
                    </button>
                  </div>
                </div>
              )}

              {isAuthenticated && (
                <>
                  {inviteAlreadyLinked && !inviteLinkedToMe && (
                    <p className="text-[11px] text-amber-300">
                      Este convite já foi vinculado à conta de outra pessoa.
                      Peça ao organizador para gerar um novo convite para você.
                    </p>
                  )}

                  {confirmError && (
                    <p className="text-[11px] text-red-400">
                      {confirmError}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 items-center">
                    <button
                      type="button"
                      disabled={
                        confirming ||
                        loadingInvite ||
                        authLoading ||
                        !event ||
                        !participant ||
                        (inviteAlreadyLinked && !inviteLinkedToMe)
                      }
                      onClick={handleConfirm}
                      className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
                    >
                      {primaryButtonLabel}
                    </button>

                    <button
                      type="button"
                      onClick={() => router.push("/dashboard")}
                      className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold text-app hover:bg-card/70"
                    >
                      Ir para o painel
                    </button>
                  </div>

                  <p className="text-[10px] text-app0">
                    Após confirmar, este evento aparecerá no seu dashboard com
                    os mesmos limites de edição de um convidado.
                  </p>
                </>
              )}
            </div>
          )}
        </section>

        <footer className="pt-4 border-t border-[var(--border)] text-[11px] text-app0 flex flex-wrap items-center justify-between gap-2">
          <span className="break-all">
            Código do convite pós-pago:{" "}
            <span className="text-muted">
              {effectiveSlug || "(não informado)"}
            </span>
          </span>
          {sessionEmail && (
            <span className="text-muted">
              Logado como{" "}
              <span className="text-app font-semibold">{sessionEmail}</span>
            </span>
          )}
        </footer>
      </div>
    </div>
  );
}
