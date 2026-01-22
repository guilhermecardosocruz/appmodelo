import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { PDFDocument, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";

type RouteContext =
  | { params?: { id?: string } }
  | { params?: Promise<{ id?: string }> };

async function getTicketIdFromContext(context: RouteContext): Promise<string> {
  let rawParams: unknown =
    (context as unknown as { params?: unknown })?.params ?? {};
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
 * Helpers para links de rota (Maps + Waze) usando o location do evento.
 * A maioria dos leitores de PDF torna URLs em links clicáveis.
 */
function buildMapsUrl(location?: string | null) {
  const loc = String(location ?? "").trim();
  if (!loc) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    loc,
  )}`;
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
    return NextResponse.json(
      { error: "ID do ticket é obrigatório." },
      { status: 400 },
    );
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { event: true },
  });

  if (!ticket || ticket.userId !== user.id) {
    return NextResponse.json(
      { error: "Ticket não encontrado." },
      { status: 404 },
    );
  }

  const participant =
    String(ticket.attendeeName ?? user.name ?? "").trim() || "Participante";

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
  const page = doc.addPage([595.28, 841.89]); // A4 em pontos (72dpi)
  const pageWidth = page.getWidth();

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const marginX = 56;
  let y = 780;

  const mapsUrl = buildMapsUrl(ticket.event.location);
  const wazeUrl = buildWazeUrl(ticket.event.location);

  function draw(text: string, size = 12, bold = false) {
    page.drawText(text, {
      x: marginX,
      y,
      size,
      font: bold ? fontBold : font,
    });
    y -= size + 10;
  }

  function drawSmall(text: string, size = 10, bold = false) {
    page.drawText(text, {
      x: marginX,
      y,
      size,
      font: bold ? fontBold : font,
    });
    y -= size + 6;
  }

  // Cabeçalho / bloco esquerdo
  draw("INGRESSO", 24, true);
  draw(ticket.event.name, 16, true);

  const dateLabel = formatBRDate(ticket.event.eventDate) ?? "—";
  const locLabel = String(ticket.event.location ?? "").trim() || "—";

  draw(`Data: ${dateLabel}`, 12, false);
  draw(`Local: ${locLabel}`, 12, false);

  y -= 8;
  draw(`Participante: ${participant}`, 13, true);

  y -= 4;
  drawSmall(`Código: ${ticket.id}`, 10, false);

  // Como chegar
  if (mapsUrl || wazeUrl) {
    y -= 10;
    drawSmall("Como chegar:", 11, true);

    if (mapsUrl) {
      drawSmall(`Google Maps: ${mapsUrl}`, 9, false);
    }
    if (wazeUrl) {
      drawSmall(`Waze: ${wazeUrl}`, 9, false);
    }
  }

  y -= 14;
  drawSmall("Apresente este ingresso na entrada do evento.", 10, false);

  // QR Code à direita, estilo "ticket"
  try {
    const png = await doc.embedPng(qrBytes);
    const qrWidth = 180;
    const qrHeight = 180;
    const qrX = pageWidth - marginX - qrWidth;
    const qrY = 600; // um pouco abaixo do topo

    page.drawImage(png, {
      x: qrX,
      y: qrY,
      width: qrWidth,
      height: qrHeight,
    });

    page.drawText("QR Code do ingresso", {
      x: qrX,
      y: qrY - 16,
      size: 10,
      font,
    });
  } catch (err) {
    console.warn("[GET /api/tickets/[id]/pdf] Falha ao embutir QR:", err);
  }

  const bytes = await doc.save();

  const safeEvent = ticket.event.name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  const filename = `ingresso-${safeEvent || "evento"}-${ticket.id.slice(
    0,
    8,
  )}.pdf`;

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
      "Cache-Control": "no-store",
    },
  });
}
