"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  redirect?: string;
};

export default function RegisterClient({ redirect }: Props) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName || !trimmedEmail || !password || !confirmPassword) {
      setError("Preencha todos os campos.");
      return;
    }

    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas não conferem.");
      return;
    }

    try {
      setSubmitting(true);

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          password,
        }),
      });

      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!res.ok) {
        setError(
          data?.error ??
            "Não foi possível criar sua conta. Tente novamente em instantes.",
        );
        return;
      }

      setSuccess("Conta criada com sucesso! Redirecionando...");
      setTimeout(() => {
        router.push(redirect || "/dashboard");
      }, 600);
    } catch (err) {
      console.error("[RegisterClient] Erro ao registrar:", err);
      setError("Erro inesperado ao registrar. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-card px-4 py-6 shadow-sm">
        <div className="mb-4 text-center space-y-1">
          <h1 className="text-lg font-semibold text-app">Criar conta</h1>
          <p className="text-xs text-muted">
            Use seu e-mail e uma senha para acessar seus eventos e ingressos.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted" htmlFor="name">
              Nome completo
            </label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
              disabled={submitting}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted" htmlFor="email">
              E-mail
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@exemplo.com"
              disabled={submitting}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-medium text-muted"
              htmlFor="password"
            >
              Senha
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              disabled={submitting}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-medium text-muted"
              htmlFor="confirmPassword"
            >
              Confirmar senha
            </label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repita a senha"
              disabled={submitting}
            />
          </div>

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          {success && (
            <p className="text-xs text-emerald-500">{success}</p>
          )}

          <Button
            type="submit"
            disabled={submitting}
            className="w-full mt-1"
          >
            {submitting ? "Criando conta..." : "Criar conta"}
          </Button>
        </form>

        <p className="mt-4 text-[11px] text-center text-muted">
          Já tem conta?{" "}
          <a
            href="/login"
            className="font-medium text-app hover:underline"
          >
            Entrar
          </a>
        </p>
      </div>
    </div>
  );
}
