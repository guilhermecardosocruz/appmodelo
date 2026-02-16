import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

async function canPurgeEvent(eventId: string) {
  const ev = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, type: true, isClosed: true },
  });
  if (!ev) return { ok: false, reason: "Evento não encontrado." };

  // tickets e pagamentos "pre" são pendência forte
  const [ticketCount, paymentCount] = await Promise.all([
    prisma.ticket.count({ where: { eventId } }),
    prisma.payment.count({ where: { eventId } }),
  ]);

  if (ticketCount > 0) {
    return { ok: false, reason: "Não é possível apagar definitivamente: há ingressos vinculados." };
  }
  if (paymentCount > 0) {
    return { ok: false, reason: "Não é possível apagar definitivamente: há pagamentos vinculados." };
  }

  if (ev.type === "POS_PAGO") {
    if (!ev.isClosed) {
      return { ok: false, reason: "Não é possível apagar definitivamente: o racha ainda não foi encerrado." };
    }

    const pendingPostPays = await prisma.postEventPayment.count({
      where: { eventId, status: { not: "PAID" } },
    });
    if (pendingPostPays > 0) {
      return { ok: false, reason: "Não é possível apagar definitivamente: existem pagamentos do racha pendentes." };
    }

    const expCount = await prisma.postEventExpense.count({ where: { eventId } });
    if (expCount > 0) {
      return { ok: false, reason: "Não é possível apagar definitivamente: existem despesas registradas no racha." };
    }
  }

  return { ok: true as const };
}

export async function DELETE(req: NextRequest, context: Ctx) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { id: eventId } = await context.params;
    if (!eventId) {
      return NextResponse.json({ error: "ID do evento é obrigatório." }, { status: 400 });
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizerId: true, deletedAt: true },
    });

    if (!event) {
      return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
    }

    if (event.organizerId && event.organizerId !== user.id) {
      return NextResponse.json(
        { error: "Somente o organizador pode apagar definitivamente este evento." },
        { status: 403 },
      );
    }

    if (!event.deletedAt) {
      return NextResponse.json(
        { error: "Este evento não está na lixeira." },
        { status: 400 },
      );
    }

    const check = await canPurgeEvent(eventId);
    if (!check.ok) {
      return NextResponse.json({ error: check.reason }, { status: 400 });
    }

    // Sem pendências pelo nosso critério: remove o evento.
    // (As relações mais pesadas já foram bloqueadas acima, então aqui tende a ser seguro.)
    await prisma.event.delete({ where: { id: eventId } });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[DELETE /api/events/[id]/purge] erro:", err);
    return NextResponse.json({ error: "Erro ao apagar definitivamente." }, { status: 500 });
  }
}
