"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type PostEventPaymentStatus = "PENDING" | "PAID" | "FAILED" | "CANCELLED";

type ApiError = {
  error?: string;
};

type Props = {
  eventId: string;
  participantIdParam?: string;
  amountParam?: string;
};

type PaymentResponse = {
  id: string;
  status: PostEventPaymentStatus;
  amount: number;
};

function normalizeAmount(raw: string | undefined | null): number | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Se vier no formato brasileiro (ex.: 12,34 ou 1.234,56)
  if (trimmed.includes(",") && !trimmed.includes(".")) {
    const normalized = trimmed.replace(/\./g, "").replace(",", ".");
    const value = Number(normalized);
    if (!Number.isFinite(value) || value <= 0) return null;
    return value;
  }

  // Formato padrão (toFixed(2) → "12.34")
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

export default function PosEventPaymentClient({
  eventId,
  participantIdParam,
  amountParam,
}: Props) {
  const router = useRouter();

  const participantId = useMemo(
    () => (participantIdParam ?? "").trim(),
    [participantIdParam],
  );

  const rawAmount = useMemo(
    () => (amountParam ?? "").trim(),
    [amountParam],
  );

  const amount = useMemo(() => normalizeAmount(rawAmount), [rawAmount]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [payment, setPayment] = useState<PaymentResponse | null>(null);

  useEffect(() => {
    // validação inicial dos parâmetros
    if (!eventId || !participantId) {
      setError(
        "Não recebemos os dados do evento ou do participante. Volte para o resumo do racha e tente novamente.",
      );
      return;
    }

    if (amount === null) {
      setError(
        "Não recebemos um valor válido para pagamento. Volte para o resumo do racha e tente novamente.",
      );
      return;
    }

    setError(null);
  }, [eventId, participantId, amount]);

  async function handlePay() {
    if (!eventId || !participantId || amount === null) {
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
            amount,
          }),
        },
      );

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as ApiError | null;
        setError(
          data?.error ?? "Erro ao iniciar o pagamento. Tente novamente em instantes.",
        );
        return;
      }

      const data = (await res.json().catch(() => null)) as
        | { payment?: PaymentResponse }
        | null;

      if (data?.payment) {
        setPayment({
          ...data.payment,
          amount: Number(data.payment.amount),
        });
      }

      setSuccess(true);
    } catch (err) {
      console.error("[PosEventPaymentClient] Erro ao pagar:", err);
      setError(
        "Erro inesperado ao iniciar o pagamento. Verifique sua conexão e tente novamente.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const formattedAmount =
    amount !== null ? `R$ ${amount.toFixed(2)}` : "—";

  return (
    <div className="min-h-screen bg-app text-app flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
        <button
          type="button"
          onClick={() => router.push(`/eventos/${eventId}/pos`)}
          className="text-xs font-medium text-muted hover:text-app"
        >
          ← Voltar para o racha
        </button>

        <span className="inline-flex items-center rounded-full bg-card px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted border border-[var(--border)]">
          Pagamento do racha
        </span>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-xl w-full mx-auto flex flex-col gap-4">
        <section className="rounded-2xl border border-[var(--border)] bg-card p-4 sm:p-6 flex flex-col gap-3">
          <div className="space-y-1">
            <h1 className="text-lg sm:text-xl font-semibold text-app">
              Finalizar pagamento
            </h1>
            <p className="text-sm text-muted">
              Aqui você paga o valor que ficou devendo no acerto do racha.
            </p>
          </div>

          {error && (
            <p className="text-[11px] text-red-500">{error}</p>
          )}

          {!error && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">
                Valor a pagar
              </span>
              <span className="text-lg font-semibold text-app">
                {formattedAmount}
              </span>
              <p className="text-[11px] text-app0">
                Esse valor veio do resumo do racha, com base nas despesas
                lançadas e na sua participação.
              </p>
            </div>
          )}

          <p className="text-[11px] text-app0">
            Nesta primeira versão estamos usando um fluxo de teste com a Zoop.
            Em breve, você poderá pagar com Pix ou cartão direto por aqui.
          </p>

          {success && (
            <div className="rounded-lg border border-emerald-600 bg-emerald-600/10 px-3 py-2 text-[11px] text-emerald-500">
              Pagamento simulado com sucesso!{" "}
              {payment && (
                <>
                  (Status: <span className="font-semibold">{payment.status}</span>)
                </>
              )}
            </div>
          )}

          <button
            type="button"
            disabled={!!error || submitting || amount === null}
            onClick={() => void handlePay()}
            className="mt-1 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
          >
            {submitting ? "Processando..." : "Pagar com Zoop (mock)"}
          </button>

          <Link
            href={`/eventos/${eventId}/pos`}
            className="mt-1 inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-app px-4 py-2 text-sm font-semibold text-app hover:bg-card/70"
          >
            Ver resumo do racha
          </Link>
        </section>
      </main>
    </div>
  );
}
