"use client";

import { initMercadoPago } from "@mercadopago/sdk-react";
import { useEffect, ReactNode } from "react";

export function MercadoPagoProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY;
    initMercadoPago(key!, { locale: "pt-BR" });
  }, []);

  return <>{children}</>;
}
