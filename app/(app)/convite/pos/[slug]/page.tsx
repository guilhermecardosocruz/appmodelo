import PostParticipantInviteClient from "./PostParticipantInviteClient";

type PageProps = {
  params:
    | { slug: string }
    | Promise<{ slug: string }>;
};

/**
 * Página de convite pós-pago por participante.
 *
 * Ela garante que o slug vindo da URL seja repassado corretamente
 * para o PostParticipantInviteClient, inclusive em ambientes
 * onde o Next possa entregar params como Promise.
 */
export default async function PostParticipantInvitePage(props: PageProps) {
  const resolvedParams =
    "then" in props.params
      ? await props.params
      : props.params;

  const slug = String(resolvedParams.slug ?? "").trim();

  return <PostParticipantInviteClient slug={slug} />;
}
