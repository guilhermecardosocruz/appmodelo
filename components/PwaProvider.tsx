"use client";

import { useEffect } from "react";

export function PwaProvider() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const isProd = process.env.NODE_ENV === "production";
    if (!isProd) return;

    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    async function setup() {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");

        // tenta atualizar sempre que abrir
        try {
          await reg.update();
        } catch {
          // ignore
        }

        // se um novo SW assumir controle, recarrega para alinhar chunks
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (cancelled) return;
          window.location.reload();
        });
      } catch (err) {
        console.error("Erro ao registrar service worker", err);

        // fallback: se falhar, tenta desregistrar qualquer SW antigo
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        } catch {
          // ignore
        }
      }
    }

    void setup();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
