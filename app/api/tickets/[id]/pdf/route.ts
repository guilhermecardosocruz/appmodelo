import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import {
  PDFDocument,
  StandardFonts,
  PDFPage,
  PDFName,
  PDFArray,
  PDFString,
  rgb,
} from "pdf-lib";
import QRCode from "qrcode";

type RouteContext =
  | { params?: { id?: string } }
  | { params?: Promise<{ id?: string }> };

async function getTicketIdFromContext(context: RouteContext): Promise<string> {
  let rawParams: unknown =
    (context as unknown as { params?: unknown })?.params ?? {};
  if (
    rawParams &&
    typeof (rawParams as { then?: unknown }).then === "function"
  ) {
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

/**
 * Cria uma annotation de link clicável em volta de um retângulo.
 * x, y = canto inferior esquerdo do retângulo.
 */
function addLinkAnnotation(
  pdfDoc: PDFDocument,
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  url: string,
) {
  const linkAnnotation = pdfDoc.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [x, y, x + width, y + height],
    Border: [0, 0, 0],
    A: {
      Type: "Action",
      S: "URI",
      URI: PDFString.of(url),
    },
  });

  const linkRef = pdfDoc.context.register(linkAnnotation);
  const annotsKey = PDFName.of("Annots");
  const existingAnnots = page.node.get(annotsKey);

  if (existingAnnots instanceof PDFArray) {
    existingAnnots.push(linkRef);
  } else {
    const arr = pdfDoc.context.obj([linkRef]);
    page.node.set(annotsKey, arr);
  }
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

  // Payload do QR Code – mesmo formato usado no front
  const payload = JSON.stringify(
    {
      kind: "TICKET",
      ticketId: ticket.id,
    },
    null,
    0,
  );

  const qrDataUrl = await QRCode.toDataURL(payload, {
    margin: 1,
    width: 260,
    errorCorrectionLevel: "M",
  });

  const base64 = qrDataUrl.split(",")[1] ?? "";
  const qrBytes = Uint8Array.from(Buffer.from(base64, "base64"));

  const doc = await PDFDocument.create();

  // Página em A4 horizontal
  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const page = doc.addPage([pageWidth, pageHeight]);

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const marginX = 60;
  const topY = pageHeight - 60;

  // QR Code à direita
  const qrSize = 220;
  const qrX = pageWidth - marginX - qrSize;
  const qrY = topY - qrSize + 10;

  try {
    const png = await doc.embedPng(qrBytes);
    page.drawImage(png, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    page.drawText("QR Code do ingresso", {
      x: qrX + 12,
      y: qrY - 18,
      size: 11,
      font,
    });
  } catch (err) {
    // Se der erro no QR, apenas não desenha a imagem
    console.warn("[PDF Ticket] Falha ao embutir QR:", err);
  }

  // Coluna de texto à esquerda
  let y = topY;

  const draw = (text: string, size = 12, bold = false, extraGap = 10) => {
    page.drawText(text, {
      x: marginX,
      y,
      size,
      font: bold ? fontBold : font,
    });
    y -= size + extraGap;
  };

  // Cabeçalho
  draw("INGRESSO", 32, true, 18);
  draw(ticket.event.name, 20, true, 16);

  const dateLabel = formatBRDate(ticket.event.eventDate) ?? "—";
  const loc = String(ticket.event.location ?? "").trim() || "—";

  draw(`Data: ${dateLabel}`, 13, false, 4);
  draw(`Local: ${loc}`, 13, false, 18);

  // Participante / código
  draw(`Participante: ${participant}`, 15, true, 6);
  draw(`Código: ${ticket.id}`, 12, false, 18);

  // "Como chegar" + botões clicáveis
  const mapsUrl = buildMapsUrl(ticket.event.location);
  const wazeUrl = buildWazeUrl(ticket.event.location);

  type PendingLink = {
    x: number;
    y: number;
    width: number;
    height: number;
    url: string;
  };

  const pendingLinks: PendingLink[] = [];

  if (mapsUrl || wazeUrl) {
    draw("Como chegar:", 14, true, 12);

    const linkFontSize = 12;
    const paddingX = 8;
    const paddingY = 5;

    const drawButtonLink = (label: string, url: string) => {
      const textWidth = fontBold.widthOfTextAtSize(label, linkFontSize);
      const buttonWidth = textWidth + paddingX * 2;
      const buttonHeight = linkFontSize + paddingY * 2;

      const buttonX = marginX;
      const buttonY = y - paddingY; // y é a linha de base do texto

      // Retângulo do botão
      page.drawRectangle({
        x: buttonX,
        y: buttonY,
        width: buttonWidth,
        height: buttonHeight,
        borderWidth: 1,
        borderColor: rgb(0.0, 0.5, 0.3),
        color: rgb(0.9, 0.98, 0.96),
      });

      // Texto dentro do botão
      page.drawText(label, {
        x: buttonX + paddingX,
        y,
        size: linkFontSize,
        font: fontBold,
        color: rgb(0.0, 0.3, 0.2),
      });

      // Guarda área para annotation
      pendingLinks.push({
        x: buttonX,
        y: buttonY,
        width: buttonWidth,
        height: buttonHeight,
        url,
      });

      // Próxima linha
      y -= buttonHeight + 8;
    };

    if (mapsUrl) {
      drawButtonLink("Google Maps", mapsUrl);
    }
    if (wazeUrl) {
      drawButtonLink("Waze", wazeUrl);
    }
  }

  y -= 10;
  draw("Apresente este ingresso na entrada do evento.", 11, false, 4);

  // Aplica as annotations de link em cada botão
  pendingLinks.forEach((link) => {
    addLinkAnnotation(
      doc,
      page,
      link.x,
      link.y,
      link.width,
      link.height,
      link.url,
    );
  });

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
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
