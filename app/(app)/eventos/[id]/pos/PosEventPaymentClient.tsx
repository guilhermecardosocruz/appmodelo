"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Event = {
  id: string;
  name: string;
};

type Participant = {
  id: string;
  name: string;
  isActive?: boolean;
};

type ApiError = { error?: string };

type Props = {
  eventId: string;
  participantId?: string;
  amountRaw?: string;
};

export default function PosEventPaymentClient({
  eventId,
  participantId: participantIdProp,
  amountRaw,
}: Props) {
  const [event, setEvent] = useState<Event | null>(null);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [loadingEvent, setLoadingEvent] = useState(false);
  const [loadingParticipant, setLoadingParticipant] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const participantId = (participantIdProp ?? "").trim();

  const amountNumber = useMemo(() => {
    if (!amountRaw) return NaN;
    const normalized = amountRaw.replace(".", "").replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : NaN;
  }, [amountRaw]);

  const hasValidAmount = Number.isFinite(amountNumber) && amountNumber > 0;
  const formattedAmount = hasValidAmount ? amountNumber.toFixed(2) : null;

  // Carrega informações do evento
  useEffect(() => {
    if (!eventId) return;

    let active = true;
    async function loadEvent() {
      try {
        setLoadingEvent(true);
        setError(null);
        const res = await fetch(`/api/events/${encodeURIComponent(eventId)}`);
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as ApiError | null;
          if (!active) return;
          setError(data?.error ?? "Erro ao carregar evento.");
          setEvent(null);
          return;
        }
        const data = (await res.json()) as Event;
        if (!active) return;
        setEvent(data);
      } catch (err) {
        console.error("[PosEventPaymentClient] Erro ao carregar evento:", err);
        if (!active) return;
        setError("Erro inesperado ao carregar evento.");
        setEvent(null);
      } finally {
        if (!active) return;
        setLoadingEvent(false);
      }
    }

    void loadEvent();

    return () => {
      active = false;
    };
  }, [eventId]);

  // Carrega o participante a partir da lista de post-participants
  useEffect(() => {
    if (!eventId || !participantId) return;

    let active = true;
    async function loadParticipant() {
      try {
        setLoadingParticipant(true);
        const res = await fetch(
          `/api/events/${encodeURIComponent(eventId)}/post-participants`,
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as ApiError | null;
          if (!active) return;
          setError(
            data?.error ?? "Erro ao carregar participantes do racha.",
          );
          setParticipant(null);
          return;
        }
        const data = (await res.json()) as { participants?: Participant[] };
        if (!active) return;
        const found =
          data.participants?.find((p) => p.id === participantId) ?? null;
        setParticipant(found);
        if (!found) {
          setError(
            "Não encontramos essa pessoa na divisão do racha. Peça para o organizador conferir a lista de participantes.",
          );
        }
      } catch (err) {
        console.error(
          "[PosEventPaymentClient] Erro ao carregar participante:",
          err,
        );
        if (!active) return;
        setError("Erro inesperado ao carregar participante.");
        setParticipant(null);
      } finally {
        if (!active) return;
        setLoadingParticipant(false);
      }
    }

    void loadParticipant();

    return () => {
      active = false;
    };
  }, [eventId, participantId]);

  async function handlePay() {
    if (!eventId) {
      setError("Evento não encontrado.");
      return;
    }
    if (!participantId) {
      setError("Identificador do participante não informado.");
      return;
    }
    if (!hasValidAmount || !formattedAmount) {
      setError("Valor de pagamento inválido.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const res = await fetch(
        `/api/events/${encodeURIComponent(eventId)}/post-payments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            participantId,
            amount: Number(formattedAmount),
          }),
        },
      );

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as ApiError | null;
        setError(data?.error ?? "Erro ao iniciar pagamento.");
        return;
      }

      const data = (await res.json()) as {
        redirectUrl?: string;
      };

      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        alert(
          "Pagamento criado (mock). Em uma próxima versão você será redirecionado para o checkout da Zoop.",
        );
      }
    } catch (err) {
      console.error("[PosEventPaymentClient] Erro ao iniciar pagamento:", err);
      setError("Erro inesperado ao iniciar pagamento.");
    } finally {
      setSubmitting(false);
    }
  }

  const disabled =
    !eventId || !participantId || !hasValidAmount || submitting;

  return (
    <div className="min-h-screen bg-app text-app flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
        <Link
          href={`/eventos/${eventId}/pos`}
          className="text-xs font-medium text-muted hover:text-app"
        >
          ← Voltar para o racha
        </Link>

        <span className="inline-flex items-center rounded-full bg-card px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted border border-[var(--border)]">
          Pagamento do racha
        </span>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-2xl w-full mx-auto flex flex-col gap-4">
        <section className="rounded-2xl border border-[var(--border)] bg-card p-4 sm:p-6 space-y-3">
          <h1 className="text-lg sm:text-xl font-semibold text-app">
            Finalizar pagamento
          </h1>

          <p className="text-sm text-muted">
            Aqui você paga o valor que ficou devendo no acerto do racha.
          </p>

          {(loadingEvent || loadingParticipant) && (
            <p className="text-[11px] text-muted">
              Carregando informações do racha...
            </p>
          )}

          {event && (
            <p className="text-sm text-app">
              <span className="text-app0 text-[11px] uppercase tracking-wide">
                Evento
              </span>
              <br />
              <span className="font-semibold">{event.name}</span>
            </p>
          )}

          {participant && (
            <p className="text-sm text-app">
              <span className="text-app0 text-[11px] uppercase tracking-wide">
                Você está pagando como
              </span>
              <br />
              <span className="font-semibold">{participant.name}</span>
            </p>
          )}

          {hasValidAmount && formattedAmount && (
            <p className="text-sm text-app">
              <span className="text-app0 text-[11px] uppercase tracking-wide">
                Valor a pagar
              </span>
              <br />
              <span className="text-2xl font-bold">R$ {formattedAmount}</span>
            </p>
          )}

          {!hasValidAmount && (
            <p className="text-[11px] text-red-500">
              Não recebemos um valor válido para pagamento. Volte para o resumo
              do racha e tente novamente.
            </p>
          )}

          <p className="text-[11px] text-app0">
            Nesta primeira versão estamos usando um fluxo de teste com a Zoop.
            Em breve, você poderá pagar com Pix ou cartão direto por aqui.
          </p>

          {error && <p className="text-[11px] text-red-500">{error}</p>}

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <button
              type="button"
              onClick={() => void handlePay()}
              disabled={disabled}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
            >
              {submitting ? "Iniciando pagamento..." : "Pagar com Zoop (mock)"}
            </button>

            <Link
              href={`/eventos/${eventId}/pos`}
              className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold text-app hover:bg-card/70"
            >
              Ver resumo do racha
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
