import { prisma } from "@/lib/prisma";
import Link from "next/link";

type PageProps = {
  params: {
    id: string;
  };
};

function getTypeLabel(type: string) {
  switch (type) {
    case "PRE_PAGO":
      return "Pré pago";
    case "POS_PAGO":
      return "Pós pago";
    case "FREE":
      return "Free";
    default:
      return type;
  }
}

function getTypeDescription(type: string) {
  if (type === "PRE_PAGO") {
    return "Aqui terá a lógica do evento pré pago.";
  }
  if (type === "POS_PAGO") {
    return "Aqui terá a lógica do evento pós pago.";
  }
  if (type === "FREE") {
    return "Aqui terá a lógica do evento free.";
  }
  return "Tipo de evento não reconhecido.";
}

export default async function EventPage({ params }: PageProps) {
  const event = await prisma.event.findUnique({
    where: { id: params.id },
  });

  if (!event) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center justify-center px-4">
        <p className="text-sm text-slate-300 mb-4">
          Evento não encontrado.
        </p>
        <Link
          href="/dashboard"
          className="text-xs font-medium text-indigo-400 hover:text-indigo-300"
        >
          Voltar para o painel
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <Link
          href="/dashboard"
          className="text-xs font-medium text-slate-300 hover:text-slate-100"
        >
          ← Voltar
        </Link>

        <span className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-300 border border-slate-700">
          {getTypeLabel(event.type)}
        </span>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-3xl w-full mx-auto flex flex-col gap-4">
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-50">
          {event.name}
        </h1>

        <p className="text-sm text-slate-300">
          {getTypeDescription(event.type)}
        </p>

        <p className="mt-4 text-xs text-slate-500">
          (Mais tarde aqui vamos colocar toda a lógica de programação detalhada
          desse tipo de evento, integrações, regras e fluxo completo.)
        </p>
      </main>
    </div>
  );
}
