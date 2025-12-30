import Link from "next/link";

type AuthLayoutProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-card px-3 py-1 text-xs text-muted shadow">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>PWA pronto para instalar</span>
          </div>
          <h1 className="mt-4 text-2xl font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-card-strong p-6 shadow-xl shadow-black/10">
          {children}
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          &copy; {new Date().getFullYear()} AuthApp.{" "}
          <Link href="#" className="underline underline-offset-2">
            Termos &amp; Privacidade
          </Link>
        </p>
      </div>
    </div>
  );
}
