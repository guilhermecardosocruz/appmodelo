import { Resend } from "resend";

type SendResetEmailParams = {
  to: string;
  resetLink: string;
};

type ResendErrorShape = {
  message?: string;
};

type ResendDataShape = {
  id?: string;
};

type ResendSendResponseShape = {
  data?: ResendDataShape | null;
  error?: ResendErrorShape | null;
};

function safeMsg(err: unknown) {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function pickResponseShape(v: unknown): ResendSendResponseShape | null {
  if (!isObject(v)) return null;

  const data = v.data;
  const error = v.error;

  const shape: ResendSendResponseShape = {};

  if (data === null || isObject(data)) {
    shape.data = (data as ResendDataShape | null) ?? null;
  }

  if (error === null || isObject(error)) {
    shape.error = (error as ResendErrorShape | null) ?? null;
  }

  // Só consideramos "shape válida" se tiver ao menos data/error como chave,
  // pois alguns SDKs retornam diretamente { id } também.
  if ("data" in v || "error" in v) return shape;

  return null;
}

export async function sendResetEmail({ to, resetLink }: SendResetEmailParams) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY não configurada");
  }

  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error("EMAIL_FROM não configurado");
  }

  const resend = new Resend(apiKey);

  let raw: unknown;
  try {
    raw = await resend.emails.send({
      from,
      to,
      subject: "Recuperação de senha",
      text: `Você solicitou a redefinição da sua senha.\n\nAbra este link para criar uma nova senha:\n${resetLink}\n`,
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
  } catch (e) {
    throw new Error(`Resend falhou ao enviar (throw): ${safeMsg(e)}`);
  }

  // Caso 1: retorno padrão { data, error }
  const shaped = pickResponseShape(raw);
  if (shaped) {
    const err = shaped.error;
    if (err) {
      const msg = err.message ?? safeMsg(err);
      throw new Error(`Resend falhou ao enviar (error no retorno): ${msg}`);
    }

    const id = shaped.data?.id;
    if (!id) {
      throw new Error(`Resend retornou resposta inesperada: ${safeMsg(raw)}`);
    }

    return { id };
  }

  // Caso 2: alguns retornos podem ser diretamente { id: "..." }
  if (isObject(raw) && typeof raw.id === "string" && raw.id.trim()) {
    return { id: raw.id };
  }

  throw new Error(`Resend retornou resposta inesperada: ${safeMsg(raw)}`);
}
