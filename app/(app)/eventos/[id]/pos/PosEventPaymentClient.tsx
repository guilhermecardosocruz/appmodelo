"use client";

import Link from "next/link";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { buildPixCopiaECola } from "@/lib/pix";

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

type TransferLine = {
  toParticipantId: string;
  toName: string;
  toUserId: string | null;
  toPixKey: string | null;
  amount: number;
  description: string;
};

type DetailsResponse =
  | {
      eventId: string;
      eventName: string;
      participantId: string;
      participantName: string;
      totalDue: number;
      alreadyPaid: number;
      remainingToPay: number;
      transfers: TransferLine[];
      missingPixRecipients: { toParticipantId: string; toName: string }[];
    }
  | { error: string };

export default function PosEventPaymentClient() {
  const router = useRouter();
  const params = useParams() as { id?: string };
  const searchParams = useSearchParams();

  const eventId = useMemo(() => String(params?.id ?? "").trim(), [params]);

  const participantIdFromQuery = searchParams?.get("participantId") ?? "";
  const amountFromQuery = searchParams?.get("amount") ?? "";

  const participantId = useMemo(
    () => participantIdFromQuery.trim(),
    [participantIdFromQuery],
  );
  const rawAmount = useMemo(() => amountFromQuery.trim(), [amountFromQuery]);
  const amountHint = useMemo(() => normalizeAmount(rawAmount), [rawAmount]);

  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<DetailsResponse | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);

  const baseError = useMemo(() => {
    if (!eventId || !participantId) {
      return "Não recebemos os dados do evento ou do participante. Volte para o resumo do racha e tente novamente.";
    }
    return null;
  }, [eventId, participantId]);

  useEffect(() => {
    let active = true;

    async function load() {
      if (baseError) {
        setLoading(false);
        setUiError(baseError);
        return;
      }

      try {
        setLoading(true);
        setUiError(null);

        const res = await fetch(
          `/api/events/${encodeURIComponent(
            eventId,
          )}/post-payment-details?participantId=${encodeURIComponent(
            participantId,
          )}`,
        );

        const data = (await res
          .json()
          .catch(() => null)) as DetailsResponse | null;

        if (!active) return;

        if (!res.ok) {
          const msg =
            data && "error" in data && typeof data.error === "string"
              ? data.error
              : "Erro ao carregar detalhes do pagamento.";
          setUiError(msg);
          setDetails(null);
          return;
        }

        setDetails(data);
      } catch (err) {
        console.error("[PosEventPaymentClient] erro ao carregar detalhes:", err);
        if (!active) return;
        setUiError("Erro inesperado ao carregar detalhes do pagamento.");
        setDetails(null);
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [eventId, participantId, baseError]);

  const isOkDetails = details != null && !("error" in details);

  const formatted = (v: number) => `R$ ${v.toFixed(2)}`;

  async function handleConfirmPaid() {
    if (!isOkDetails) return;
    if (!eventId || !participantId) return;

    const remaining = details.remainingToPay;
    if (!Number.isFinite(remaining) || remaining <= 0) {
      setUiError("Você não possui saldo pendente para pagar.");
      return;
    }

    const confirmed = window.confirm(
      "Confirma que você já realizou o PIX no seu banco? O app não verifica a transação; isso é apenas uma confirmação declaratória.",
    );
    if (!confirmed) return;

    try {
      setConfirming(true);
      setUiError(null);

      const res = await fetch(
        `/api/events/${encodeURIComponent(eventId)}/post-payments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            participantId,
            amount: remaining,
            transfers: details.transfers.map((t) => ({
              toParticipantId: t.toParticipantId,
              toName: t.toName,
              toPixKey: t.toPixKey,
              amount: t.amount,
              description: t.description,
            })),
          }),
        },
      );

      const data = (await res
        .json()
        .catch(() => null)) as { error?: string } | null;

      if (!res.ok) {
        setUiError(data?.error ?? "Erro ao confirmar pagamento.");
        return;
      }

      router.push(
        `/eventos/${eventId}/pos/comprovante?participantId=${encodeURIComponent(
          participantId,
        )}`,
      );
    } catch (err) {
      console.error("[PosEventPaymentClient] erro ao confirmar:", err);
      setUiError("Erro inesperado ao confirmar pagamento.");
    } finally {
      setConfirming(false);
    }
  }

  async function copyPixWithAmount(t: TransferLine) {
    const key = t.toPixKey;
    if (!key) return;

    try {
      const payload = buildPixCopiaECola({
        pixKey: key,
        amount: t.amount,
        description: t.description,
        merchantName: t.toName || "RECEBEDOR",
        merchantCity: "BRASIL",
      });

      await navigator.clipboard.writeText(payload);
      alert("PIX (copia e cola) com valor copiado.");
    } catch (err) {
      console.error("[PosEventPaymentClient] erro ao gerar/copiar PIX:", err);
      alert("Não foi possível copiar. Tente novamente ou copie manualmente.");
    }
  }

  async function copyOnlyPixKey(t: TransferLine) {
    const key = t.toPixKey;
    if (!key) return;

    try {
      await navigator.clipboard.writeText(key);
      alert("Chave PIX copiada.");
    } catch {
      alert("Não foi possível copiar. Copie manualmente.");
    }
  }

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
          Pagamento (PIX manual)
        </span>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-xl w-full mx-auto flex flex-col gap-4">
        <section className="rounded-2xl border border-[var(--border)] bg-card p-4 sm:p-6 flex flex-col gap-3">
          <div className="space-y-1">
            <h1 className="text-lg sm:text-xl font-semibold text-app">
              Finalizar pagamento
            </h1>
            <p className="text-sm text-muted">
              O pagamento é feito fora do app, via PIX no seu banco. Aqui nós só
              organizamos os valores e registramos sua confirmação.
            </p>
            {amountHint !== null && (
              <p className="text-[11px] text-app0">
                (Valor informado pelo resumo: {formatted(amountHint)} — o app
                pode recalcular o valor pendente.)
              </p>
            )}
          </div>

          {uiError && <p className="text-[11px] text-red-500">{uiError}</p>}

          {loading && (
            <p className="text-[11px] text-muted">
              Carregando detalhamento...
            </p>
          )}

          {isOkDetails && (
            <>
              <div className="rounded-xl border border-[var(--border)] bg-app p-3 space-y-1">
                <div className="text-[11px] text-app0">Evento</div>
                <div className="text-sm font-semibold text-app">
                  {details.eventName}
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-app p-3 space-y-1">
                <div className="text-[11px] text-app0">Total devido</div>
                <div className="text-lg font-semibold text-app">
                  {formatted(details.totalDue)}
                </div>
                {details.alreadyPaid > 0 && (
                  <div className="text-[11px] text-app0">
                    Já confirmado como pago: {formatted(details.alreadyPaid)}
                  </div>
                )}
                <div className="text-[11px] text-app0">
                  Pendente agora:{" "}
                  <span className="font-semibold text-app">
                    {formatted(details.remainingToPay)}
                  </span>
                </div>
              </div>

              {details.remainingToPay > 0 ? (
                <>
                  <div className="rounded-xl border border-[var(--border)] bg-card p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-app">
                        Detalhamento por destinatário
                      </span>
                      <span className="text-[10px] text-app0">
                        {details.transfers.length}{" "}
                        {details.transfers.length === 1
                          ? "transferência"
                          : "transferências"}
                      </span>
                    </div>

                    <div className="mt-2 space-y-2">
                      {details.transfers.map((t, idx) => (
                        <div
                          key={`${t.toParticipantId}-${idx}`}
                          className="rounded-lg border border-[var(--border)] bg-app p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-app">
                                {t.toName}
                              </span>
                              <span className="text-[11px] text-app0">
                                {t.description}
                              </span>
                            </div>
                            <span className="text-sm font-semibold text-app">
                              {formatted(t.amount)}
                            </span>
                          </div>

                          <div className="mt-2 text-[11px]">
                            <span className="text-app0">Chave PIX: </span>
                            {t.toPixKey ? (
                              <span className="text-app font-semibold break-all">
                                {t.toPixKey}
                              </span>
                            ) : (
                              <span className="text-amber-500 font-semibold">
                                Sem chave PIX cadastrada
                              </span>
                            )}
                          </div>

                          {t.toPixKey && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-app hover:bg-card/70"
                                onClick={() => void copyPixWithAmount(t)}
                              >
                                Copiar PIX (c/ valor)
                              </button>

                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-app hover:bg-card/70"
                                onClick={() => void copyOnlyPixKey(t)}
                              >
                                Copiar somente chave
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {details.missingPixRecipients.length > 0 && (
                      <div className="mt-3 rounded-lg border border-amber-600 bg-amber-600/10 px-3 py-2 text-[11px] text-amber-500 space-y-1">
                        <p className="font-semibold">Atenção</p>
                        <p>
                          Algumas pessoas não cadastraram chave PIX no app. Você
                          pode precisar pedir a chave diretamente para concluir o
                          pagamento.
                        </p>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleConfirmPaid}
                    disabled={confirming}
                    className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
                  >
                    {confirming ? "Confirmando..." : "Já paguei"}
                  </button>
                </>
              ) : (
                <div className="rounded-lg border border-emerald-600 bg-emerald-600/10 px-3 py-2 text-[11px] text-emerald-500 space-y-1">
                  <p className="font-semibold">Tudo certo!</p>
                  <p>Você não possui saldo pendente para pagar neste evento.</p>
                </div>
              )}

              <Link
                href={`/eventos/${eventId}/pos`}
                className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-app px-4 py-2 text-sm font-semibold text-app hover:bg-card/70"
              >
                Ver resumo do racha
              </Link>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
