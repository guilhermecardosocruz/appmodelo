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
 */

function onlyDigits(s: string): string {
  return s.replace(/\D+/g, "");
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function fmtAmountBR(n: number): string {
  // PIX exige decimal com ponto, ex: 10.00
  // Garantir 2 casas.
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
  // Remove acentos/diacríticos mantendo caracteres base
  // Ex.: "João" -> "Joao"
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function toSafeAscii(s: string): string {
  // Mantém apenas caracteres seguros que tendem a passar em apps bancários:
  // letras, números, espaço e alguns sinais básicos.
  // Remove acentos e normaliza espaços.
  const noMarks = stripDiacritics(String(s ?? ""));
  return noMarks
    .replace(/[^\w\s\-\.]/g, " ") // troca coisas estranhas por espaço
    .replace(/\s+/g, " ")
    .trim();
}

function isUuidV4ish(s: string): boolean {
  // Aceita UUID "EVP" em geral (não força v4 estrito, mas valida formato 8-4-4-4-12 hex)
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
    s,
  );
}

function isEmail(s: string): boolean {
  // Validação leve: suficiente para decidir normalização
  // (não é RFC completa)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function normalizePhoneToE164BR(raw: string): string | null {
  // Aceita entradas como:
  // (48) 99999-9999 -> +5548999999999
  // 5548999999999 -> +5548999999999
  // +55 (48) 99999-9999 -> +5548999999999
  //
  // Regras simplificadas:
  // - se já vier com +55, mantém + e dígitos
  // - se vier só dígitos e começa com 55 (12-13 dígitos), prefixa +
  // - se vier com 10-11 dígitos (DDD + número), prefixa +55
  const s = String(raw ?? "").trim();

  const hasPlus = s.startsWith("+");
  const digits = onlyDigits(s);

  if (!digits) return null;

  if (hasPlus) {
    // Ex.: "+55 48 99999-9999" -> "+5548999999999"
    if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) {
      return `+${digits}`;
    }
    // Se tiver + mas não for BR, não força aqui (deixa inválido para nosso caso)
    return null;
  }

  // Sem '+'
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

  // 1) EVP (UUID)
  // Muitos usuários usam EVP (chave aleatória)
  if (isUuidV4ish(k)) {
    return { kind: "EVP", value: k.toLowerCase() };
  }

  // 2) Email
  if (isEmail(k)) {
    return { kind: "EMAIL", value: k.toLowerCase() };
  }

  // 3) CPF/CNPJ (com ou sem pontuação)
  const digits = onlyDigits(k);
  if (digits.length === 11) {
    return { kind: "CPF", value: digits };
  }
  if (digits.length === 14) {
    return { kind: "CNPJ", value: digits };
  }

  // 4) Telefone (normaliza para +55...)
  const phone = normalizePhoneToE164BR(k);
  if (phone) {
    return { kind: "PHONE", value: phone };
  }

  // Se chegou aqui, é algo que não reconhecemos
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

  // Alguns apps bancários são mais tolerantes com ASCII básico.
  const merchantNameRaw = String(input.merchantName ?? "PAGAMENTO").trim() || "PAGAMENTO";
  const merchantCityRaw = String(input.merchantCity ?? "BRASIL").trim() || "BRASIL";

  const merchantName = toSafeAscii(merchantNameRaw).slice(0, 25) || "PAGAMENTO";
  const merchantCity = toSafeAscii(merchantCityRaw).slice(0, 15) || "BRASIL";

  // txid no BR Code costuma ficar em 62-05 (reference label).
  // Não pode ser muito longo; vamos limitar pra evitar rejeição.
  const rawTxid = String(input.description ?? "").trim();
  const txid = rawTxid ? toSafeAscii(rawTxid).slice(0, 25) : "***";

  // 26 (Merchant Account Information)
  // GUI: br.gov.bcb.pix
  // Key: 01
  const mai = emv("00", "br.gov.bcb.pix") + emv("01", normalized.value);

  const payloadNoCrc =
    emv("00", "01") + // Payload Format Indicator
    emv("26", mai) +
    emv("52", "0000") + // MCC (0000 = genérico)
    emv("53", "986") + // BRL
    emv("54", fmtAmountBR(amount)) +
    emv("58", "BR") +
    emv("59", merchantName) +
    emv("60", merchantCity) +
    emv("62", emv("05", txid)) +
    "6304"; // CRC placeholder

  const crc = crc16ccitt(payloadNoCrc);
  return payloadNoCrc + crc;
}

/**
 * Helper: normalização apenas para EXIBIÇÃO (UI).
 * - Telefone: mostra só dígitos (sem +) pra ficar mais legível
 * - CPF/CNPJ: só dígitos
 * - Email/EVP: mantém
 */
export function normalizePixKeyForDisplay(pixKey: string): string {
  const k = String(pixKey ?? "").trim();
  if (!k) return "";

  try {
    const n = normalizePixKeyForPayload(k);

    if (n.kind === "PHONE") return onlyDigits(n.value);
    if (n.kind === "CPF" || n.kind === "CNPJ") return n.value;

    return n.value;
  } catch {
    // Se não reconhece, retorna como o usuário digitou (pra ele conseguir corrigir)
    return k;
  }
}
