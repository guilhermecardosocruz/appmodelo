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
      const url = new URL(
        "/api/auth/google/redirect",
        origin || "http://localhost:3000",
      );
      if (nextPath) {
        url.searchParams.set("next", nextPath);
      }
      window.location.href = url.toString();
    } catch (err) {
      console.error("[LoginClient] Erro ao iniciar login com Google:", err);
      setGlobalError("Não foi possível iniciar o login com Google.");
    }
  };

  const handleAppleLogin = () => {
    try {
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const url = new URL(
        "/api/auth/apple/redirect",
        origin || "http://localhost:3000",
      );
      if (nextPath) {
        url.searchParams.set("next", nextPath);
      }
      window.location.href = url.toString();
    } catch (err) {
      console.error("[LoginClient] Erro ao iniciar login com Apple:", err);
      setGlobalError("Não foi possível iniciar o login com Apple.");
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
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-card text-sm font-medium text-app hover:bg-card-strong"
            disabled={submitting}
            onClick={handleGoogleLogin}
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
              >
                <path
                  d="M21.6 12.23c0-.63-.06-1.25-.17-1.85H12v3.5h5.4a4.6 4.6 0 0 1-2 3.02v2.5h3.2c1.87-1.72 3-4.25 3-7.17Z"
                  fill="#4285F4"
                />
                <path
                  d="M12 22c2.7 0 4.97-.9 6.63-2.4l-3.2-2.5c-.9.6-2.03.95-3.43.95-2.63 0-4.86-1.78-5.66-4.17H3.04v2.6A9.99 9.99 0 0 0 12 22Z"
                  fill="#34A853"
                />
                <path
                  d="M6.34 13.88A5.98 5.98 0 0 1 5.98 12c0-.65.11-1.28.35-1.88V7.52H3.04A9.99 9.99 0 0 0 2 12c0 1.6.38 3.1 1.04 4.48l3.3-2.6Z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 6.25c1.47 0 2.78.5 3.81 1.48l2.85-2.85C16.96 3.3 14.7 2.4 12 2.4A9.99 9.99 0 0 0 3.04 7.52l3.29 2.6C7.14 8.03 9.37 6.25 12 6.25Z"
                  fill="#EA4335"
                />
              </svg>
            </span>
            <span>Entrar com Google</span>
          </Button>

          <Button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-card text-sm font-medium text-app hover:bg-card-strong"
            disabled={submitting}
            onClick={handleAppleLogin}
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-black text-white shadow-sm">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
              >
                <path
                  d="M16.365 2.43c0 1.047-.384 1.93-1.154 2.67-.77.73-1.7 1.153-2.71 1.074-.06-1.02.405-1.94 1.156-2.66.77-.72 1.86-1.18 2.708-1.23zM19.42 17.22c-.44 1.02-.65 1.47-1.22 2.37-.79 1.23-1.9 2.77-3.29 2.78-1.23.01-1.55-.82-3.23-.81-1.68.01-2.04.82-3.27.8-1.39-.01-2.45-1.4-3.24-2.62-2.22-3.4-2.45-7.38-1.08-9.49.97-1.5 2.51-2.39 3.96-2.39 1.47 0 2.39.81 3.6.81 1.19 0 1.9-.81 3.59-.81 1.3 0 2.68.71 3.65 1.94-3.21 1.76-2.69 6.34.58 7.32z"
                  fill="currentColor"
                />
              </svg>
            </span>
            <span>Entrar com Apple</span>
          </Button>
        </div>

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
