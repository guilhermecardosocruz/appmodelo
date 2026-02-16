import nodemailer from "nodemailer";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getAppUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export async function sendPasswordResetEmail(to: string, token: string) {
  const host = mustEnv("SMTP_HOST");
  const port = Number(mustEnv("SMTP_PORT"));
  const user = mustEnv("SMTP_USER");
  const pass = mustEnv("SMTP_PASS");
  const from = mustEnv("SMTP_FROM");

  const appUrl = getAppUrl();
  const resetUrl = `${appUrl}/reset/${encodeURIComponent(token)}`;

  // Em DEV, loga o link pra facilitar
  if (process.env.NODE_ENV !== "production") {
    console.log("[sendPasswordResetEmail] resetUrl:", resetUrl);
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 normalmente é SSL
    auth: { user, pass },
  });

  await transporter.sendMail({
    from,
    to,
    subject: "Redefinição de senha",
    text:
      `Você solicitou a redefinição de senha.\n\n` +
      `Abra este link para definir uma nova senha:\n${resetUrl}\n\n` +
      `Se você não solicitou isso, ignore este e-mail.`,
    html:
      `<p>Você solicitou a redefinição de senha.</p>` +
      `<p><a href="${resetUrl}">Clique aqui para definir uma nova senha</a></p>` +
      `<p>Se você não solicitou isso, ignore este e-mail.</p>`,
  });
}
