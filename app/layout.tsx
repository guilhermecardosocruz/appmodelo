import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { PwaProvider } from "@/components/PwaProvider";
import { MercadoPagoProvider } from "@/components/MercadoPagoProvider";

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
      <body>
        {/* PWA só como efeito colateral */}
        <PwaProvider />
        {/* Mercado Pago envolvendo a árvore */}
        <MercadoPagoProvider>
          {children}
        </MercadoPagoProvider>
      </body>
    </html>
  );
}
