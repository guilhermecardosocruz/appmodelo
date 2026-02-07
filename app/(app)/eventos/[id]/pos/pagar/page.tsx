import PosEventPaymentClient from "../PosEventPaymentClient";

type PageProps = {
  params: { id: string };
  searchParams?: { participantId?: string; amount?: string };
};

export default function PosEventPaymentPage({
  params,
  searchParams,
}: PageProps) {
  const eventId = params.id;
  const participantId = searchParams?.participantId ?? "";
  const amountRaw = searchParams?.amount ?? "";

  return (
    <PosEventPaymentClient
      eventId={eventId}
      participantId={participantId}
      amountRaw={amountRaw}
    />
  );
}
