"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { loginSchema } from "@/lib/validation";
import { z } from "zod";
import { useRouter } from "next/navigation";

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState<LoginForm>({
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof LoginForm, string>>>(
    {}
  );
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | undefined>();
  const [globalSuccess, setGlobalSuccess] = useState<string | undefined>();

  const handleChange = (field: keyof LoginForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(undefined);
    setGlobalSuccess(undefined);

    try {
      const parsed = loginSchema.parse(form);
      setErrors({});
      setSubmitting(true);

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setGlobalError(data.message ?? "Credenciais inválidas");
        return;
      }

      setGlobalSuccess("Login realizado com sucesso!");
      setTimeout(() => {
        router.push("/dashboard");
      }, 800);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        const fieldErrors = err.flatten().fieldErrors;
        setErrors({
          email: fieldErrors.email?.[0],
          password: fieldErrors.password?.[0],
        });
      } else {
        setGlobalError("Erro inesperado ao fazer login");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Bem-vindo de volta"
      subtitle="Acesse sua conta para continuar."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          type="email"
          label="E-mail"
          placeholder="voce@exemplo.com"
          autoComplete="email"
          value={form.email}
          onChange={(e) => handleChange("email", e.target.value)}
          error={errors.email}
        />

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-200">Senha</span>
            <button
              type="button"
              className="text-xs text-indigo-300 hover:text-indigo-200"
              onClick={() => setShowPassword((prev) => !prev)}
            >
              {showPassword ? "Ocultar" : "Mostrar"} senha
            </button>
          </div>
          <Input
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => handleChange("password", e.target.value)}
            error={errors.password}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400">
          <Link href="/recover" className="hover:text-indigo-300">
            Esqueci minha senha
          </Link>
          <Link href="/register" className="hover:text-indigo-300">
            Criar conta
          </Link>
        </div>

        <Button type="submit" className="mt-2 w-full" disabled={submitting}>
          {submitting ? "Entrando..." : "Entrar"}
        </Button>

        <FormMessage type="error" message={globalError} />
        <FormMessage type="success" message={globalSuccess} />
      </form>
    </AuthLayout>
  );
}
