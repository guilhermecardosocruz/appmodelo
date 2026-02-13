"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type MeOk = {
  authenticated: true;
  user: { id: string; name: string; email: string; pixKey: string | null };
};

type MeResponse =
  | MeOk
  | { authenticated: false }
  | { error?: string }
  | unknown;

type ProfilePatchOk = {
  user: { id: string; name: string; email: string; pixKey: string | null };
};

type ProfilePatchErr = {
  error?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isMeOk(v: unknown): v is MeOk {
  if (!isRecord(v)) return false;
  if (v["authenticated"] !== true) return false;

  const user = v["user"];
  if (!isRecord(user)) return false;

  return (
    typeof user["id"] === "string" &&
    typeof user["name"] === "string" &&
    typeof user["email"] === "string" &&
    (typeof user["pixKey"] === "string" || user["pixKey"] === null)
  );
}

function isProfilePatchOk(v: unknown): v is ProfilePatchOk {
  if (!isRecord(v)) return false;

  const user = v["user"];
  if (!isRecord(user)) return false;

  return (
    typeof user["id"] === "string" &&
    typeof user["name"] === "string" &&
    typeof user["email"] === "string" &&
    (typeof user["pixKey"] === "string" || user["pixKey"] === null)
  );
}

function getErrorMessage(data: unknown): string {
  if (isRecord(data) && typeof data["error"] === "string" && data["error"]) {
    return data["error"];
  }
  return "Erro ao salvar.";
}

export default function ConfiguracoesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [pixKey, setPixKey] = useState<string>("");

  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const hasPixKey = useMemo(() => pixKey.trim().length > 0, [pixKey]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        setOk(null);

        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) {
          if (!active) return;
          setError("Você precisa estar logado para acessar as configurações.");
          return;
        }

        const data = (await res.json().catch(() => null)) as MeResponse;
        if (!active) return;

        if (!isMeOk(data)) {
          setError("Você precisa estar logado para acessar as configurações.");
          return;
        }

        const user = data.user;
        setName(user.name ?? "");
        setEmail(user.email ?? "");
        setPixKey(user.pixKey ?? "");
      } catch {
        if (!active) return;
        setError("Erro ao carregar suas configurações.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  async function save() {
    try {
      setSaving(true);
      setError(null);
      setOk(null);

      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pixKey }),
      });

      const data = (await res.json().catch(() => null)) as
        | ProfilePatchOk
        | ProfilePatchErr
        | null;

      if (!res.ok) {
        setError(getErrorMessage(data));
        return;
      }

      setOk("Configurações salvas.");

      const newPix = isProfilePatchOk(data) ? data.user.pixKey : null;
      setPixKey(newPix ?? "");
    } catch {
      setError("Erro inesperado ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-app text-app">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-card">
        <Link
          href="/dashboard"
          className="text-xs font-medium text-muted hover:text-app"
        >
          ← Voltar
        </Link>

        <span className="inline-flex items-center rounded-full bg-card px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted border border-[var(--border)]">
          Configurações
        </span>
      </header>

      <main className="px-4 py-6 sm:px-6 lg:px-8 max-w-xl w-full mx-auto flex flex-col gap-4">
        {loading && <p className="text-sm text-muted">Carregando...</p>}

        {!loading && (
          <section className="rounded-2xl border border-[var(--border)] bg-card p-4 sm:p-6 space-y-4">
            <div className="space-y-1">
              <h1 className="text-lg sm:text-xl font-semibold text-app">
                Minha conta
              </h1>
              <p className="text-sm text-muted">
                Cadastre sua chave PIX para receber pagamentos no pós-pago.
              </p>
            </div>

            {error && <p className="text-[11px] text-red-500">{error}</p>}
            {ok && (
              <p className="text-[11px] text-emerald-500 font-semibold">{ok}</p>
            )}

            <div className="grid grid-cols-1 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">Nome</label>
                <input
                  value={name}
                  readOnly
                  className="rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app opacity-80"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">E-mail</label>
                <input
                  value={email}
                  readOnly
                  className="rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app opacity-80"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">
                  Chave PIX
                </label>
                <input
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  placeholder="Ex.: cpf, email, telefone ou aleatória"
                  className="rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app placeholder:text-app0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                />
                <p className="text-[10px] text-app0">
                  {hasPixKey
                    ? "Chave informada."
                    : "Você ainda não cadastrou uma chave PIX."}
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
