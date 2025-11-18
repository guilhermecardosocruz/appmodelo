import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl bg-slate-900/80 p-8 text-center text-slate-50 shadow-xl shadow-black/50">
        <h1 className="text-2xl font-semibold">Auth PWA App</h1>
        <p className="mt-2 text-sm text-slate-400">
          Autenticação moderna, responsiva e pronta para PWA.
        </p>
        <div className="mt-6 flex justify-center gap-3 text-sm">
          <Link
            href="/login"
            className="rounded-lg bg-indigo-500 px-4 py-2 font-semibold text-white hover:bg-indigo-400"
          >
            Entrar
          </Link>
          <Link
            href="/register"
            className="rounded-lg border border-slate-600 px-4 py-2 font-semibold text-slate-200 hover:bg-slate-800"
          >
            Criar conta
          </Link>
        </div>
      </div>
    </main>
  );
}
