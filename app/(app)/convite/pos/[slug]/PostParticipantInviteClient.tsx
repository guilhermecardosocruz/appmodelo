"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type EventType = "PRE_PAGO" | "POS_PAGO" | "FREE";

type Event = {
  id: string;
  name: string;
  type: EventType;
  description?: string | null;
  location?: string | null;
  eventDate?: string | null; // ISO
  organizerId?: string | null;
};

type PostParticipant = {
  id: string;
  name: string;
  userId?: string | null;
  createdAt?: string | null;
};

type MeResponse =
  | { authenticated: false }
  | {
      authenticated: true;
      user: {
        id: string;
        name: string;
        email: string;
      };
    };

type Props = {
  slug: string;
};

type SummaryResponse = {
  eventId: string;
  participants: { id: string; name: string }[];
  balances: {
    participantId: string;
    name: string;
    totalPaid: number;
    totalShare: number;
    balance: number;
    isCurrentUser: boolean;
  }[];
};

type ExpensesResponse = {
  expenses: Array<{
    id: string;
    description: string;
    totalAmount: string | number;
    createdAt: string;
    payer?: { id: string; name: string } | null;
    shares?: Array<{
      id: string;
      participant?: { id: string; name: string } | null;
      shareAmount: string | number;
    }>;
  }>;
};

function formatDate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  // Mantém simples (pt-BR), sem UTC fixo pra não surpreender o usuário
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function buildGoogleMapsUrl(location: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    location,
  )}`;
}

function buildWazeUrl(location: string) {
  return `https://waze.com/ul?q=${encodeURIComponent(location)}&navigate=yes`;
}

