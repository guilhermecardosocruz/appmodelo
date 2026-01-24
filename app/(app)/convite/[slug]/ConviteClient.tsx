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

type Props = {
  slug: string;
};

type MeResponse =
  | {
      authenticated: false;
    }
  | {
      authenticated: true;
      user: {
        id: string;
        name: string;
        email: string;
      };
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

// mesma regra de complexidade da tela oficial:
// 8+ chars, com minúscula, MAIÚSCULA, número e símbolo
const strongPasswordRegex =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export default function ConviteClient({ slug }: Props) {
  const params = useParams() as { slug?: string };
  const router = useRouter();
  const effectiveSlug = String(params?.slug ?? slug ?? "").trim();

  const [event, setEvent] = useState<Event | null>(null);
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [eventError, setEventError] = useState<string | null>(null);

  // Autenticação
  const [authLoading, setAuthLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [authUserName, setAuthUserName] = useState<string | null>(null);

  // Formulário
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

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

  // Checa sessão do usuário
  useEffect(() => {
    let active = true;

    async function loadMe() {
      try {
        setAuthLoading(true);

        const res = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });

        if (!active) return;

        if (!res.ok) {
          setAuthenticated(false);
          setAuthUserName(null);
          return;
        }

        const data = (await res.json()) as MeResponse;

        if (!data.authenticated) {
          setAuthenticated(false);
          setAuthUserName(null);
          return;
        }

        const loadedName = data.user.name ?? "";
        setAuthenticated(true);
        setAuthUserName(loadedName);

        // Preenche o campo de nome se ainda estiver vazio
        setName((prev) => (prev.trim() ? prev : loadedName));
      } catch (err) {
        console.error("[ConviteClient] Erro ao carregar sessão:", err);
        if (!active) return;
        setAuthenticated(false);
        setAuthUserName(null);
      } finally {
        if (!active) return;
        setAuthLoading(false);
      }
    }

    void loadMe();

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

  async function confirmPresence(attendeeName: string) {
    if (!event?.id) {
      setFormError(
        "Ainda não foi possível identificar o evento deste convite. Tente novamente.",
      );
    return;
    }

    const trimmed = attendeeName.trim();
    if (!trimmed) {
      setFormError("Não foi possível determinar o nome do participante.");
      return;
    }

    const res = await fetch(`/api/events/${event.id}/confirmados`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
      credentials: "include",
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setFormError(
        data?.error ?? "Erro ao registrar a confirmação de presença.",
      );
      return;
    }

    // Sucesso: redireciona para Meus ingressos
    router.push("/ingressos");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!event?.id) {
      setFormError(
        "Ainda não foi possível identificar o evento deste convite. Tente novamente.",
      );
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError("Por favor, digite o nome do participante.");
      return;
    }

    try {
      setConfirming(true);
      setFormError(null);

      if (authenticated) {
        // Logado → usa o nome que está no campo (pode ser do filho, esposa, etc)
        await confirmPresence(trimmedName);
        return;
      }

      // Não logado → precisa de e-mail e senha (com confirmação)
      const trimmedEmail = email.trim();
      const trimmedPassword = password.trim();
      const trimmedConfirm = confirmPassword.trim();

      if (!trimmedEmail) {
        setFormError("Por favor, digite um e-mail válido.");
        return;
      }

      if (!trimmedPassword) {
        setFormError(
          "Por favor, defina uma senha para acessar seus ingressos.",
        );
        return;
      }

      if (!strongPasswordRegex.test(trimmedPassword)) {
        setFormError(
          "A senha deve ter pelo menos 8 caracteres, com maiúsculas, minúsculas, número e símbolo.",
        );
        return;
      }

      if (!trimmedConfirm) {
        setFormError("Por favor, confirme a senha.");
        return;
      }

      if (trimmedPassword !== trimmedConfirm) {
        setFormError("As senhas não conferem. Verifique e tente novamente.");
        return;
      }

      // 1) Tenta registrar
      const registerRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          password: trimmedPassword,
          confirmPassword: trimmedConfirm, // ok mesmo se o schema ignorar
        }),
      });

      if (!registerRes.ok) {
        const regData = (await registerRes.json().catch(() => null)) as
          | { message?: string; errors?: Record<string, string[]> }
          | null;

        const regMessage = regData?.message ?? "";
        const errors = regData?.errors;

        const emailAlreadyUsed =
          typeof regMessage === "string" &&
          regMessage.toLowerCase().includes("já cadastrado");

        if (!emailAlreadyUsed) {
          // Erros de validação (Zod) → monta mensagem amigável
          if (errors && typeof errors === "object") {
            const messages: string[] = [];
            for (const key of Object.keys(errors)) {
              const fieldMessages = errors[key];
              if (Array.isArray(fieldMessages)) {
                for (const msg of fieldMessages) {
                  if (typeof msg === "string" && msg.trim()) {
                    messages.push(msg.trim());
                  }
                }
              }
            }
            if (messages.length > 0) {
              setFormError(messages.join(" "));
              return;
            }
          }

          // Qualquer outro erro genérico de cadastro
          setFormError(regMessage || "Erro ao criar sua conta.");
          return;
        }

        // 2) E-mail já cadastrado → tenta login com as credenciais informadas
        const loginRes = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            email: trimmedEmail,
            password: trimmedPassword,
          }),
        });

        if (!loginRes.ok) {
          const loginData = (await loginRes.json().catch(() => null)) as
            | { message?: string; errors?: unknown }
            | null;

          setFormError(
            loginData?.message ??
              "Não foi possível entrar com este e-mail e senha. Você pode tentar pela tela de login.",
          );
          return;
        }

        // Login OK
        setAuthenticated(true);
      } else {
        // Registro OK
        const regJson = (await registerRes.json().catch(() => null)) as
          | { user?: { name?: string } }
          | null;
        const userName = regJson?.user?.name ?? trimmedName;

        setAuthenticated(true);
        setAuthUserName(userName);
      }

      // Agora logado, confirma presença usando o nome do campo
      await confirmPresence(trimmedName);
    } catch (err) {
      console.error("[ConviteClient] Erro ao confirmar presença:", err);
      setFormError(
        "Erro inesperado ao processar sua confirmação. Tente novamente.",
      );
    } finally {
      setConfirming(false);
    }
  }

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
            Confirme sua presença e nós vamos conectar o ingresso à sua conta.
            Assim, você encontra tudo depois em “Meus ingressos”.
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

              {event.description && (
                <p className="pt-1">
                  <span className="font-semibold text-app">Descrição:</span>{" "}
                  {event.description}
                </p>
              )}

              {event.type !== "FREE" && (
                <p className="pt-2 text-[11px] text-amber-300">
                  Observação: este link aberto é focado em confirmação. Ingressos
                  aparecem em “Meus ingressos” para eventos FREE (logado) e para
                  compras (pré/pós).
                </p>
              )}

              {hasCheckout && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() =>
                      router.push(
                        `/checkout/${encodeURIComponent(checkoutSlug)}`,
                      )
                    }
                    className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-500"
                  >
                    Ir para checkout
                  </button>
                </div>
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

          {eventError && (
            <p className="text-xs text-red-400">
              Não é possível confirmar presença: {eventError}
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
              </div>

              {!authenticated && (
                <>
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
                      placeholder="Crie uma senha forte"
                    />
                    <p className="text-[10px] text-app0">
                      Use pelo menos 8 caracteres, com maiúsculas, minúsculas,
                      número e símbolo.
                    </p>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted">
                      Confirmar senha
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app placeholder:text-app0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                      placeholder="Repita a senha"
                    />
                  </div>

                  <p className="text-[10px] text-app0">
                    Vamos criar sua conta (ou entrar, se você já tiver uma).
                    Depois do login, o ingresso fica salvo em “Meus ingressos”.
                  </p>
                </>
              )}

              {authenticated && (
                <div className="rounded-xl border border-[var(--border)] bg-card p-3">
                  <p className="text-[11px] text-muted">
                    Você está logado como{" "}
                    <span className="font-semibold text-app">
                      {authUserName ?? "participante"}
                    </span>
                    . Se quiser, altere o nome do participante acima (por
                    exemplo, para filho(a) ou acompanhante). O ingresso ficará
                    disponível em “Meus ingressos”.
                  </p>
                </div>
              )}

              {formError && (
                <p className="text-[11px] text-red-400">{formError}</p>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={confirming || loadingEvent || !event}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
                >
                  {confirming
                    ? "Confirmando..."
                    : "Confirmar presença e ir para Meus ingressos"}
                </button>

                <button
                  type="button"
                  onClick={() => router.push("/ingressos")}
                  className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold text-app hover:bg-card/70"
                >
                  Já tenho ingressos
                </button>
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
