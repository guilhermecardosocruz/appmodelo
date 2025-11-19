import ConviteClient from "./ConviteClient";

type PageProps = {
  params: {
    slug: string;
  };
};

export default function ConvitePage({ params }: PageProps) {
  return <ConviteClient slug={params.slug} />;
}
