import Link from "next/link";
import ConfirmadosClient from "./ConfirmadosClient";

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
        <ConfirmadosClient />
      </main>
    </div>
  );
}
