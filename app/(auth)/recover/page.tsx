/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { recoverSchema } from "@/lib/validation";
import { z } from "zod";

type RecoverForm = z.infer<typeof recoverSchema>;

export default function RecoverPage() {
  const [form, setForm] = useState<RecoverForm>({ email: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof RecoverForm, string>>>(
    {}
  );
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | undefined>();
  const [globalSuccess, setGlobalSuccess] = useState<string | undefined>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(undefined);
    setGlobalSuccess(undefined);

    try {
      const parsed = recoverSchema.parse(form);
      setErrors({});
      setSubmitting(true);

      const res = await fetch("/api/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setGlobalError(data.message ?? "Erro ao solicitar recuperação");
        return;
      }

      setGlobalSuccess(
        "Se o e-mail existir, enviaremos um link de recuperação."
      );
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        const fieldErrors = err.flatten().fieldErrors as Record<string, string[]>;
        setErrors({
          email: fieldErrors.email?.[0],
        });
      } else {
        setGlobalError("Erro inesperado ao solicitar recuperação");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Recuperar senha"
      subtitle="Informe o e-mail cadastrado para receber um link."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          type="email"
          label="E-mail"
          placeholder="voce@exemplo.com"
          autoComplete="email"
          value={form.email}
          onChange={(e) => setForm({ email: e.target.value })}
          error={errors.email}
        />

        <Button type="submit" className="mt-2 w-full" disabled={submitting}>
          {submitting ? "Enviando..." : "Enviar link de recuperação"}
        </Button>

        <p className="mt-2 text-center text-xs text-slate-400">
          Lembrou a senha?{" "}
          <Link href="/login" className="text-indigo-300 hover:text-indigo-200">
            Voltar para login
          </Link>
        </p>

        <FormMessage type="error" message={globalError} />
        <FormMessage type="success" message={globalSuccess} />
      </form>
    </AuthLayout>
  );
}
