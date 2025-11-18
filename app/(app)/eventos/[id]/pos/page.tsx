import EventTipoClient from "../EventTipoClient";

type PageProps = {
  params: {
    id: string;
  };
};

export default function EventoPosPagoPage({ params }: PageProps) {
  return <EventTipoClient eventId={params.id} mode="pos" />;
}
