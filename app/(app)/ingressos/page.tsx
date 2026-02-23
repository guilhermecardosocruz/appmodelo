import { Suspense } from "react";
import IngressosClient from "./IngressosClient";

export default function IngressosPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-app text-app flex items-center justify-center">
          <p className="text-sm text-muted">Carregando ingressos...</p>
        </div>
      }
    >
      <IngressosClient />
    </Suspense>
  );
}
