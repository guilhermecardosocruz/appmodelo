import type { ReactNode } from "react";
import { AppTopbar } from "@/components/AppTopbar";

type Props = {
  children: ReactNode;
};

export default function AuthLayout({ children }: Props) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <AppTopbar />
      <main className="pt-14">{children}</main>
    </div>
  );
}
