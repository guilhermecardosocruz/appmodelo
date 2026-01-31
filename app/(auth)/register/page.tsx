import { Suspense } from "react";
import RegisterClient from "./RegisterClient";

type RegisterPageProps = {
  searchParams?: {
    redirect?: string;
    [key: string]: string | string[] | undefined;
  };
};

export default function RegisterPage({ searchParams }: RegisterPageProps) {
  const redirectParamRaw = searchParams?.redirect;
  const redirect =
    typeof redirectParamRaw === "string"
      ? redirectParamRaw
      : Array.isArray(redirectParamRaw)
      ? redirectParamRaw[0]
      : undefined;

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center px-4 py-8">
          <p className="text-sm text-muted">Carregando formulário...</p>
        </div>
      }
    >
      <RegisterClient redirect={redirect} />
    </Suspense>
  );
}
