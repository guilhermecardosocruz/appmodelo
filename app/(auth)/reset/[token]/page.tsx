"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { passwordSchema } from "@/lib/validation";
import { z } from "zod";

type ResetForm = {
  password: string;
  confirmPassword: string;
};

const resetFormSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não conferem",
  });

export default function ResetPasswordPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;
  const [form, setForm] = useState<ResetForm>({
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ResetForm, string>>>(
    {}
  );
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | undefined>();
  const [globalSuccess, setGlobalSuccess] = useState<string | undefined>();

  const handleChange = (field: keyof ResetForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(undefined);
    setGlobalSuccess(undefined);

    try {
      const parsed = resetFormSchema.parse(form);
      setErrors({});
      setSubmitting(true);

      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: parsed.password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setGlobalError(data.message ?? "Erro ao redefinir senha");
        return;
      }

      setGlobalSuccess("Senha redefinida com sucesso! Redirecionando...");
      setTimeout(() => {
        router.push("/login");
      }, 1000);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        const fieldErrors = err.flatten().fieldErrors as Record<string, string[]>;
        setErrors({
          password: fieldErrors.password?.[0],
          confirmPassword: fieldErrors.confirmPassword?.[0],
        });
      } else {
        setGlobalError("Erro inesperado ao redefinir senha");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <AuthLayout
        title="Link inválido"
        subtitle="O link de redefinição parece estar incorreto."
      >
        <div className="space-y-4 text-sm text-slate-300">
          <p>Verifique se copiou o link completo do e-mail.</p>
          <Link href="/recover" className="text-indigo-300 hover:text-indigo-200">
            Solicitar um novo link de recuperação
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Definir nova senha"
      subtitle="Escolha uma nova senha forte para sua conta."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-200">Nova senha</span>
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
          {submitting ? "Salvando..." : "Salvar nova senha"}
        </Button>

        <FormMessage type="error" message={globalError} />
        <FormMessage type="success" message={globalSuccess} />
      </form>
    </AuthLayout>
  );
}
