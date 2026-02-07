"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

type SummaryItem = {
  participantId: string;
  name: string;
  totalPaid: number;
  totalShare: number;
  balance: number;
  isCurrentUser?: boolean;
};

type SummaryResponse = {
  eventId?: string;
  participants?: { id: string; name: string }[];
  balances?: SummaryItem[];
};

type ApiError = {
  error?: string;
};

export default function PosEventPaymentPage() {
  const params = useParams() as { id?: string };
  const searchParams = useSearchParams();

  const eventId = String(params?.id ?? "").trim();
  const participantId = (searchParams.get("participantId") ?? "").trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaryItem, setSummaryItem] = useState<SummaryItem | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!eventId) {
        setError("Evento não encontrado.");
        setLoading(false);
        return;
      }

      if (!participantId) {
        setError(
          "Participante não informado. Volte para o racha e tente novamente.",
        );
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const res = await fetch(
          `/api/events/${encodeURIComponent(eventId)}/post-summary`,
        );

        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as
            | ApiError
            | null;
          if (!active) return;
          setError(
            data?.error ??
              "Erro ao carregar o resumo do racha. Tente novamente mais tarde.",
          );
          setSummaryItem(null);
          return;
        }

        const data = (await res.json()) as SummaryResponse;
        if (!active) return;

        const balances = data.balances ?? [];
        const item = balances.find(
          (b) => b.participantId === participantId,
        );

        if (!item) {
          setError(
            "Não foi possível localizar este participante no resumo do racha. Talvez o link esteja incorreto ou você tenha sido removido do evento.",
          );
          setSummaryItem(null);
          return;
        }

        setSummaryItem({
          ...item,
          totalPaid: Number(item.totalPaid),
          totalShare: Number(item.totalShare),
          balance: Number(item.balance),
          isCurrentUser: !!item.isCurrentUser,
        });
      } catch (err) {
        console.error(
          "[PosEventPaymentPage] Erro ao carregar resumo para pagamento:",
          err,
        );
        if (!active) return;
        setError(
          "Erro inesperado ao carregar os dados de pagamento. Tente novamente mais tarde.",
        );
        setSummaryItem(null);
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

  const hasDebt =
    !!summaryItem && Number.isFinite(summaryItem.balance) && summaryItem.balance < 0;
  const amountToPay = hasDebt ? Math.abs(summaryItem.balance) : 0;

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
            Pagamento do seu acerto
          </h1>

          <p className="text-sm text-muted">
            Esta tela mostra quanto você ficou devendo no racha e será o ponto de
            partida para o fluxo de pagamento integrado (Zoop, PIX, cartão, etc.).
          </p>

          {loading && (
            <p className="text-sm text-muted">Carregando informações...</p>
          )}

          {!loading && error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          {!loading && !error && summaryItem && (
            <div className="mt-2 space-y-2">
              <p className="text-sm text-app">
                Participante:{" "}
                <span className="font-semibold">
                  {summaryItem.name}
                </span>
              </p>

              {hasDebt ? (
                <p className="text-sm text-app">
                  Valor que você precisa pagar neste racha:{" "}
                  <span className="font-semibold">
                    R$ {amountToPay.toFixed(2)}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-emerald-500 font-semibold">
                  Você está em dia neste racha. Nenhum valor pendente para
                  pagamento. 🎉
                </p>
              )}

              <p className="text-[11px] text-app0">
                Este valor é calculado automaticamente com base em tudo o que
                você pagou e em tudo o que deveria pagar, considerando apenas os
                participantes ativos na divisão.
              </p>
            </div>
          )}

          <div className="mt-4 space-y-2">
            <p className="text-[11px] text-app0">
              Como esta página vai funcionar nas próximas etapas:
            </p>

            <ul className="list-disc list-inside text-[11px] text-app0 space-y-1">
              <li>
                Buscar automaticamente o valor do seu saldo no racha (isso já
                está funcionando agora).
              </li>
              <li>
                Permitir escolher a forma de pagamento (PIX, cartão, carteira
                digital, etc.) integrada a um provedor como Zoop.
              </li>
              <li>
                Após o pagamento aprovado, marcar sua dívida como quitada no
                resumo do racha.
              </li>
            </ul>

            <p className="text-[11px] text-app0">
              Por enquanto, esta é uma versão de rascunho conectada ao cálculo real
              do racha, mas ainda sem o provedor de pagamento integrado.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
