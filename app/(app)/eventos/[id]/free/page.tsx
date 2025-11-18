import EventTipoClient from "../EventTipoClient";

type PageProps = {
  params: {
    id: string;
  };
};

export default function EventoFreePage({ params }: PageProps) {
  return <EventTipoClient eventId={params.id} mode="free" />;
}
