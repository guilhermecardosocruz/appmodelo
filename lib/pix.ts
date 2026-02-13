/**
 * Gera payload PIX "copia e cola" (BR Code / EMV) com valor.
 * Baseado no padrão EMV para PIX (00/26/52/53/54/58/59/60/62/63).
 *
 * Observação:
 * - Muitos bancos aceitam colar esse payload diretamente no PIX Copia e Cola.
 * - Não é um QR dinâmico do banco; é um payload padronizado (BR Code).
 *
 * Ajustes importantes:
 * - Normaliza a chave PIX para o formato aceito (CPF/CNPJ dígitos, telefone +55, email lower, EVP UUID).
 * - Sanitiza merchantName/merchantCity removendo acentos e caracteres problemáticos (alguns apps bancários rejeitam).
 * - TXID (62-05) fica só alfanumérico (sem espaços/símbolos) para evitar rejeição em alguns bancos.
 */

function onlyDigits(s: string): string {
  return s.replace(/\D+/g, "");
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function fmtAmountBR(n: number): string {
  const v = Math.round(n * 100) / 100;
  return v.toFixed(2);
}

function emv(id: string, value: string): string {
  const len = value.length;
  return `${id}${pad2(len)}${value}`;
}

function crc16ccitt(payload: string): string {
  // CRC-16/CCITT-FALSE
  let crc = 0xffff;
  const poly = 0x1021;

  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      const msb = crc & 0x8000;
      crc = (crc << 1) & 0xffff;
      if (msb) crc ^= poly;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function toSafeAscii(s: string): string {
  const noMarks = stripDiacritics(String(s ?? ""));
  return noMarks
    .replace(/[^\w\s\-\.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toTxidSafe(s: string): string {
  // TXID/Reference Label: deixa só A-Z a-z 0-9 (sem espaços/símbolos)
  // Alguns bancos rejeitam espaços e caracteres especiais aqui.
  const base = toSafeAscii(s);
  const onlyAlnum = base.replace(/[^A-Za-z0-9]/g, "");
  return onlyAlnum;
}

function isUuidV4ish(s: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
    s,
  );
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function normalizePhoneToE164BR(raw: string): string | null {
  const s = String(raw ?? "").trim();

  const hasPlus = s.startsWith("+");
  const digits = onlyDigits(s);

  if (!digits) return null;

  if (hasPlus) {
    if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) {
      return `+${digits}`;
    }
    return null;
  }

  if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) {
    return `+${digits}`;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }

  return null;
}

export type PixCopiaEColaInput = {
  pixKey: string;
  amount: number;
  description?: string; // txid/descrição (vai em 62-05)
  merchantName?: string; // 59
  merchantCity?: string; // 60
};

export type PixKeyKind = "CPF" | "CNPJ" | "PHONE" | "EMAIL" | "EVP";

export function normalizePixKeyForPayload(
  pixKey: string,
): { kind: PixKeyKind; value: string } {
  const k = String(pixKey ?? "").trim();

  if (!k) {
    throw new Error("chave PIX é obrigatória");
  }

  if (isUuidV4ish(k)) {
    return { kind: "EVP", value: k.toLowerCase() };
  }

  if (isEmail(k)) {
    return { kind: "EMAIL", value: k.toLowerCase() };
  }

  const digits = onlyDigits(k);
  if (digits.length === 11) return { kind: "CPF", value: digits };
  if (digits.length === 14) return { kind: "CNPJ", value: digits };

  const phone = normalizePhoneToE164BR(k);
  if (phone) return { kind: "PHONE", value: phone };

  throw new Error(
    "chave PIX inválida. Use CPF, CNPJ, e-mail, telefone (com DDD) ou chave aleatória (EVP).",
  );
}

export function buildPixCopiaECola(input: PixCopiaEColaInput): string {
  const rawPixKey = String(input.pixKey ?? "").trim();
  const normalized = normalizePixKeyForPayload(rawPixKey);

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amount inválido");
  }

  const merchantNameRaw =
    String(input.merchantName ?? "PAGAMENTO").trim() || "PAGAMENTO";
  const merchantCityRaw =
    String(input.merchantCity ?? "BRASIL").trim() || "BRASIL";

  const merchantName = toSafeAscii(merchantNameRaw).slice(0, 25) || "PAGAMENTO";
  const merchantCity = toSafeAscii(merchantCityRaw).slice(0, 15) || "BRASIL";

  // ✅ TXID seguro: só alfanumérico, sem espaços/símbolos
  const rawTxid = String(input.description ?? "").trim();
  const txidClean = rawTxid ? toTxidSafe(rawTxid).slice(0, 25) : "";
  const txid = txidClean || "***";

  const mai = emv("00", "br.gov.bcb.pix") + emv("01", normalized.value);

  const payloadNoCrc =
    emv("00", "01") +
    emv("26", mai) +
    emv("52", "0000") +
    emv("53", "986") +
    emv("54", fmtAmountBR(amount)) +
    emv("58", "BR") +
    emv("59", merchantName) +
    emv("60", merchantCity) +
    emv("62", emv("05", txid)) +
    "6304";

  const crc = crc16ccitt(payloadNoCrc);
  return payloadNoCrc + crc;
}

export function normalizePixKeyForDisplay(pixKey: string): string {
  const k = String(pixKey ?? "").trim();
  if (!k) return "";

  try {
    const n = normalizePixKeyForPayload(k);

    if (n.kind === "PHONE") return onlyDigits(n.value);
    if (n.kind === "CPF" || n.kind === "CNPJ") return n.value;

    return n.value;
  } catch {
    return k;
  }
}
