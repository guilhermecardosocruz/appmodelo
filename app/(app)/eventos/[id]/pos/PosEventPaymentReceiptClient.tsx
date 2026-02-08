"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

type PostEventPaymentStatus = "PENDING" | "PAID" | "FAILED" | "CANCELLED";

type PaymentDetail = {
  id: string;
  eventId: string;
  participantId: string;
  amount: number;
  status: PostEventPaymentStatus;
  createdAt: string;
};

type ApiError = {
  error?: string;
};

export default function PosEventPaymentReceiptClient() {
  const params = useParams() as { id?: string };
  const searchParams = useSearchParams();
  const router = useRouter();

  const eventId = useMemo(
    () => String(params?.id ?? "").trim(),
    [params],
  );
  const participantId = useMemo(
    () => (searchParams?.get("participantId") ?? "").trim(),
    [searchParams],
  );

  const [payment, setPayment] = useState<PaymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!eventId || !participantId) {
        setError(
          "Não encontramos os dados do evento ou do participante para o comprovante.",
        );
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const res = await fetch(
          `/api/events/${encodeURIComponent(
            eventId,
          )}/post-payments?participantId=${encodeURIComponent(participantId)}`,
        );

        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as ApiError | null;
          if (!active) return;
          setError(
            data?.error ?? "Não foi possível carregar o comprovante.",
          );
          setPayment(null);
          return;
        }

        const data = (await res.json()) as { payment?: PaymentDetail };
        if (!active) return;

        if (!data.payment) {
          setError("Nenhum pagamento encontrado para este participante.");
          setPayment(null);
          return;
        }

        setPayment({
          ...data.payment,
          amount: Number(data.payment.amount),
        });
      } catch (err) {
        console.error(
          "[PosEventPaymentReceiptClient] Erro ao carregar comprovante:",
          err,
        );
        if (!active) return;
        setError("Erro inesperado ao carregar comprovante.");
        setPayment(null);
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [eventId, participantId]);

  const formattedAmount =
    payment != null ? `R$ ${payment.amount.toFixed(2)}` : "—";

  const formattedDateTime =
    payment != null
      ? new Date(payment.createdAt).toLocaleString("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
        })
      : "—";

  return (
    <div className="min-h-screen bg-app text-app flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
        <button
          type="button"
          onClick={() => router.push(`/eventos/${eventId}/pos`)}
          className="text-xs font-medium text-muted hover:text-app"
        >
          ← Voltar para o resumo
        </button>

        <span className="inline-flex items-center rounded-full bg-card px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted border border-[var(--border)]">
          Comprovante de pagamento
        </span>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-xl w-full mx-auto flex flex-col gap-4">
        <section className="rounded-2xl border border-[var(--border)] bg-card p-4 sm:p-6 flex flex-col gap-3">
          <h1 className="text-lg sm:text-xl font-semibold text-app">
            Detalhes do pagamento
          </h1>

          {loading && (
            <p className="text-sm text-muted">Carregando comprovante...</p>
          )}

          {error && !loading && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          {!loading && !error && payment && (
            <div className="space-y-2 text-sm text-app">
              <div className="flex justify-between">
                <span className="text-muted">Status</span>
                <span className="font-semibold">
                  {payment.status === "PAID"
                    ? "Pago"
                    : payment.status === "PENDING"
                    ? "Pendente"
                    : payment.status === "FAILED"
                    ? "Falhou"
                    : "Cancelado"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Valor pago</span>
                <span className="font-semibold">{formattedAmount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Data e hora</span>
                <span className="font-semibold">{formattedDateTime}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">ID interno</span>
                <span className="font-mono text-[11px]">
                  {payment.id}
                </span>
              </div>
            </div>
          )}

          <div className="pt-2">
            <Link
              href={`/eventos/${eventId}/pos`}
              className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-app px-4 py-2 text-sm font-semibold text-app hover:bg-card/70"
            >
              Voltar para o resumo do racha
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
