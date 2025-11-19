import GuestInviteClient from "./GuestInviteClient";

type PageProps = {
  params: {
    slug: string;
  };
};

export default function GuestInvitePage({ params }: PageProps) {
  return <GuestInviteClient slug={params.slug} />;
}
