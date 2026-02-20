/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { loginSchema } from "@/lib/validation";
import { z } from "zod";
import { useRouter, useSearchParams } from "next/navigation";

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginClient() {
  const router = useRouter();
  const search = useSearchParams();

  const nextPath = useMemo(() => {
    const raw = String(search.get("next") ?? "").trim();
    if (!raw) return "/dashboard";
    if (!raw.startsWith("/")) return "/dashboard"; // evita open redirect
    return raw;
  }, [search]);

  const [form, setForm] = useState<LoginForm>({
    email: "",
    password: "",
  });

  const [errors, setErrors] = useState<Partial<Record<keyof LoginForm, string>>>(
    {},
  );
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | undefined>();
  const [globalSuccess, setGlobalSuccess] = useState<string | undefined>();

  const handleChange = (field: keyof LoginForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleGoogleLogin = () => {
    try {
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const url = new URL("/api/auth/google/redirect", origin || "http://localhost:3000");
      if (nextPath) {
        url.searchParams.set("next", nextPath);
      }
      window.location.href = url.toString();
    } catch (err) {
      console.error("[LoginClient] Erro ao iniciar login com Google:", err);
      setGlobalError("Não foi possível iniciar o login com Google.");
    }
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
        router.push(nextPath);
      }, 600);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        const fieldErrors = err.flatten().fieldErrors as Record<string, string[]>;
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
        {/* Login social */}
        <Button
          type="button"
          className="w-full bg-white text-slate-900 hover:bg-slate-100 text-sm font-medium"
          disabled={submitting}
          onClick={handleGoogleLogin}
        >
          Entrar com Google
        </Button>

        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <span className="h-px flex-1 bg-slate-700" />
          <span>ou entre com e-mail</span>
          <span className="h-px flex-1 bg-slate-700" />
        </div>

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
