/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { PDFDocument, StandardFonts } from "pdf-lib";

type RouteContext =
  | { params?: { id?: string } }
  | { params?: Promise<{ id?: string }> };

async function getEventIdFromContext(context: RouteContext): Promise<string> {
  let rawParams: any = (context as any)?.params ?? {};
  if (rawParams && typeof rawParams.then === "function") {
    rawParams = await rawParams;
  }
  return String(rawParams?.id ?? "").trim();
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

function makeGuestSlug(eventId: string) {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${eventId.slice(0, 6)}-g-${randomPart}`;
}

// GET /api/events/[id]/ticket?name=...&guestSlug=...
// - Sempre retorna um PDF
// - Para FREE:
//   - Se guestSlug: valida convidado (precisa confirmedAt) e usa slug como código
//   - Se NÃO guestSlug e usuário logado + name: cria EventGuest confirmado + Ticket vinculado (guestId)
//   - Se NÃO logado: só gera PDF (sem persistir)
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const eventId = await getEventIdFromContext(context);

    if (!eventId) {
      return NextResponse.json({ error: "ID do evento é obrigatório." }, { status: 400 });
    }

    const url = new URL(request.url);
    const rawName = String(url.searchParams.get("name") ?? "").trim();
    const guestSlug = String(url.searchParams.get("guestSlug") ?? "").trim();

    const sessionUser = await getSessionUser(request);

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        type: true,
        eventDate: true,
        location: true,
      },
    });

    if (!event) {
      return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
    }

    if (event.type !== "FREE") {
      return NextResponse.json(
        { error: "Este ingresso em PDF está disponível apenas para eventos FREE." },
        { status: 400 }
      );
    }

    let attendeeName = "";
    let code = "";
    let linkedTicketId: string | null = null;

    // 1) Fluxo por guestSlug (convite individual / convidado)
    if (guestSlug) {
      const guest = await prisma.eventGuest.findUnique({
        where: { slug: guestSlug },
        select: {
          id: true,
          slug: true,
          name: true,
          eventId: true,
          confirmedAt: true,
        },
      });

      if (!guest || guest.eventId !== eventId) {
        return NextResponse.json({ error: "Convidado inválido para este evento." }, { status: 404 });
      }

      if (!guest.confirmedAt) {
        return NextResponse.json({ error: "Este convite ainda não confirmou presença." }, { status: 400 });
      }

      attendeeName = guest.name;
      code = guest.slug;

      // Se estiver logado, garante que exista Ticket vinculado a esse guest (guestId)
      if (sessionUser?.id) {
        const existing = await prisma.ticket.findFirst({
          where: { guestId: guest.id },
          select: { id: true },
        });

        if (existing) {
          linkedTicketId = existing.id;
          await prisma.ticket.update({
            where: { id: existing.id },
            data: {
              userId: sessionUser.id,
              eventId,
              attendeeName: guest.name,
              status: "ACTIVE",
            },
          });
        } else {
          const created = await prisma.ticket.create({
            data: {
              eventId,
              userId: sessionUser.id,
              attendeeName: guest.name,
              guestId: guest.id,
              status: "ACTIVE",
            },
            select: { id: true },
          });
          linkedTicketId = created.id;
        }
      }
    } else {
      // 2) Fluxo "link aberto": usuário digita nome e quer gerar ingresso
      if (!rawName) {
        return NextResponse.json({ error: "Nome é obrigatório para gerar o ingresso." }, { status: 400 });
      }

      attendeeName = rawName;

      // Se estiver logado, transforma esse nome em "convidado de verdade" + "ticket de verdade"
      if (sessionUser?.id) {
        const createdGuest = await prisma.eventGuest.create({
          data: {
            eventId,
            name: rawName,
            slug: makeGuestSlug(eventId),
            confirmedAt: new Date(),
          },
          select: { id: true, slug: true },
        });

        code = createdGuest.slug;

        const createdTicket = await prisma.ticket.create({
          data: {
            eventId,
            userId: sessionUser.id,
            attendeeName: rawName,
            guestId: createdGuest.id,
            status: "ACTIVE",
          },
          select: { id: true },
        });

        linkedTicketId = createdTicket.id;
      } else {
        // Não logado: gera PDF sem persistir e usa um code "temporário"
        const eid = eventId.slice(0, 8);
        code = `${eid}-guest-${Math.random().toString(36).slice(2, 8)}`;
      }
    }

    // Gera PDF (determinístico quando code = guest.slug)
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
    draw(event.name, 14, true);

    const dateLabel = formatBRDate(event.eventDate) ?? "—";
    draw(`Data: ${dateLabel}`, 12, false);

    const loc = String(event.location ?? "").trim();
    draw(`Local: ${loc || "—"}`, 12, false);

    y -= 8;
    draw(`Participante: ${attendeeName}`, 13, true);

    y -= 8;
    draw(`Código: ${code}`, 12, false);

    if (linkedTicketId) {
      y -= 6;
      draw(`Ticket ID: ${linkedTicketId}`, 10, false);
    }

    y -= 14;
    draw("Apresente este ingresso na entrada do evento.", 11, false);

    const bytes = await doc.save();

    const safeEvent = event.name
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);

    const filename = `ingresso-${safeEvent || "evento"}-${eventId.slice(0, 6)}.pdf`;

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[GET /api/events/[id]/ticket] Erro inesperado:", err);
    return NextResponse.json({ error: "Erro ao gerar ingresso em PDF." }, { status: 500 });
  }
}
