"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { registerSchema } from "@/lib/validation";
import { z } from "zod";
import { useRouter } from "next/navigation";

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState<RegisterForm>({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<
    Partial<Record<keyof RegisterForm, string>>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | undefined>();
  const [globalSuccess, setGlobalSuccess] = useState<string | undefined>();
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (field: keyof RegisterForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(undefined);
    setGlobalSuccess(undefined);

    try {
      const parsed = registerSchema.parse(form);
      setErrors({});
      setSubmitting(true);

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setGlobalError(data.message ?? "Erro ao criar conta");
        return;
      }

      setGlobalSuccess("Conta criada com sucesso! Redirecionando para login...");
      setTimeout(() => {
        router.push("/login");
      }, 1000);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        const fieldErrors = err.flatten().fieldErrors as Record<string, string[]>;
        setErrors({
          name: fieldErrors.name?.[0],
          email: fieldErrors.email?.[0],
          password: fieldErrors.password?.[0],
          confirmPassword: fieldErrors.confirmPassword?.[0],
        });
      } else {
        setGlobalError("Erro inesperado ao criar conta");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Criar conta"
      subtitle="Leva menos de um minuto para começar."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Nome completo"
          placeholder="Seu nome"
          autoComplete="name"
          value={form.name}
          onChange={(e) => handleChange("name", e.target.value)}
          error={errors.name}
        />

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
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => handleChange("password", e.target.value)}
            error={errors.password}
          />
          <p className="mt-1 text-xs text-slate-400">
            Use pelo menos 8 caracteres, com maiúsculas, minúsculas, número e
            símbolo.
          </p>
        </div>

        <Input
          type={showPassword ? "text" : "password"}
          label="Confirmar senha"
          placeholder="Repita a senha"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={(e) =>
            handleChange("confirmPassword", e.target.value)
          }
          error={errors.confirmPassword}
        />

        <Button type="submit" className="mt-2 w-full" disabled={submitting}>
          {submitting ? "Criando conta..." : "Criar conta"}
        </Button>

        <p className="mt-2 text-center text-xs text-slate-400">
          Já tem conta?{" "}
          <Link href="/login" className="text-indigo-300 hover:text-indigo-200">
            Entrar
          </Link>
        </p>

        <FormMessage type="error" message={globalError} />
        <FormMessage type="success" message={globalSuccess} />
      </form>
    </AuthLayout>
  );
}
