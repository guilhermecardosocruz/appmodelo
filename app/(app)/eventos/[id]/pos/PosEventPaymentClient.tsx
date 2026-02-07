"use client";

import { useState } from "react";

type Props = {
  eventId: string;
  participantId: string;
  amount: number | null;
};

type ApiResponse = {
  id?: string;
  status?: string;
  amount?: number;
  message?: string;
  error?: string;
};

export default function PosEventPaymentClient({
  eventId,
  participantId,
  amount,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(
    null,
  );

  const hasAmount = amount !== null && Number.isFinite(amount) && amount! > 0;

  async function handleCreatePayment() {
    if (!eventId) {
      setError("Evento não encontrado.");
      return;
    }
    if (!participantId) {
      setError("Participante não informado.");
      return;
    }
    if (!hasAmount) {
      setError("Nenhum valor em aberto para este participante.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccessMessage(null);

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

      const data = (await res.json().catch(() => null)) as ApiResponse | null;

      if (!res.ok) {
        setError(
          data?.error ??
            "Erro ao registrar pagamento. Tente novamente em instantes.",
        );
        return;
      }

      setSuccessMessage(
        data?.message ??
          "Pagamento registrado como pendente. Integração com Zoop será configurada em breve.",
      );
    } catch (err) {
      console.error("[PosEventPaymentClient] Erro ao criar pagamento:", err);
      setError("Erro inesperado ao registrar pagamento.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-app p-3">
      <span className="text-xs font-medium text-muted">
        Pagamento com Zoop (pré-estrutura)
      </span>

      {!participantId && (
        <p className="text-[11px] text-app0">
          Nenhum participante foi informado na URL. Volte para o racha e clique
          novamente no botão de pagamento.
        </p>
      )}

      {participantId && !hasAmount && (
        <p className="text-[11px] text-app0">
          Não há valor em aberto para este participante. Se o saldo estiver
          zerado ou positivo, nenhum pagamento é necessário.
        </p>
      )}

      {participantId && hasAmount && (
        <>
          <p className="text-[11px] text-app0">
            Ao clicar em &quot;Registrar pagamento&quot;, será criado um
            registro de pagamento pendente para este participante e este evento.
            Em seguida vamos conectar este fluxo à Zoop para gerar o checkout
            real (PIX/cartão).
          </p>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void handleCreatePayment()}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
            >
              {loading ? "Registrando..." : "Registrar pagamento (mock Zoop)"}
            </button>
          </div>
        </>
      )}

      {error && (
        <p className="text-[11px] text-red-500">
          {error}
        </p>
      )}

      {successMessage && (
        <p className="text-[11px] text-emerald-500">
          {successMessage}
        </p>
      )}
    </div>
  );
}
