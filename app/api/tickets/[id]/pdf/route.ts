import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { PDFDocument, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";

type RouteContext =
  | { params?: { id?: string } }
  | { params?: Promise<{ id?: string }> };

async function getTicketIdFromContext(context: RouteContext): Promise<string> {
  let rawParams: unknown = (context as unknown as { params?: unknown })?.params ?? {};
  if (rawParams && typeof (rawParams as { then?: unknown }).then === "function") {
    rawParams = await (rawParams as Promise<{ id?: string }>);
  }
  const paramsObj = rawParams as { id?: string } | undefined;
  return String(paramsObj?.id ?? "").trim();
}

function formatBRDate(iso?: Date | string | null) {
  if (!iso) return null;
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return null;
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const ano = d.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

/**
 * Helpers para links de rota, reaproveitando o mesmo location do evento
 */
function buildMapsUrl(location?: string | null) {
  const loc = String(location ?? "").trim();
  if (!loc) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`;
}

function buildWazeUrl(location?: string | null) {
  const loc = String(location ?? "").trim();
  if (!loc) return null;
  return `https://waze.com/ul?q=${encodeURIComponent(loc)}&navigate=yes`;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const user = getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const ticketId = await getTicketIdFromContext(context);
  if (!ticketId) {
    return NextResponse.json({ error: "ID do ticket é obrigatório." }, { status: 400 });
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { event: true },
  });

  if (!ticket || ticket.userId !== user.id) {
    return NextResponse.json({ error: "Ticket não encontrado." }, { status: 404 });
  }

  const participant = String(ticket.attendeeName ?? user.name ?? "").trim() || "Participante";

  // ✅ payload estável (igual no front)
  const payload = JSON.stringify({
    kind: "TICKET",
    ticketId: ticket.id,
  });

  const qrDataUrl = await QRCode.toDataURL(payload, {
    margin: 1,
    width: 260,
    errorCorrectionLevel: "M",
  });

  const base64 = qrDataUrl.split(",")[1] ?? "";
  const qrBytes = Uint8Array.from(Buffer.from(base64, "base64"));

  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const marginX = 48;
  let y = 780;

  const draw = (text: string, size = 12, bold = false) => {
    page.drawText(text, {
      x: marginX,
      y,
      size,
      font: bold ? fontBold : font,
    });
    y -= size + 10;
  };

  draw("INGRESSO", 24, true);
  draw(ticket.event.name, 14, true);

  const dateLabel = formatBRDate(ticket.event.eventDate) ?? "—";
  draw(`Data: ${dateLabel}`, 12, false);

  const loc = String(ticket.event.location ?? "").trim();
  draw(`Local: ${loc || "—"}`, 12, false);

  // 🔗 Links de rota (Maps / Waze) usando o mesmo location
  const mapsUrl = buildMapsUrl(ticket.event.location);
  const wazeUrl = buildWazeUrl(ticket.event.location);

  if (mapsUrl || wazeUrl) {
    y -= 6;
    draw("Como chegar:", 12, true);

    if (mapsUrl) {
      draw(`Google Maps: ${mapsUrl}`, 9, false);
    }

    if (wazeUrl) {
      draw(`Waze: ${wazeUrl}`, 9, false);
    }
  }

  y -= 8;
  draw(`Participante: ${participant}`, 13, true);

  y -= 8;
  draw(`Ticket ID: ${ticket.id}`, 11, false);

  y -= 14;
  draw("Apresente este ingresso na entrada do evento.", 11, false);

  // QR
  try {
    const png = await doc.embedPng(qrBytes);
    page.drawImage(png, { x: marginX, y: 470, width: 180, height: 180 });
    page.drawText("QR Code do ingresso", { x: marginX, y: 455, size: 10, font });
  } catch (err) {
    console.warn("[GET /api/tickets/[id]/pdf] Falha ao embutir QR:", err);
  }

  const bytes = await doc.save();

  const safeEvent = ticket.event.name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  const filename = `ingresso-${safeEvent || "evento"}-${ticket.id.slice(0, 8)}.pdf`;

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
