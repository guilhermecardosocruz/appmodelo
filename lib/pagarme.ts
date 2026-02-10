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
 * Tipo “solto” da resposta da Pagar.me, mas ainda tipado com `unknown`
 * onde não temos certeza do formato.
 */
type PagarmeResponseBody = {
  message?: unknown;
  errors?: unknown;
  id?: unknown;
  status?: unknown;
  pix_qr_code?: unknown;
  pixQrCode?: unknown;
  pix_emv?: unknown;
  pix_copy_paste?: unknown;
  pixCopyPaste?: unknown;
  amount?: unknown;
  transaction?: PagarmeResponseBody;
  charge?: PagarmeResponseBody;
  data?: PagarmeResponseBody;
  [key: string]: unknown;
};

function asObject(value: unknown): PagarmeResponseBody | null {
  if (value && typeof value === "object") {
    return value as PagarmeResponseBody;
  }
  return null;
}

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

  const json = (await res.json().catch(() => null)) as unknown;
  const payload: PagarmeResponseBody =
    (json && typeof json === "object"
      ? (json as PagarmeResponseBody)
      : {}) ?? {};

  if (!res.ok) {
    const baseMsg =
      (typeof payload.message === "string" && payload.message) ||
      (Array.isArray(payload.errors)
        ? JSON.stringify(payload.errors)
        : null) ||
      "Erro ao criar cobrança Pix na Pagar.me.";

    // Log mais detalhado no backend para debug
    console.error("[lib/pagarme] Erro da Pagar.me ao criar Pix:", {
      status: res.status,
      statusText: res.statusText,
      body: payload,
    });

    throw new Error(String(baseMsg));
  }

  const root = payload;
  const transaction = asObject(root.transaction);
  const charge = asObject(root.charge);
  const data = asObject(root.data);

  const idValue =
    root.id ??
    transaction?.id ??
    charge?.id ??
    data?.id ??
    null;

  const statusValue =
    root.status ??
    transaction?.status ??
    charge?.status ??
    data?.status ??
    null;

  const qrCodeValue =
    root.pix_qr_code ??
    root.pixQrCode ??
    transaction?.pix_qr_code ??
    charge?.pix_qr_code ??
    data?.pix_qr_code ??
    null;

  const copyPasteValue =
    root.pix_emv ??
    root.pix_copy_paste ??
    root.pixCopyPaste ??
    transaction?.pix_emv ??
    charge?.pix_emv ??
    data?.pix_emv ??
    qrCodeValue ??
    null;

  const amountValue = root.amount;

  return {
    id:
      typeof idValue === "string" || typeof idValue === "number"
        ? String(idValue)
        : null,
    status:
      typeof statusValue === "string" || typeof statusValue === "number"
        ? String(statusValue)
        : null,
    amountInCents: typeof amountValue === "number" ? amountValue : null,
    pixQrCode:
      typeof qrCodeValue === "string" && qrCodeValue.trim()
        ? qrCodeValue.trim()
        : null,
    pixCopyPaste:
      typeof copyPasteValue === "string" && copyPasteValue.trim()
        ? copyPasteValue.trim()
        : null,
    raw: payload,
  };
}
