import EventTipoClient from "../EventTipoClient";

type PageProps = {
  params: {
    id: string;
  };
};

export default function EventoPrePagoPage({ params }: PageProps) {
  return <EventTipoClient eventId={params.id} mode="pre" />;
}
