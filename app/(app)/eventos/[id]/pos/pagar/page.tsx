import Link from "next/link";
import PosEventPaymentClient from "../PosEventPaymentClient";

type PageProps = {
  params: { id: string };
  searchParams?: { participantId?: string; amount?: string };
};

export default function PosEventPaymentPlaceholderPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = params;
  const participantId = searchParams?.participantId ?? "";
  const amountRaw = searchParams?.amount ?? "";
  const amountNumber = amountRaw
    ? Number(amountRaw.replace(",", "."))
    : NaN;
  const hasValidAmount =
    Number.isFinite(amountNumber) && amountNumber > 0;
  const formattedAmount = hasValidAmount
    ? amountNumber.toFixed(2)
    : null;

  return (
    <div className="min-h-screen bg-app text-app flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
        <Link
          href={`/eventos/${id}/pos`}
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
            Fluxo de pagamento (em construção)
          </h1>

          <p className="text-sm text-muted">
            Aqui será implementado o fluxo para quem ficou devendo no racha
            realizar o pagamento do valor em aberto.
          </p>

          {hasValidAmount && formattedAmount && (
            <p className="text-sm text-app">
              Valor em aberto neste evento:{" "}
              <span className="font-semibold">
                R$ {formattedAmount}
              </span>
            </p>
          )}

          <p className="text-[11px] text-app0">
            No futuro, esta página vai:
          </p>

          <ul className="list-disc list-inside text-[11px] text-app0 space-y-1">
            <li>Mostrar o valor que você está devendo neste evento.</li>
            <li>Permitir escolher a forma de pagamento (Zoop).</li>
            <li>Registrar o pagamento e atualizar o acerto de contas.</li>
          </ul>

          <p className="text-[11px] text-app0">
            Por enquanto, esta página já registra um pagamento pendente
            no sistema. Em seguida vamos plugar a API da Zoop para gerar
            o checkout real.
          </p>

          <PosEventPaymentClient
            eventId={id}
            participantId={participantId}
            amount={hasValidAmount ? amountNumber : null}
          />
        </section>
      </main>
    </div>
  );
}
