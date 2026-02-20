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
  ticketPrice?: string | null;
  paymentLink?: string | null;
  inviteSlug?: string | null;
};

type ConfirmationResponse = {
  id: string;
  name: string;
  createdAt: string;
  authenticated?: boolean;
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

export default function ConviteClient({ slug }: Props) {
  const params = useParams() as { slug?: string };
  const router = useRouter();
  const effectiveSlug = String(params?.slug ?? slug ?? "").trim();

  const [event, setEvent] = useState<Event | null>(null);
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [eventError, setEventError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionName, setSessionName] = useState<string | null>(null);

  const [authMode, setAuthMode] = useState<AuthMode>("register");

  useEffect(() => {
    let active = true;

    async function loadEvent() {
      try {
        setLoadingEvent(true);
        setEventError(null);
        setEvent(null);

        if (!effectiveSlug) {
          setEventError("Código de convite inválido.");
          return;
        }

        const res = await fetch(
          `/api/events/by-invite/${encodeURIComponent(effectiveSlug)}`,
          {
            credentials: "include",
          },
        );

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          if (!active) return;

          if (res.status === 404)
            setEventError("Nenhum evento encontrado para este convite.");
          else
            setEventError(
              data?.error ?? "Erro ao carregar informações do evento.",
            );
          return;
        }

        const data = (await res.json()) as Event;
        if (!active) return;
        setEvent(data);
      } catch (err) {
        console.error("[ConviteClient] Erro ao carregar evento:", err);
        if (!active) return;
        setEventError("Erro inesperado ao carregar informações do evento.");
      } finally {
        if (!active) return;
        setLoadingEvent(false);
      }
    }

    void loadEvent();
    return () => {
      active = false;
    };
  }, [effectiveSlug]);

  // Checa se já existe sessão para preencher nome/e-mail e esconder campos de conta
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
          return;
        }

        const data = (await res.json()) as MeResponse;
        if (!active) return;

        if (!data.authenticated) {
          setIsAuthenticated(false);
          setSessionName(null);
          return;
        }

        setIsAuthenticated(true);
        setSessionName(data.user.name);
        setName((prev) => (prev.trim().length ? prev : data.user.name));
        setEmail((prev) => (prev.trim().length ? prev : data.user.email));
      } catch (err) {
        console.error("[ConviteClient] Erro ao carregar sessão:", err);
        if (!active) return;
        setIsAuthenticated(false);
        setSessionName(null);
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

  const isPrePaid = event?.type === "PRE_PAGO";
  const checkoutSlug =
    event?.inviteSlug?.trim() || effectiveSlug || (event?.id ? event.id : "");
  const hasCheckout = !!(isPrePaid && checkoutSlug);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    setFormError(null);

    if (!trimmedName) {
      setFormError(
        "Por favor, digite o nome do participante para continuar.",
      );
      return;
    }

    if (!event?.id) {
      setFormError(
        "Ainda não foi possível identificar o evento deste convite. Tente novamente.",
      );
      return;
    }

    // Se não estiver autenticado, precisamos de e-mail/senha
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

      // 1) Se não estiver autenticado, faz registro ou login
      if (!isAuthenticated) {
        if (authMode === "register") {
          const resRegister = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              name: trimmedName,
              email: trimmedEmail,
              password,
              // alinhado com o registerSchema (como no GuestInviteClient)
              confirmPassword,
            }),
          });

          if (!resRegister.ok) {
            const data = await resRegister.json().catch(() => null);
            const msg: string =
              data?.message ??
              data?.errors?.email?.[0] ??
              data?.errors?.password?.[0] ??
              data?.errors?.confirmPassword?.[0] ??
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

      // 2) Fluxo depende do tipo de evento
      if (isPrePaid && hasCheckout) {
        // Evento pré-pago: NÃO confirmar aqui.
        // Vamos direto para o "pagamento" (checkout de teste),
        // levando o nome como query param.
        const params = new URLSearchParams();
        params.set("name", trimmedName);

        const basePath = `/checkout/${encodeURIComponent(checkoutSlug)}`;
        const href = params.toString()
          ? `${basePath}?${params.toString()}`
          : basePath;

        if (typeof window !== "undefined") {
          window.location.href = href;
        } else {
          router.push(href);
        }
        return;
      }

      // Eventos FREE / POS_PAGO continuam com o fluxo atual:
      // confirmar presença e ir para Meus ingressos.
      const resConfirm = await fetch(`/api/events/${event.id}/confirmados`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: trimmedName }),
      });

      if (!resConfirm.ok) {
        const data = await resConfirm.json().catch(() => null);
        const msg: string =
          data?.error ?? "Erro ao registrar a confirmação de presença.";
        setFormError(msg);
        return;
      }

      const created = (await resConfirm.json()) as ConfirmationResponse;
      const finalName = created.name || trimmedName;
      setName(finalName);

      if (typeof window !== "undefined") {
        window.location.href = "/ingressos";
      } else {
        router.push("/ingressos");
      }
    } catch (err) {
      console.error("[ConviteClient] Erro no fluxo de confirmação:", err);
      setFormError(
        "Erro inesperado ao confirmar presença. Tente novamente em instantes.",
      );
    } finally {
      setConfirming(false);
    }
  }

  const primaryButtonLabel = (() => {
    if (confirming) {
      if (event?.type === "PRE_PAGO") return "Indo para pagamento...";
      return "Confirmando...";
    }

    if (event?.type === "PRE_PAGO") {
      if (isAuthenticated) return "Ir para pagamento";
      if (authMode === "register")
        return "Criar conta e ir para pagamento";
      return "Entrar e ir para pagamento";
    }

    // FREE / POS_PAGO
    if (isAuthenticated) return "Confirmar presença e ir para Meus ingressos";
    if (authMode === "register")
      return "Confirmar presença e criar conta";
    return "Entrar e confirmar presença";
  })();

  const toggleAuthModeLabel =
    authMode === "register" ? "Já tenho conta" : "Quero criar conta";

  return (
    <div className="min-h-screen bg-app text-app">
      <div className="max-w-2xl mx-auto px-4 py-10 flex flex-col gap-8">
        <header className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Convite (link aberto)
          </p>

          <h1 className="text-2xl sm:text-3xl font-semibold text-app">
            {event ? event.name : "Convite para evento"}
          </h1>

          <p className="text-sm text-muted max-w-xl">
            {event?.type === "PRE_PAGO"
              ? "Confirme seus dados e siga para a tela de pagamento. Após o pagamento, o ingresso aparecerá em “Meus ingressos”, sempre com o mesmo padrão de PDF."
              : "Confirme a presença preenchendo os dados abaixo. O ingresso será salvo em “Meus ingressos”, sempre com o mesmo padrão de PDF."}
          </p>

          <SessionStatus />
        </header>

        <section className="rounded-2xl border border-[var(--border)] bg-card p-4 space-y-2">
          {loadingEvent && (
            <p className="text-xs text-muted">
              Carregando informações do evento...
            </p>
          )}
          {!loadingEvent && eventError && (
            <p className="text-xs text-red-400">{eventError}</p>
          )}

          {!loadingEvent && !eventError && event && (
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
                <span className="font-semibold text-app">Tipo:</span>{" "}
                {event.type === "FREE"
                  ? "Evento gratuito"
                  : event.type === "PRE_PAGO"
                  ? "Evento pré-pago"
                  : "Evento pós-pago"}
              </p>

              {event.ticketPrice && (
                <p>
                  <span className="font-semibold text-app">Valor:</span>{" "}
                  {event.ticketPrice}
                </p>
              )}

              {event.description && (
                <p className="pt-1">
                  <span className="font-semibold text-app">Descrição:</span>{" "}
                  {event.description}
                </p>
              )}

              {event.type === "PRE_PAGO" && (
                <p className="pt-2 text-[11px] text-amber-300">
                  Você será direcionado para uma tela de pagamento de teste.
                  Após simular o pagamento, o ingresso vai aparecer em
                  “Meus ingressos”.
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
            {event?.type === "PRE_PAGO"
              ? "Dados para pagamento"
              : "Confirmar presença"}
          </h2>

          {eventError && (
            <p className="text-xs text-red-400">
              Não é possível continuar: {eventError}
            </p>
          )}

          {!eventError && (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">
                  Nome do participante
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app placeholder:text-app0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  placeholder="Ex.: João Silva"
                />
                {sessionName && (
                  <p className="text-[10px] text-app0">
                    Você está logado como{" "}
                    <span className="font-semibold text-app">
                      {sessionName}
                    </span>
                    . Altere o nome acima se o ingresso for para outra pessoa.
                  </p>
                )}
              </div>

              {!isAuthenticated && (
                <>
                  {/* Toggle criar conta / já tenho conta ANTES dos campos */}
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
                    {authMode === "register"
                      ? "Depois de criar sua conta e seguir para o pagamento, o ingresso fica salvo em “Meus ingressos”."
                      : "Depois de entrar e seguir para o pagamento, o ingresso fica salvo em “Meos ingressos”."}
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
                    confirming || loadingEvent || authLoading || !event
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
        </footer>
      </div>
    </div>
  );
}
