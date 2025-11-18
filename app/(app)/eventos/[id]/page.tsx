import EventClient from "./EventClient";

type PageProps = {
  params: {
    id: string;
  };
};

export default function EventoPage({ params }: PageProps) {
  return <EventClient eventId={params.id} />;
}
