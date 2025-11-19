import Link from "next/link";

type PageProps = {
  params: {
    id: string;
  };
};

export default function EventoConfirmadosPage({ params }: PageProps) {
  const { id } = params;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <Link
          href={`/eventos/${id}/free`}
          className="text-xs font-medium text-slate-300 hover:text-slate-100"
        >
          ← Voltar para o evento
        </Link>

        <h1 className="text-sm sm:text-base font-semibold">
          Lista de confirmados
        </h1>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-3xl w-full mx-auto flex flex-col gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-slate-50 mb-2">
            Confirmados neste evento
          </h2>
          <p className="text-sm text-slate-300">
            Aqui terá a lista de pessoas que confirmaram presença para este
            evento.
          </p>
          <p className="mt-2 text-[11px] text-slate-500">
            No futuro, esta lista será preenchida automaticamente conforme as
            pessoas confirmarem presença através do link de convite.
          </p>
        </div>
      </main>
    </div>
  );
}
