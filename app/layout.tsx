import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { PwaProvider } from "@/components/PwaProvider";
import { MercadoPagoProvider } from "@/components/MercadoPagoProvider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AppTopbar } from "@/components/AppTopbar";

export const metadata: Metadata = {
  title: "Eventos",
  description: "App de eventos",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen pt-14 bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-50">
        {/* PWA só como efeito colateral */}
        <PwaProvider />
        <ThemeProvider>
          <AppTopbar />
          {/* Mercado Pago envolvendo a árvore */}
          <MercadoPagoProvider>{children}</MercadoPagoProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
