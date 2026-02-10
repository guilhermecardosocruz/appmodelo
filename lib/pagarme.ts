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

type PagarmeResponseBody = {
  message?: unknown;
  errors?: unknown;
  [key: string]: unknown;
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

  const json = (await res.json().catch(() => null)) as unknown;
  const payload = (json && typeof json === "object"
    ? (json as PagarmeResponseBody)
    : {}) as PagarmeResponseBody;

  if (!res.ok) {
    const baseMsg =
      (typeof payload.message === "string" && payload.message) ||
      (Array.isArray(payload.errors) ? JSON.stringify(payload.errors) : null) ||
      "Erro ao criar cobrança Pix na Pagar.me.";

    // Log mais detalhado no backend para debug
    console.error("[lib/pagarme] Erro da Pagar.me ao criar Pix:", {
      status: res.status,
      statusText: res.statusText,
      body: payload,
    });

    throw new Error(String(baseMsg));
  }

  const id =
    payload.id ??
    (payload as any).transaction?.id ??
    (payload as any).charge?.id ??
    (payload as any).data?.id ??
    null;

  const status =
    payload.status ??
    (payload as any).transaction?.status ??
    (payload as any).charge?.status ??
    (payload as any).data?.status ??
    null;

  const pixQrCode =
    (payload as any).pix_qr_code ??
    (payload as any).pixQrCode ??
    (payload as any).transaction?.pix_qr_code ??
    (payload as any).charge?.pix_qr_code ??
    (payload as any).data?.pix_qr_code ??
    null;

  const pixCopyPaste =
    (payload as any).pix_emv ??
    (payload as any).pix_copy_paste ??
    (payload as any).pixCopyPaste ??
    (payload as any).transaction?.pix_emv ??
    (payload as any).charge?.pix_emv ??
    (payload as any).data?.pix_emv ??
    pixQrCode ??
    null;

  return {
    id: id != null ? String(id) : null,
    status: status != null ? String(status) : null,
    amountInCents:
      typeof (payload as any).amount === "number"
        ? ((payload as any).amount as number)
        : null,
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
