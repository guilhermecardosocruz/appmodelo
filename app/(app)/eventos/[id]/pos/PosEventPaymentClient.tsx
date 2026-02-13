"use client";

import Link from "next/link";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useMemo } from "react";

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

  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

export default function PosEventPaymentClient() {
  const router = useRouter();
  const params = useParams() as { id?: string };
  const searchParams = useSearchParams();

  const eventId = useMemo(
    () => String(params?.id ?? "").trim(),
    [params],
  );

  const participantIdFromQuery = searchParams?.get("participantId") ?? "";
  const amountFromQuery = searchParams?.get("amount") ?? "";

  const participantId = useMemo(
    () => participantIdFromQuery.trim(),
    [participantIdFromQuery],
  );

  const rawAmount = useMemo(
    () => amountFromQuery.trim(),
    [amountFromQuery],
  );

  const amount = useMemo(() => normalizeAmount(rawAmount), [rawAmount]);

  const error = useMemo(() => {
    if (!eventId || !participantId) {
      return "Não recebemos os dados do evento ou do participante. Volte para o resumo do racha e tente novamente.";
    }

    if (amount === null) {
      return "Não recebemos um valor válido. Volte para o resumo do racha e tente novamente.";
    }

    return null;
  }, [eventId, participantId, amount]);

  const paymentDisabledMessage =
    "Pagamento temporariamente desativado. Estamos migrando para um novo fluxo sem provedores externos.";

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
              Esta tela será atualizada para o novo fluxo de pagamento.
            </p>
          </div>

          {error && <p className="text-[11px] text-red-500">{error}</p>}

          {!error && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">
                Valor a pagar
              </span>
              <span className="text-lg font-semibold text-app">
                {formattedAmount}
              </span>
              <p className="text-[11px] text-app0">
                Esse valor veio do resumo do racha, com base nas despesas e na
                sua participação.
              </p>
            </div>
          )}

          <div className="rounded-lg border border-amber-600 bg-amber-600/10 px-3 py-2 text-[11px] text-amber-500 space-y-1">
            <p className="font-semibold">Pagamento desativado</p>
            <p>{paymentDisabledMessage}</p>
          </div>

          <button
            type="button"
            disabled
            className="mt-1 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm opacity-60"
            title={paymentDisabledMessage}
          >
            Pagamento indisponível
          </button>

          <Link
            href={`/eventos/${eventId}/pos`}
            className="mt-1 inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-app px-4 py-2 text-sm font-semibold text-app hover:bg-card/70"
          >
            Ver resumo do racha
          </Link>

          {/* DEBUG TEMPORÁRIO */}
          <div className="mt-4 rounded-lg border border-dashed border-[var(--border)] bg-app p-2 text-[10px] text-app0">
            <div>Debug (temporário):</div>
            <pre className="whitespace-pre-wrap break-all">
              {JSON.stringify(
                {
                  eventId,
                  participantId,
                  rawAmount,
                  amount,
                },
                null,
                2,
              )}
            </pre>
          </div>
        </section>
      </main>
    </div>
  );
}
