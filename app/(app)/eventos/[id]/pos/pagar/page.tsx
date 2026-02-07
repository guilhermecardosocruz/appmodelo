import PosEventPaymentClient from "../PosEventPaymentClient";

type PageProps = {
  params: { id?: string };
  searchParams?: { [key: string]: string | string[] | undefined };
};

export default function Page({ params, searchParams }: PageProps) {
  const eventId = String(params?.id ?? "").trim();

  const participantRaw = searchParams?.participantId;
  const amountRaw = searchParams?.amount;

  const participantIdParam = Array.isArray(participantRaw)
    ? participantRaw[0]
    : participantRaw;

  const amountParam = Array.isArray(amountRaw) ? amountRaw[0] : amountRaw;

  return (
    <PosEventPaymentClient
      eventId={eventId}
      participantIdParam={participantIdParam}
      amountParam={amountParam}
    />
  );
}
