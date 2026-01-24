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

type Guest = {
  id: string;
  name: string;
  slug: string;
  confirmedAt?: string | null;
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

type AuthMode = "register" | "login";

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

export default function GuestInviteClient({ slug }: Props) {
  const params = useParams() as { slug?: string };
  const router = useRouter();
  const effectiveSlug = String(params?.slug ?? slug ?? "").trim();

  const [event, setEvent] = useState<Event | null>(null);
  const [guest, setGuest] = useState<Guest | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionName, setSessionName] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const [authMode, setAuthMode] = useState<AuthMode>("register");

  useEffect(() => {
    let active = true;

    async function loadInvite() {
      try {
        setLoadingInvite(true);
        setInviteError(null);
        setEvent(null);
        setGuest(null);

        if (!effectiveSlug) {
          setInviteError("Código de convite inválido.");
          return;
        }

        const res = await fetch(
          `/api/events/guests/${encodeURIComponent(effectiveSlug)}`,
          {
            credentials: "include",
          },
        );

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          if (!active) return;

          if (res.status === 404)
            setInviteError(
              "Nenhum convite individual encontrado para este código.",
            );
          else
            setInviteError(
              data?.error ?? "Erro ao carregar informações do convite.",
            );
          return;
        }

        const data = (await res.json()) as {
          event?: Event;
          guest?: Guest;
        };

        if (!active) return;

        if (!data.event || !data.guest) {
          setInviteError("Convite inválido ou incompleto.");
          return;
        }

        setEvent(data.event);
        setGuest(data.guest);
      } catch (err) {
        console.error("[GuestInviteClient] Erro ao carregar convite:", err);
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

  // Checa sessão (igual ao ConviteClient)
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
          return;
        }

        const data = (await res.json()) as MeResponse;
        if (!active) return;

        if (!data.authenticated) {
          setIsAuthenticated(false);
          setSessionName(null);
          setSessionEmail(null);
          return;
        }

        setIsAuthenticated(true);
        setSessionName(data.user.name);
        setSessionEmail(data.user.email);
        setEmail((prev) => (prev.trim().length ? prev : data.user.email));
      } catch (err) {
        console.error("[GuestInviteClient] Erro ao carregar sessão:", err);
        if (!active) return;
        setIsAuthenticated(false);
        setSessionName(null);
        setSessionEmail(null);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!event || !guest) {
      setFormError("Convite ainda não foi carregado. Tente novamente.");
      return;
    }

    const trimmedEmail = email.trim();

    // Se não estiver autenticado, precisamos do fluxo de conta
    if (!isAuthenticated) {
      if (!trimmedEmail) {
        setFormError("Digite um e-mail para criar sua conta ou fazer login.");
        return;
      }
      if (!password) {
        setFormError("Digite uma senha.");
        return;
      }
      if (authMode === "register") {
        if (!confirmPassword) {
          setFormError("Confirme a senha.");
          return;
        }
        if (password !== confirmPassword) {
          setFormError("As senhas não coincidem.");
          return;
        }
      }
    }

    try {
      setConfirming(true);

      // 1) Registro ou login, se necessário
      if (!isAuthenticated) {
        if (authMode === "register") {
          const resRegister = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              name: guest.name, // usamos o nome do convidado
              email: trimmedEmail,
              password,
            }),
          });

          if (!resRegister.ok) {
            const data = await resRegister.json().catch(() => null);
            const msg: string =
              data?.message ??
              data?.errors?.email?.[0] ??
              data?.errors?.password?.[0] ??
              "Erro ao criar sua conta.";
            setFormError(msg);
            return;
          }
        } else {
          const resLogin = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              email: trimmedEmail,
              password,
            }),
          });

          if (!resLogin.ok) {
            const data = await resLogin.json().catch(() => null);
            const msg: string =
              data?.message ??
              data?.errors?.email?.[0] ??
              "Não foi possível fazer login. Verifique e-mail e senha.";
            setFormError(msg);
            return;
          }
        }
      }

      // 2) Confirmar o convite individual (cria ticket + marca convidado)
      const resConfirm = await fetch(
        `/api/events/guests/${encodeURIComponent(effectiveSlug)}`,
        {
          method: "POST",
          credentials: "include",
        },
      );

      if (!resConfirm.ok) {
        const data = await resConfirm.json().catch(() => null);
        const msg: string =
          data?.error ??
          "Erro ao confirmar presença para este convite individual.";
        setFormError(msg);
        return;
      }

      // 3) Redireciona para Meus ingressos com reload completo
      if (typeof window !== "undefined") {
        window.location.href = "/ingressos";
      } else {
        router.push("/ingressos");
      }
    } catch (err) {
      console.error("[GuestInviteClient] Erro no fluxo de confirmação:", err);
      setFormError(
        "Erro inesperado ao confirmar presença. Tente novamente em instantes.",
      );
    } finally {
      setConfirming(false);
    }
  }

  const primaryButtonLabel = (() => {
    if (confirming) return "Confirmando...";
    if (isAuthenticated) return "Confirmar presença e ir para Meus ingressos";
    if (authMode === "register") return "Confirmar presença e criar conta";
    return "Entrar e confirmar presença";
  })();

  const toggleAuthModeLabel =
    authMode === "register" ? "Já tenho conta" : "Quero criar conta";

  return (
    <div className="min-h-screen bg-app text-app">
      <div className="max-w-2xl mx-auto px-4 py-10 flex flex-col gap-8">
        <header className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Convite individual
          </p>

          <h1 className="text-2xl sm:text-3xl font-semibold text-app">
            {event ? event.name : "Convite para evento"}
          </h1>

          <p className="text-sm text-muted max-w-xl">
            Este convite é exclusivo para{" "}
            <span className="font-semibold text-app">
              {guest?.name ?? "o convidado"}
            </span>
            . Ao confirmar presença, o ingresso será salvo em “Meus ingressos”
            com o mesmo padrão de PDF.
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

          {!loadingInvite && !inviteError && event && guest && (
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
                <span className="font-semibold text-app">Convidado:</span>{" "}
                {guest.name}
              </p>

              {guest.confirmedAt && (
                <p className="pt-1 text-emerald-300">
                  Este convite já foi confirmado anteriormente em{" "}
                  {formatDate(guest.confirmedAt) ?? guest.confirmedAt}.
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
          <h2 className="text-sm font-semibold text-app">Confirmar presença</h2>

          {inviteError && (
            <p className="text-xs text-red-400">
              Não é possível confirmar presença: {inviteError}
            </p>
          )}

          {!inviteError && (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">
                  Convidado
                </label>
                <input
                  value={guest?.name ?? ""}
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
                      {guest?.name ?? "o convidado"}
                    </span>
                    .
                  </p>
                )}
              </div>

              {!isAuthenticated && (
                <>
                  {/* Toggle antes dos campos, igual ao link aberto */}
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card/60 border border-[var(--border)] px-3 py-2">
                    <p className="text-[10px] text-app0 max-w-xs">
                      {authMode === "register"
                        ? "Vamos criar sua conta rapidamente. Se você já tiver conta, troque para “Já tenho conta”."
                        : "Use seu e-mail e senha já cadastrados para entrar e salvar o ingresso em “Meus ingressos”."}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode((prev) =>
                          prev === "register" ? "login" : "register",
                        );
                        setFormError(null);
                      }}
                      className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-app hover:bg-card/80"
                    >
                      {toggleAuthModeLabel}
                    </button>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted">
                      E-mail
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app placeholder:text-app0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                      placeholder="voce@exemplo.com"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted">
                      Senha
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app placeholder:text-app0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                      placeholder="Sua senha"
                    />
                  </div>

                  {authMode === "register" && (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-muted">
                        Confirmar senha
                      </label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) =>
                          setConfirmPassword(e.target.value)
                        }
                        className="rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app placeholder:text-app0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                        placeholder="Repita a senha"
                      />
                    </div>
                  )}

                  <p className="text-[10px] text-app0">
                    Depois de criar sua conta ou entrar e confirmar presença, o
                    ingresso deste convite será salvo em “Meus ingressos”.
                  </p>
                </>
              )}

              {formError && (
                <p className="text-[11px] text-red-400">{formError}</p>
              )}

              <div className="flex flex-wrap gap-2 items-center">
                <button
                  type="submit"
                  disabled={
                    confirming || loadingInvite || authLoading || !event || !guest
                  }
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
                >
                  {primaryButtonLabel}
                </button>

                {isAuthenticated ? (
                  <button
                    type="button"
                    onClick={() => router.push("/ingressos")}
                    className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold text-app hover:bg-card/70"
                  >
                    Ver meus ingressos
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => router.push("/login?next=/ingressos")}
                    className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold text-app hover:bg-card/70"
                  >
                    Ir para tela de login
                  </button>
                )}
              </div>

              <p className="text-[10px] text-app0">
                Seu ingresso será sempre gerado no mesmo padrão de PDF de “Meus
                ingressos”, com um único QR Code por ticket.
              </p>
            </form>
          )}
        </section>

        <footer className="pt-4 border-t border-[var(--border)] text-[11px] text-app0 flex flex-wrap items-center justify-between gap-2">
          <span className="break-all">
            Código do convite:{" "}
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
