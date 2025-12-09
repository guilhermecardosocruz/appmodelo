"use client";

import { ReactNode } from "react";

/**
 * Provider "no-op": mantido só para não quebrar imports,
 * mas não inicializa mais o SDK React do Mercado Pago.
 */
export function MercadoPagoProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
