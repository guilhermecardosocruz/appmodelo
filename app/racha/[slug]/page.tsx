import RachaInviteClient from "./RachaInviteClient";

export default function RachaPage({
  params,
}: {
  params: { slug: string };
}) {
  return <RachaInviteClient slug={params.slug} />;
}
