import "./globals.css";
import { PwaProvider } from "@/components/PwaProvider";
import { MercadoPagoProvider } from "@/components/MercadoPagoProvider";

export const metadata = {
  title: "Eventos",
  description: "App de eventos",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <PwaProvider>
          <MercadoPagoProvider>
            {children}
          </MercadoPagoProvider>
        </PwaProvider>
      </body>
    </html>
  );
}
