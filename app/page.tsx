import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen px-4 py-14">
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">
            Plataforma de eventos
          </p>

          <h1 className="mt-3 text-3xl font-semibold text-slate-900">
            Crie, divulgue e gerencie seus eventos
          </h1>

          <p className="mt-3 text-sm text-slate-600">
            Painel simples para organizar eventos, convites e checkout.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Entrar
            </Link>

            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Criar conta
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