function normalizeAmount(raw: string): number | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;

  // aceita "12,34" e "1.234,56"
  const hasComma = trimmed.includes(",");
  const hasDot = trimmed.includes(".");

  let normalized = trimmed;

  if (hasComma && hasDot) {
    // "1.234,56" => remove milhares e troca decimal
    normalized = trimmed.replace(/\./g, "").replace(",", ".");
  } else if (hasComma && !hasDot) {
    normalized = trimmed.replace(",", ".");
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function PostParticipantInviteClient({ slug }: Props) {
  const params = useParams() as { slug?: string };

  const effectiveSlug = useMemo(() => {
    const raw = String(params?.slug ?? slug ?? "").trim();
    if (!raw || raw === "undefined" || raw === "null") return "";
    return raw;
  }, [params?.slug, slug]);

  const [event, setEvent] = useState<Event | null>(null);
  const [participant, setParticipant] = useState<PostParticipant | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionName, setSessionName] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);

  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Dados do racha
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [expenses, setExpenses] = useState<ExpensesResponse["expenses"]>([]);
  const [loadingRacha, setLoadingRacha] = useState(false);
  const [rachaError, setRachaError] = useState<string | null>(null);

  // Form item/despesa
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showPeople, setShowPeople] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addedOk, setAddedOk] = useState<string | null>(null);

  // 1) Carrega convite (evento + participante)
  useEffect(() => {
    let active = true;

    async function loadInvite() {
      try {
        setLoadingInvite(true);
        setInviteError(null);
        setEvent(null);
        setParticipant(null);
        setSummary(null);
        setExpenses([]);
        setRachaError(null);

        if (!effectiveSlug) {
          setInviteError("Código de convite inválido.");
          return;
        }

        const res = await fetch(
          `/api/events/post-participants/${encodeURIComponent(effectiveSlug)}`,
          { credentials: "include" },
        );

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          if (!active) return;

          if (res.status === 404) {
            setInviteError("Nenhum convite encontrado para este código.");
          } else {
            setInviteError(data?.error ?? "Erro ao carregar o convite.");
          }
          return;
        }

        const data = (await res.json()) as {
          event: Event;
          participant: PostParticipant;
        };

        if (!active) return;

        setEvent(data.event);
        setParticipant(data.participant);
      } catch (err) {
        console.error("[PostParticipantInviteClient] loadInvite:", err);
        if (!active) return;
        setInviteError("Erro inesperado ao carregar o convite.");
      } finally {
        if (!active) return;
        setLoadingInvite(false);
      }
    }

    void loadInvite();
    return () => {
      active = false;
    };
  }, [effectiveSlug]);

  // 2) Checa sessão
  useEffect(() => {
    let active = true;

    async function loadAuth() {
      try {
        setAuthLoading(true);
        const res = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        });

        if (!active) return;

        if (!res.ok) {
          setIsAuthenticated(false);
          setSessionName(null);
          setSessionEmail(null);
          setSessionUserId(null);
          return;
        }

        const data = (await res.json()) as MeResponse;
        if (!active) return;

        if (!("authenticated" in data) || !data.authenticated) {
          setIsAuthenticated(false);
          setSessionName(null);
          setSessionEmail(null);
          setSessionUserId(null);
          return;
        }

        setIsAuthenticated(true);
        setSessionName(data.user.name);
        setSessionEmail(data.user.email);
        setSessionUserId(data.user.id);
      } catch (err) {
        console.error("[PostParticipantInviteClient] loadAuth:", err);
        if (!active) return;
        setIsAuthenticated(false);
        setSessionName(null);
        setSessionEmail(null);
        setSessionUserId(null);
      } finally {
        if (!active) return;
        setAuthLoading(false);
      }
    }

    void loadAuth();
    return () => {
      active = false;
    };
  }, []);

  const formattedDate = formatDate(event?.eventDate);

  const trimmedLocation = useMemo(
    () => (event?.location ?? "").trim(),
    [event?.location],
  );
  const hasLocation = trimmedLocation.length > 0;

  const googleMapsUrl = useMemo(
    () => (hasLocation ? buildGoogleMapsUrl(trimmedLocation) : null),
    [hasLocation, trimmedLocation],
  );
  const wazeUrl = useMemo(
    () => (hasLocation ? buildWazeUrl(trimmedLocation) : null),
    [hasLocation, trimmedLocation],
  );

  const inviteAlreadyLinked = !!participant?.userId;
  const inviteLinkedToMe =
    inviteAlreadyLinked &&
    !!sessionUserId &&
    participant?.userId === sessionUserId;

  const inviteLinkedToOther =
    inviteAlreadyLinked &&
    !!sessionUserId &&
    participant?.userId != null &&
    participant?.userId !== sessionUserId;

  const isOrganizer =
    !!sessionUserId && !!event?.organizerId && event.organizerId === sessionUserId;

  const canAccessRacha = isAuthenticated && (inviteLinkedToMe || isOrganizer);

  const loginHref = `/login?next=${encodeURIComponent(
    effectiveSlug ? `/convite/pos/${effectiveSlug}` : "/dashboard",
  )}`;
  const registerHref = `/register?next=${encodeURIComponent(
    effectiveSlug ? `/convite/pos/${effectiveSlug}` : "/dashboard",
  )}`;

  // 3) Carrega dados do racha (summary + expenses) quando puder acessar
  useEffect(() => {
    let active = true;

    async function loadRacha() {
      try {
        if (!event?.id) return;
        if (!canAccessRacha) return;

        setLoadingRacha(true);
        setRachaError(null);

        const [sumRes, expRes] = await Promise.all([
          fetch(`/api/events/${encodeURIComponent(event.id)}/post-summary`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/events/${encodeURIComponent(event.id)}/post-expenses`, {
            credentials: "include",
            cache: "no-store",
          }),
        ]);

        if (!active) return;

        if (!sumRes.ok) {
          const data = await sumRes.json().catch(() => null);
          setRachaError(data?.error ?? "Erro ao carregar participantes do racha.");
          return;
        }

        if (!expRes.ok) {
          const data = await expRes.json().catch(() => null);
          setRachaError(data?.error ?? "Erro ao carregar itens do racha.");
          return;
        }

        const sumData = (await sumRes.json()) as SummaryResponse;
        const expData = (await expRes.json()) as ExpensesResponse;

        if (!active) return;

        setSummary(sumData);
        setExpenses(Array.isArray(expData.expenses) ? expData.expenses : []);

        // default: dividir com todos
        const all = sumData.participants.map((p) => p.id);
        setSelectedIds(all);
      } catch (err) {
        console.error("[PostParticipantInviteClient] loadRacha:", err);
        if (!active) return;
        setRachaError("Erro inesperado ao carregar dados do racha.");
      } finally {
        if (!active) return;
        setLoadingRacha(false);
      }
    }

    void loadRacha();
    return () => {
      active = false;
    };
  }, [event?.id, canAccessRacha]);

  const currentParticipantId = useMemo(() => {
    const b = summary?.balances?.find((x) => x.isCurrentUser);
    return b?.participantId ?? null;
  }, [summary?.balances]);

  const people = useMemo(() => summary?.participants ?? [], [summary?.participants]);

  const selectedLabel = useMemo(() => {
    const total = people.length;
    const selected = selectedIds.length;
    if (total === 0) return "Dividir";
    if (selected === 0) return "Dividir com ninguém";
    if (selected === total) return `Dividir com todos (${total})`;
    return `Dividir com ${selected}/${total}`;
  }, [people.length, selectedIds.length]);

  async function handleLinkInvite() {
    if (!effectiveSlug) return;
    setLinkError(null);
    setAddedOk(null);

    try {
      setLinking(true);

      const res = await fetch(
        `/api/events/post-participants/${encodeURIComponent(effectiveSlug)}`,
        { method: "POST", credentials: "include" },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setLinkError(data?.error ?? "Erro ao vincular convite.");
        return;
      }

      // Recarrega convite (pra atualizar participant.userId)
      const refresh = await fetch(
        `/api/events/post-participants/${encodeURIComponent(effectiveSlug)}`,
        { credentials: "include", cache: "no-store" },
      );

      if (refresh.ok) {
        const data = (await refresh.json()) as {
          event: Event;
          participant: PostParticipant;
        };
        setEvent(data.event);
        setParticipant(data.participant);
        setAddedOk("Convite vinculado. Agora você já pode lançar itens do racha.");
      }
    } catch (err) {
      console.error("[PostParticipantInviteClient] handleLinkInvite:", err);
      setLinkError("Erro inesperado ao vincular convite.");
    } finally {
      setLinking(false);
    }
  }

  async function refreshExpenses() {
    if (!event?.id) return;
    const res = await fetch(`/api/events/${encodeURIComponent(event.id)}/post-expenses`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = (await res.json()) as ExpensesResponse;
    setExpenses(Array.isArray(data.expenses) ? data.expenses : []);
  }

  async function handleAddExpense() {
    setAddError(null);
    setAddedOk(null);

    if (!event?.id) {
      setAddError("Evento ainda não foi carregado.");
      return;
    }

    if (!canAccessRacha) {
      setAddError("Faça login e vincule o convite para adicionar itens.");
      return;
    }

    if (!currentParticipantId && !isOrganizer) {
      setAddError("Não foi possível identificar seu participante no racha.");
      return;
    }

    const description = desc.trim();
    const value = normalizeAmount(amount);

    if (!description) {
      setAddError("Informe a descrição do item.");
      return;
    }

    if (!value) {
      setAddError("Informe um valor válido (ex.: 12,50).");
      return;
    }

    if (!selectedIds.length) {
      setAddError("Selecione pelo menos uma pessoa para dividir.");
      return;
    }

    try {
      setAdding(true);

      const body = {
        description,
        totalAmount: value,
        payerId: (isOrganizer ? currentParticipantId : currentParticipantId) ?? "",
        participantIds: selectedIds,
      };

      // Se organizador e não houver currentParticipantId, tenta usar o primeiro participante como pagador
      if (isOrganizer && !body.payerId) {
        body.payerId = people[0]?.id ?? "";
      }

      if (!body.payerId) {
        setAddError("Não foi possível definir quem pagou (payer).");
        return;
      }

      const res = await fetch(`/api/events/${encodeURIComponent(event.id)}/post-expenses`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setAddError(data?.error ?? "Erro ao adicionar item.");
        return;
      }

      setDesc("");
      setAmount("");
      setShowPeople(false);
      setAddedOk(`Item adicionado: ${description} (${formatBRL(value)})`);

      await refreshExpenses();
    } catch (err) {
      console.error("[PostParticipantInviteClient] handleAddExpense:", err);
      setAddError("Erro inesperado ao adicionar item.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="min-h-screen bg-app text-app">
      <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-4">
        {/* Header compacto */}
        <header className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Convite pós-pago
          </p>

          <h1 className="text-2xl font-semibold text-app leading-tight">
            {event?.name ?? (loadingInvite ? "Carregando..." : "Evento")}
          </h1>

          {formattedDate && (
            <p className="text-[12px] text-muted">
              {formattedDate}
            </p>
          )}

          {event?.description && (
            <p className="text-sm text-muted">
              {event.description}
            </p>
          )}

          {/* Auth micro status (bem discreto) */}
          {sessionEmail && (
            <p className="text-[11px] text-app0">
              Logado como <span className="text-app font-semibold">{sessionEmail}</span>
            </p>
          )}
        </header>

        {/* Erros do convite */}
        {!loadingInvite && inviteError && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/5 p-4">
            <p className="text-sm text-red-400">{inviteError}</p>
          </div>
        )}

        {/* Como chegar (compacto) */}
        {hasLocation && !inviteError && (
          <section className="rounded-2xl border border-[var(--border)] bg-card p-4 space-y-2">
            <p className="text-[12px] text-muted">{trimmedLocation}</p>
            <div className="flex flex-wrap gap-2">
              {googleMapsUrl && (
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-2 text-[12px] font-semibold text-app hover:bg-card/70"
                >
                  Google Maps
                </a>
              )}
              {wazeUrl && (
                <a
                  href={wazeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-2 text-[12px] font-semibold text-app hover:bg-card/70"
                >
                  Waze
                </a>
              )}
            </div>
          </section>
        )}

        {/* Login/Register se não autenticado (sem blocão) */}
        {!authLoading && !isAuthenticated && !inviteError && (
          <section className="rounded-2xl border border-[var(--border)] bg-card p-4 space-y-3">
            <p className="text-sm text-muted">
              Para lançar itens do racha, faça login ou crie uma conta.
            </p>
            <div className="flex gap-2">
              <Link
                href={loginHref}
                className="inline-flex flex-1 items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500"
              >
                Login
              </Link>
              <Link
                href={registerHref}
                className="inline-flex flex-1 items-center justify-center rounded-lg border border-[var(--border)] bg-app px-4 py-2 text-sm font-semibold text-app hover:bg-card"
              >
                Criar conta
              </Link>
            </div>
          </section>
        )}

        {/* Aviso se convite vinculado a outra pessoa */}
        {isAuthenticated && inviteLinkedToOther && (
          <section className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-1">
            <p className="text-sm text-amber-300 font-semibold">
              Este convite já foi vinculado a outra conta.
            </p>
            <p className="text-[12px] text-app0">
              Peça ao organizador para gerar um novo convite para você.
            </p>
          </section>
        )}

        {/* Ação pequena: vincular convite (se logado e ainda não vinculado) */}
        {isAuthenticated && !inviteLinkedToMe && !inviteLinkedToOther && !isOrganizer && (
          <section className="rounded-2xl border border-[var(--border)] bg-card p-4 space-y-2">
            <p className="text-sm text-muted">
              Você está logado como{" "}
              <span className="text-app font-semibold">{sessionName ?? "usuário"}</span>.
              Vincule este convite para lançar itens do racha.
            </p>

            {linkError && <p className="text-[12px] text-red-400">{linkError}</p>}
            {addedOk && <p className="text-[12px] text-emerald-300">{addedOk}</p>}

            <button
              type="button"
              onClick={() => void handleLinkInvite()}
              disabled={linking}
              className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
            >
              {linking ? "Vinculando..." : "Vincular convite"}
            </button>
          </section>
        )}

        {/* Campos do racha */}
        {!inviteError && (
          <section className="rounded-2xl border border-[var(--border)] bg-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-app">Itens do racha</h2>
              {canAccessRacha && (
                <button
                  type="button"
                  onClick={() => setShowPeople((v) => !v)}
                  className="text-[12px] font-semibold text-app hover:text-emerald-300"
                >
                  {selectedLabel}
                </button>
              )}
            </div>

            {/* Status/erros de carregamento do racha */}
            {canAccessRacha && loadingRacha && (
              <p className="text-[12px] text-muted">Carregando racha...</p>
            )}
            {canAccessRacha && rachaError && (
              <p className="text-[12px] text-red-400">{rachaError}</p>
            )}

            {/* Seleção de pessoas (colapsável) */}
            {canAccessRacha && showPeople && people.length > 0 && (
              <div className="rounded-xl border border-[var(--border)] bg-app p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] text-muted font-semibold">Dividir com</p>
                  <button
                    type="button"
                    onClick={() => setSelectedIds(people.map((p) => p.id))}
                    className="text-[12px] font-semibold text-app hover:text-emerald-300"
                  >
                    Selecionar todos
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  {people.map((p) => {
                    const checked = selectedIds.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        className="flex items-center gap-2 text-sm text-app"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setSelectedIds((prev) => {
                              if (on) return Array.from(new Set([...prev, p.id]));
                              return prev.filter((x) => x !== p.id);
                            });
                          }}
                        />
                        <span className="truncate">{p.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Form compacto */}
            <div className="flex flex-col gap-2">
              <input
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Descrição (ex.: Pizza, Uber, Mercado)"
                className="rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app shadow-sm"
                disabled={!canAccessRacha || adding || inviteLinkedToOther}
              />

              <div className="flex gap-2">
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="Valor (ex.: 12,50)"
                  className="rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app shadow-sm flex-1"
                  disabled={!canAccessRacha || adding || inviteLinkedToOther}
                />
                <button
                  type="button"
                  onClick={() => void handleAddExpense()}
                  disabled={!canAccessRacha || adding || inviteLinkedToOther}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
                >
                  {adding ? "..." : "Adicionar"}
                </button>
              </div>

              {addError && <p className="text-[12px] text-red-400">{addError}</p>}
              {addedOk && <p className="text-[12px] text-emerald-300">{addedOk}</p>}

              {!canAccessRacha && !authLoading && isAuthenticated && !inviteLinkedToOther && (
                <p className="text-[12px] text-app0">
                  Para lançar itens, você precisa vincular este convite (botão acima).
                </p>
              )}
            </div>

            {/* Lista compacta (não parece editor) */}
            {canAccessRacha && !loadingRacha && expenses.length > 0 && (
              <div className="pt-2 border-t border-[var(--border)] space-y-2">
                {expenses.slice(-6).map((e) => {
                  const value = Number(e.totalAmount ?? 0);
                  return (
                    <div key={e.id} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-app font-medium truncate">
                          {e.description}
                        </p>
                        {e.payer?.name && (
                          <p className="text-[11px] text-muted">
                            Pago por {e.payer.name}
                          </p>
                        )}
                      </div>
                      <p className="text-sm text-app font-semibold whitespace-nowrap">
                        {Number.isFinite(value) ? formatBRL(value) : String(e.totalAmount)}
                      </p>
                    </div>
                  );
                })}

                {expenses.length > 6 && (
                  <p className="text-[11px] text-app0">
                    Mostrando os últimos 6 itens.
                  </p>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
