type PageProps = {
  params: {
    slug: string;
  };
};

export default function ConvitePage({ params }: PageProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center">
        <h1 className="text-lg font-semibold mb-2">
          Confirmação de presença
        </h1>
        <p className="text-sm text-slate-300">
          Aqui terá a lógica de confirmação para o convite:
        </p>
        <p className="mt-2 text-xs text-emerald-400 break-all">
          {params.slug}
        </p>
        <p className="mt-4 text-[11px] text-slate-500">
          No futuro, você poderá confirmar presença por aqui e vamos preencher
          automaticamente a lista de confirmados do evento.
        </p>
      </div>
    </div>
  );
}
