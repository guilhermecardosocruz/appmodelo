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

// GET /api/events/[id]/ticket?name=...&guestSlug=...
// - Sempre retorna um PDF
// - ✅ NOVO: não existe mais "1 ticket por evento por usuário"
// - ✅ Se vier guestSlug e estiver logado: garante Ticket amarrado ao EventGuest (guestId @unique)
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

    let attendeeName = sessionUser?.name ?? rawName;
    let code = "";

    // ✅ Quando for ingresso individual (guestSlug), o código é estável e o ticket pode ser persistido
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
        return NextResponse.json(
          { error: "Este convite ainda não confirmou presença." },
          { status: 400 }
        );
      }

      attendeeName = guest.name;
      code = guest.slug;

      // ✅ Se estiver logado, garante que exista 1 Ticket por convidado (guestId @unique)
      if (sessionUser?.id) {
        const existing = await prisma.ticket.findUnique({
          where: { guestId: guest.id },
          select: { id: true, userId: true },
        });

        // evita "sequestro" do ticket por outro usuário
        if (existing && existing.userId !== sessionUser.id) {
          return NextResponse.json(
            { error: "Este ingresso já pertence a outro usuário." },
            { status: 403 }
          );
        }

        await prisma.ticket.upsert({
          where: { guestId: guest.id },
          update: {
            status: "ACTIVE",
            attendeeName: guest.name,
            eventId: eventId,
            userId: sessionUser.id,
          },
          create: {
            eventId: eventId,
            userId: sessionUser.id,
            attendeeName: guest.name,
            status: "ACTIVE",
            guestId: guest.id,
          },
        });
      }
    } else {
      // ⚠️ Sem guestSlug: ainda gera PDF, mas NÃO cria ticket real (porque ticket real precisa ser por convidado)
      if (!attendeeName) {
        return NextResponse.json({ error: "Nome é obrigatório para gerar o ingresso." }, { status: 400 });
      }

      const eid = eventId.slice(0, 8);
      const uid = sessionUser?.id ? sessionUser.id.slice(0, 8) : "guest";
      code = `${eid}-${uid}-${Math.random().toString(36).slice(2, 8)}`;
    }

    // PDF
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
