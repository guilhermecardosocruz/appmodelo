import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, context: Ctx) {
  try {
    const user = await getSessionUser(req);
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { id: eventId } = await context.params;
    if (!eventId) return NextResponse.json({ error: "ID do evento é obrigatório." }, { status: 400 });

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizerId: true, type: true, isClosed: true, deletedAt: true },
    });

    if (!event) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });

    const isOrganizer = !event.organizerId || event.organizerId === user.id;
    if (!isOrganizer) {
      return NextResponse.json({ error: "Somente o organizador pode excluir definitivamente." }, { status: 403 });
    }

    // ✅ só permite purge se estiver na lixeira do evento
    if (!event.deletedAt) {
      return NextResponse.json(
        { error: "Envie para a lixeira antes de excluir definitivamente." },
        { status: 400 },
      );
    }

    const [ticketCount, paymentCount] = await Promise.all([
      prisma.ticket.count({ where: { eventId } }),
      prisma.payment.count({ where: { eventId } }),
    ]);

    if (ticketCount > 0 || paymentCount > 0) {
      return NextResponse.json(
        { error: "Há pendências (tickets/pagamentos) vinculadas. Não é possível excluir definitivamente." },
        { status: 400 },
      );
    }

    if (event.type === "POS_PAGO") {
      if (!event.isClosed) {
        return NextResponse.json(
          { error: "O racha precisa estar encerrado para excluir definitivamente." },
          { status: 400 },
        );
      }

      const pendingPostPayments = await prisma.postEventPayment.count({
        where: { eventId, status: { not: "PAID" } },
      });

      if (pendingPostPayments > 0) {
        return NextResponse.json(
          { error: "Há pagamentos do racha pendentes. Não é possível excluir definitivamente." },
          { status: 400 },
        );
      }

      const expensesCount = await prisma.postEventExpense.count({
        where: { eventId },
      });

      if (expensesCount > 0) {
        return NextResponse.json(
          { error: "Ainda existem despesas registradas no racha. Finalize/zerar antes de excluir definitivamente." },
          { status: 400 },
        );
      }
    }

    await prisma.event.delete({ where: { id: eventId } });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[DELETE /api/events/[id]/purge] erro:", err);
    return NextResponse.json({ error: "Erro ao excluir definitivamente." }, { status: 500 });
  }
}
