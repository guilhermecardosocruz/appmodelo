/**
 * Gera payload PIX "copia e cola" (BR Code / EMV) com valor.
 * Baseado no padrão EMV para PIX (00/26/52/53/54/58/59/60/62/63).
 *
 * Observação:
 * - Muitos bancos aceitam colar esse payload diretamente no PIX Copia e Cola.
 * - Não é um QR dinâmico do banco; é um payload padronizado (BR Code).
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

export type PixCopiaEColaInput = {
  pixKey: string;
  amount: number;
  description?: string; // txid/descrição (vai em 62-05)
  merchantName?: string; // 59
  merchantCity?: string; // 60
};

export function buildPixCopiaECola(input: PixCopiaEColaInput): string {
  const pixKey = String(input.pixKey ?? "").trim();
  if (!pixKey) throw new Error("pixKey é obrigatório");

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amount inválido");
  }

  const merchantName = String(input.merchantName ?? "PAGAMENTO").trim() || "PAGAMENTO";
  const merchantCity = String(input.merchantCity ?? "BRASIL").trim() || "BRASIL";

  // txid no BR Code costuma ficar em 62-05 (reference label).
  // Não pode ser muito longo; vamos limitar pra evitar rejeição.
  const rawTxid = String(input.description ?? "").trim();
  const txid = rawTxid ? rawTxid.slice(0, 25) : "***";

  // 26 (Merchant Account Information)
  // GUI: br.gov.bcb.pix
  // Key: 01
  // Description: 02 (opcional) — vamos NÃO colocar aqui pra evitar rejeição; usamos 62-05
  const mai = emv("00", "br.gov.bcb.pix") + emv("01", pixKey);

  const payloadNoCrc =
    emv("00", "01") + // Payload Format Indicator
    emv("26", mai) +
    emv("52", "0000") + // MCC (0000 = genérico)
    emv("53", "986") + // BRL
    emv("54", fmtAmountBR(amount)) +
    emv("58", "BR") +
    emv("59", merchantName.slice(0, 25)) +
    emv("60", merchantCity.slice(0, 15)) +
    emv("62", emv("05", txid)) +
    "6304"; // CRC placeholder

  const crc = crc16ccitt(payloadNoCrc);
  return payloadNoCrc + crc;
}

/**
 * Helper: tenta identificar se é telefone e normaliza (só dígitos),
 * mas não força; alguns bancos aceitam chave com caracteres (email).
 */
export function normalizePixKeyForDisplay(pixKey: string): string {
  const k = String(pixKey ?? "").trim();
  // Se parece telefone (tem 10-13 dígitos), retorna só dígitos, senão retorna original.
  const digits = onlyDigits(k);
  if (digits.length >= 10 && digits.length <= 13) return digits;
  return k;
}
