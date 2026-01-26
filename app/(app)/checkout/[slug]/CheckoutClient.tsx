"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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

export default function CheckoutClient({ slug }: Props) {
  const params = useParams() as { slug?: string };
  const searchParams = useSearchParams();
  const router = useRouter();

  const effectiveSlug = String(params?.slug ?? slug ?? "").trim();
  const attendeeFromQuery = String(
    searchParams.get("name") ?? "",
  ).trim();

  const [event, setEvent] = useState<Event | null>(null);
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [eventError, setEventError] = useState<string | null>(null);

  const [attendeeName, setAttendeeName] = useState("");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionName, setSessionName] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  useEffect(() => {
    setAttendeeName(attendeeFromQuery);
  }, [attendeeFromQuery]);

  // Carrega evento pelo slug de convite
  useEffect(() => {
    let active = true;

    async function loadEvent() {
      try {
        setLoadingEvent(true);
        setEventError(null);
        setEvent(null);

        if (!effectiveSlug) {
          setEventError("Código de checkout inválido.");
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
            setEventError("Nenhum evento encontrado para este checkout.");
          else
            setEventError(
              data?.error ?? "Erro ao carregar informações do evento.",
            );
          return;
        }

        const data = (await res.json()) as Event;
        if (!active) return;

        if (data.type !== "PRE_PAGO") {
          setEventError(
            "Este checkout de teste é apenas para eventos pré-pagos.",
          );
        }

        setEvent(data);
      } catch (err) {
        console.error("[CheckoutClient] Erro ao carregar evento:", err);
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

  // Carrega sessão
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
        setAttendeeName((prev) =>
          prev.trim().length ? prev : data.user.name,
        );
      } catch (err) {
        console.error("[CheckoutClient] Erro ao carregar sessão:", err);
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

  const canPay =
    !loadingEvent &&
    !authLoading &&
    !paying &&
    !!event &&
    !eventError &&
    !!attendeeName.trim();

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    setPayError(null);

    if (!event?.id) {
      setPayError(
        "Ainda não foi possível identificar o evento. Tente novamente.",
      );
      return;
    }

    const trimmedName = attendeeName.trim();
    if (!trimmedName) {
      setPayError("Digite o nome do participante para continuar.");
      return;
    }

    try {
      setPaying(true);

      const res = await fetch(`/api/events/${event.id}/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ attendeeName: trimmedName }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg: string =
          data?.error ?? "Erro ao registrar o pagamento de teste.";
        setPayError(msg);
        return;
      }

      // Sucesso: vai para Meus ingressos
      if (typeof window !== "undefined") {
        window.location.href = "/ingressos";
      } else {
        router.push("/ingressos");
      }
    } catch (err) {
      console.error("[CheckoutClient] Erro no pagamento de teste:", err);
      setPayError(
        "Erro inesperado ao simular o pagamento. Tente novamente em instantes.",
      );
    } finally {
      setPaying(false);
    }
  }

  const primaryLabel = paying
    ? "Processando pagamento de teste..."
    : "Simular pagamento e gerar ingresso";

  const showAuthWarning = !authLoading && !isAuthenticated;

  return (
    <div className="min-h-screen bg-app text-app">
      <div className="max-w-2xl mx-auto px-4 py-10 flex flex-col gap-8">
        <header className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Checkout de teste
          </p>

          <h1 className="text-2xl sm:text-3xl font-semibold text-app">
            {event ? event.name : "Resumo do evento"}
          </h1>

          <p className="text-sm text-muted max-w-xl">
            Esta tela simula a experiência de pagamento do ingresso. Nenhuma
            cobrança real é feita. Ao finalizar, o ingresso é criado em “Meus
            ingressos”.
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
                {event.type === "PRE_PAGO"
                  ? "Evento pré-pago"
                  : event.type === "POS_PAGO"
                  ? "Evento pós-pago"
                  : "Evento gratuito"}
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
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-app">
            Dados do participante
          </h2>

          {showAuthWarning && (
            <p className="text-xs text-amber-300">
              Você ainda não está logado. Volte para o link de convite para
              criar sua conta ou entrar antes de tentar pagar. Se tentar pagar
              sem login, o servidor vai recusar a compra.
            </p>
          )}

          <form onSubmit={handlePay} className="space-y-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted">
                Nome do participante
              </label>
              <input
                value={attendeeName}
                onChange={(e) => setAttendeeName(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app placeholder:text-app0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                placeholder="Ex.: João Silva"
              />
              {sessionName && (
                <p className="text-[10px] text-app0">
                  Logado como{" "}
                  <span className="font-semibold text-app">
                    {sessionName}
                  </span>
                  {sessionEmail && (
                    <>
                      {" "}
                      (<span className="font-mono text-muted">
                        {sessionEmail}
                      </span>
                      )
                    </>
                  )}
                  . Altere o nome acima se o ingresso for para outra pessoa.
                </p>
              )}
            </div>

            {payError && (
              <p className="text-[11px] text-red-400">{payError}</p>
            )}

            <div className="flex flex-wrap gap-2 items-center">
              <button
                type="submit"
                disabled={!canPay}
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
              >
                {primaryLabel}
              </button>

              <button
                type="button"
                onClick={() => router.push("/ingressos")}
                className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold text-app hover:bg-card/70"
              >
                Ver meus ingressos
              </button>
            </div>

            <p className="text-[10px] text-app0">
              Este fluxo é apenas um teste de experiência. Em produção, esta
              tela faria a integração real com o provedor de pagamento.
            </p>
          </form>
        </section>
      </div>
    </div>
  );
}
