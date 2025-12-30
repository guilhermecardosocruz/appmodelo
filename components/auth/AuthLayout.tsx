import Link from "next/link";

type AuthLayoutProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>PWA pronto para instalar</span>
          </div>

          <h1 className="mt-4 text-2xl font-semibold text-slate-900">
            {title}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {children}
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          &copy; {new Date().getFullYear()} Eventos.{" "}
          <Link href="#" className="underline underline-offset-2">
            Termos &amp; Privacidade
          </Link>
        </p>
      </div>
    </div>
  );
}
