"use client";

import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();

  function handleLogout() {
    // TODO: implementar logout real (limpar sessão/cookies) quando tivermos auth de verdade.
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <div className="text-sm font-semibold tracking-tight text-slate-400">
          Painel
        </div>

        <button
          onClick={handleLogout}
          className="inline-flex items-center rounded-full border border-slate-700 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          Sair
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center px-4">
        <p className="text-sm text-slate-400">
          Área logada pronta para receber o dashboard.
        </p>
      </main>
    </div>
  );
}
