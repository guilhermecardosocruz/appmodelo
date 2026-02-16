import { Resend } from "resend";

type SendResetEmailParams = {
  to: string;
  resetLink: string;
};

export async function sendResetEmail({
  to,
  resetLink,
}: SendResetEmailParams) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY não configurada");
  }

  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error("EMAIL_FROM não configurado");
  }

  const resend = new Resend(apiKey);

  await resend.emails.send({
    from,
    to,
    subject: "Recuperação de senha",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Recuperação de senha</h2>
        <p>Você solicitou a redefinição da sua senha.</p>
        <p>Clique no botão abaixo para criar uma nova senha:</p>
        <p>
          <a href="${resetLink}" 
             style="display:inline-block;padding:10px 16px;
             background:#4f46e5;color:#fff;text-decoration:none;
             border-radius:6px;">
             Redefinir senha
          </a>
        </p>
        <p>Ou copie e cole este link no navegador:</p>
        <p>${resetLink}</p>
      </div>
    `,
  });
}
