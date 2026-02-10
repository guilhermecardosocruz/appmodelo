const PAGARME_API_KEY = process.env.PAGARME_API_KEY ?? "";
const PAGARME_API_BASE_URL =
  process.env.PAGARME_API_BASE_URL?.trim() || "https://api.pagar.me/1";
const PAGARME_POSTBACK_URL =
  process.env.PAGARME_POSTBACK_URL?.trim() || "";

// Só loga em dev se não tiver chave configurada
if (!PAGARME_API_KEY && process.env.NODE_ENV !== "production") {
  console.warn(
    "[lib/pagarme] PAGARME_API_KEY não configurada. Integração Pix ficará inativa.",
  );
}

export type CreatePixChargeParams = {
  amountInCents: number;
  customerName?: string | null;
  customerEmail?: string | null;
  metadata?: Record<string, unknown>;
};

export type PixChargeResult = {
  id: string | null;
  status: string | null;
  amountInCents: number | null;
  pixQrCode: string | null;
  pixCopyPaste: string | null;
  raw: unknown;
};

/**
 * Cria uma cobrança Pix na Pagar.me.
 *
 * ⚠️ Importante:
 * - Se você estiver usando a API nova (core/v5), ajuste a URL/base e o body aqui.
 * - O resto da aplicação só enxerga PixChargeResult, então a adaptação fica isolada.
 */
export async function createPixCharge(
  params: CreatePixChargeParams,
): Promise<PixChargeResult> {
  if (!PAGARME_API_KEY) {
    throw new Error("PAGARME_API_KEY não configurada.");
  }

  const base = PAGARME_API_BASE_URL.replace(/\/$/, "");
  const url = `${base}/transactions`;

  const body: Record<string, unknown> = {
    api_key: PAGARME_API_KEY,
    amount: params.amountInCents,
    payment_method: "pix",
    metadata: params.metadata ?? {},
  };

  if (PAGARME_POSTBACK_URL) {
    body.postback_url = PAGARME_POSTBACK_URL;
  }

  if (params.customerName || params.customerEmail) {
    body.customer = {
      name: params.customerName ?? undefined,
      email: params.customerEmail ?? undefined,
    };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json().catch(() => null)) as any;

  if (!res.ok) {
    const msg =
      (json &&
        (json.message ||
          (Array.isArray(json.errors) && JSON.stringify(json.errors)))) ||
      "Erro ao criar cobrança Pix na Pagar.me.";
    throw new Error(String(msg));
  }

  const payload = json ?? {};

  const id =
    payload.id ??
    payload.transaction?.id ??
    payload.charge?.id ??
    payload.data?.id ??
    null;

  const status =
    payload.status ??
    payload.transaction?.status ??
    payload.charge?.status ??
    payload.data?.status ??
    null;

  const pixQrCode =
    payload.pix_qr_code ??
    payload.pixQrCode ??
    payload.transaction?.pix_qr_code ??
    payload.charge?.pix_qr_code ??
    payload.data?.pix_qr_code ??
    null;

  const pixCopyPaste =
    payload.pix_emv ??
    payload.pix_copy_paste ??
    payload.pixCopyPaste ??
    payload.transaction?.pix_emv ??
    payload.charge?.pix_emv ??
    payload.data?.pix_emv ??
    pixQrCode ??
    null;

  return {
    id: id != null ? String(id) : null,
    status: status != null ? String(status) : null,
    amountInCents:
      typeof payload.amount === "number" ? payload.amount : null,
    pixQrCode:
      typeof pixQrCode === "string" && pixQrCode.trim()
        ? pixQrCode.trim()
        : null,
    pixCopyPaste:
      typeof pixCopyPaste === "string" && pixCopyPaste.trim()
        ? pixCopyPaste.trim()
        : null,
    raw: payload,
  };
}
