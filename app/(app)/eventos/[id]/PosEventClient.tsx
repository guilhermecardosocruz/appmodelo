"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  canEditConfig?: boolean;
  canManageParticipants?: boolean;
  canAddExpenses?: boolean;
  roleForCurrentUser?: "ORGANIZER" | "POST_PARTICIPANT";
};

type Participant = {
  id: string;
  name: string;
  createdAt?: string;
};

type ExpenseShare = {
  id: string;
  participantId: string;
  shareAmount: number;
  participant?: Participant;
};

type Expense = {
  id: string;
  description: string;
  totalAmount: number;
  createdAt?: string;
  payerId: string;
  payer: Participant;
  shares: ExpenseShare[];
};

type SummaryItem = {
  participantId: string;
  name: string;
  totalPaid: number;
  totalShare: number;
  balance: number;
};

type ApiError = { error?: string };

export default function PosEventClient() {
  const params = useParams() as { id?: string };
  const eventId = String(params?.id ?? "").trim();

  const [event, setEvent] = useState<Event | null>(null);
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [eventError, setEventError] = useState<string | null>(null);
  const [savingEvent, setSavingEvent] = useState(false);

  // campos básicos
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");

  // participantes
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [participantsError, setParticipantsError] = useState<string | null>(
    null,
  );
  const [newParticipantName, setNewParticipantName] = useState("");
  const [addingParticipant, setAddingParticipant] = useState(false);
  const [removingParticipantId, setRemovingParticipantId] = useState<string | null>(null);

  // despesas
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [expensesError, setExpensesError] = useState<string | null>(null);

  const [newDescription, setNewDescription] = useState("");
  const [newTotalAmount, setNewTotalAmount] = useState("");
  const [newPayerId, setNewPayerId] = useState<string>("");
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<
    string[]
  >([]);
  const [addingExpense, setAddingExpense] = useState(false);

  // resumo
  const [summary, setSummary] = useState<SummaryItem[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const hasLocation = location.trim().length > 0;
  const encodedLocation = hasLocation
    ? encodeURIComponent(location.trim())
    : "";
  const googleMapsUrl = hasLocation
    ? `https://www.google.com/maps/search/?api=1&query=${encodedLocation}`
    : "#";
  const wazeUrl = hasLocation
    ? `https://waze.com/ul?q=${encodedLocation}&navigate=yes`
    : "#";

  const canEditConfig = event?.canEditConfig ?? true;
  const canManageParticipants = event?.canManageParticipants ?? true;
  const canAddExpenses = event?.canAddExpenses ?? true;

  // carregamento inicial do evento
  useEffect(() => {
    let active = true;

    async function loadEvent() {
      try {
        setLoadingEvent(true);
        setEventError(null);

        if (!eventId) {
          if (!active) return;
          setEventError("Evento não encontrado.");
          setEvent(null);
          return;
        }

        const res = await fetch(`/api/events/${eventId}`);
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as ApiError | null;
          if (!active) return;
          setEventError(data?.error ?? "Erro ao carregar evento.");
          setEvent(null);
          return;
        }

        const data = (await res.json()) as Event;
        if (!active) return;

        setEvent(data);
        setName(data.name ?? "");
        setLocation(data.location ?? "");
        setDescription(data.description ?? "");
        if (data.eventDate) {
          setEventDate(data.eventDate.slice(0, 10));
        } else {
          setEventDate("");
        }
      } catch (err) {
        console.error("[PosEventClient] Erro ao carregar evento:", err);
        if (!active) return;
        setEventError("Erro inesperado ao carregar evento.");
        setEvent(null);
      } finally {
        if (!active) return;
        setLoadingEvent(false);
      }
    }

    void loadEvent();

    return () => {
      active = false;
    };
  }, [eventId]);

  // carregar participantes (reutilizável)
  const loadParticipants = useCallback(async () => {
    if (!eventId) return;
    try {
      setLoadingParticipants(true);
      setParticipantsError(null);

      const res = await fetch(
        `/api/events/${encodeURIComponent(eventId)}/post-participants`,
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as ApiError | null;
        setParticipantsError(
          data?.error ?? "Erro ao carregar participantes.",
        );
        setParticipants([]);
        return;
      }

      const data = (await res.json()) as { participants?: Participant[] };
      setParticipants(data.participants ?? []);
    } catch (err) {
      console.error("[PosEventClient] Erro ao carregar participantes:", err);
      setParticipantsError("Erro inesperado ao carregar participantes.");
      setParticipants([]);
    } finally {
      setLoadingParticipants(false);
    }
  }, [eventId]);

  useEffect(() => {
    void loadParticipants();
  }, [loadParticipants]);

  // carregar despesas (reutilizável)
  const loadExpenses = useCallback(async () => {
    if (!eventId) return;
    try {
      setLoadingExpenses(true);
      setExpensesError(null);

      const res = await fetch(
        `/api/events/${encodeURIComponent(eventId)}/post-expenses`,
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as ApiError | null;
        setExpensesError(data?.error ?? "Erro ao carregar despesas.");
        setExpenses([]);
        return;
      }

      const data = (await res.json()) as { expenses?: Expense[] };
      setExpenses(
        (data.expenses ?? []).map((e) => ({
          ...e,
          totalAmount: Number(e.totalAmount),
          shares: (e.shares ?? []).map((s) => ({
            ...s,
            shareAmount: Number(s.shareAmount),
          })),
        })),
      );
    } catch (err) {
      console.error("[PosEventClient] Erro ao carregar despesas:", err);
      setExpensesError("Erro inesperado ao carregar despesas.");
      setExpenses([]);
    } finally {
      setLoadingExpenses(false);
    }
  }, [eventId]);

  useEffect(() => {
    void loadExpenses();
  }, [loadExpenses]);

  async function refreshSummary() {
    if (!eventId) return;
    try {
      setLoadingSummary(true);
      setSummaryError(null);

      const res = await fetch(
        `/api/events/${encodeURIComponent(eventId)}/post-summary`,
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as ApiError | null;
        setSummaryError(data?.error ?? "Erro ao calcular resumo.");
        setSummary([]);
        return;
      }

      const data = (await res.json()) as {
        balances?: SummaryItem[];
      };
      setSummary(
        (data.balances ?? []).map((b) => ({
          ...b,
          totalPaid: Number(b.totalPaid),
          totalShare: Number(b.totalShare),
          balance: Number(b.balance),
        })),
      );
    } catch (err) {
      console.error("[PosEventClient] Erro ao carregar resumo:", err);
      setSummaryError("Erro inesperado ao carregar resumo.");
      setSummary([]);
    } finally {
      setLoadingSummary(false);
    }
  }

  useEffect(() => {
    void refreshSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function handleSaveEvent(e: React.FormEvent) {
    e.preventDefault();

    if (!eventId) {
      setEventError("Evento não encontrado.");
      return;
    }

    if (!canEditConfig) {
      setEventError("Apenas o organizador pode editar as configurações.");
      return;
    }

    if (!name.trim()) {
      setEventError("O nome do evento não pode ficar vazio.");
      return;
    }

    try {
      setSavingEvent(true);
      setEventError(null);

      const res = await fetch("/api/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: eventId,
          name: name.trim(),
          description: description.trim() || null,
          location: location.trim() || null,
          eventDate: eventDate || null,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as ApiError | null;
        setEventError(data?.error ?? "Erro ao salvar alterações.");
        return;
      }

      const updated = (await res.json()) as Event;
      setEvent(updated);
    } catch (err) {
      console.error("[PosEventClient] Erro ao salvar evento:", err);
      setEventError("Erro inesperado ao salvar alterações.");
    } finally {
      setSavingEvent(false);
    }
  }

  async function handleAddParticipant() {
    const trimmed = newParticipantName.trim();
    if (!trimmed) {
      setParticipantsError("Digite o nome do participante.");
      return;
    }

    if (!eventId) {
      setParticipantsError("Evento não encontrado.");
      return;
    }

    if (!canManageParticipants) {
      setParticipantsError("Apenas o organizador pode adicionar participantes.");
      return;
    }

    try {
      setAddingParticipant(true);
      setParticipantsError(null);

      const res = await fetch(
        `/api/events/${encodeURIComponent(eventId)}/post-participants`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        },
      );

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as ApiError | null;
        setParticipantsError(data?.error ?? "Erro ao adicionar participante.");
        return;
      }

      const created = (await res.json()) as Participant;
      setParticipants((prev) => [...prev, created]);
      setNewParticipantName("");
    } catch (err) {
      console.error("[PosEventClient] Erro ao adicionar participante:", err);
      setParticipantsError("Erro inesperado ao adicionar participante.");
    } finally {
      setAddingParticipant(false);
    }
  }

  async function handleRemoveParticipant(p: Participant) {
    if (!eventId) {
      setParticipantsError("Evento não encontrado.");
      return;
    }

    if (!canManageParticipants) {
      setParticipantsError(
        "Apenas o organizador pode remover participantes.",
      );
      return;
    }

    const messageLines: string[] = [
      `Tem certeza que deseja remover "${p.name}" da divisão do evento?`,
      "",
      "Se essa pessoa já estiver em alguma despesa, a parte dela será automaticamente redistribuída entre os outros participantes que estavam nas mesmas divisões.",
    ];

    const ok = window.confirm(messageLines.join("\n"));
    if (!ok) return;

    try {
      setRemovingParticipantId(p.id);
      setParticipantsError(null);
      setExpensesError(null);

      const res = await fetch(
        `/api/events/${encodeURIComponent(
          eventId,
        )}/post-participants/${encodeURIComponent(p.id)}`,
        {
          method: "DELETE",
        },
      );

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as ApiError | null;
        setParticipantsError(
          data?.error ?? "Erro ao remover participante.",
        );
        return;
      }

      // Atualiza estados locais recarregando do backend,
      // pois as despesas e o resumo foram recalculados na API.
      await Promise.all([
        loadParticipants(),
        loadExpenses(),
        refreshSummary(),
      ]);
    } catch (err) {
      console.error("[PosEventClient] Erro ao remover participante:", err);
      setParticipantsError("Erro inesperado ao remover participante.");
    } finally {
      setRemovingParticipantId(null);
    }
  }

  function toggleParticipantInExpense(id: string) {
    setSelectedParticipantIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();

    if (!eventId) {
      setExpensesError("Evento não encontrado.");
      return;
    }

    if (!canAddExpenses) {
      setExpensesError("Você não tem permissão para lançar despesas.");
      return;
    }

    const descriptionTrimmed = newDescription.trim();
    if (!descriptionTrimmed) {
      setExpensesError("Preencha a descrição da despesa.");
      return;
    }

    const amount = Number(
      newTotalAmount.replace(".", "").replace(",", "."),
    );
    if (!Number.isFinite(amount) || amount <= 0) {
      setExpensesError("Informe um valor válido maior que zero.");
      return;
    }

    if (!newPayerId) {
      setExpensesError("Selecione quem pagou a despesa.");
      return;
    }

    if (!selectedParticipantIds.length) {
      setExpensesError(
        "Selecione pelo menos uma pessoa para dividir esta despesa.",
      );
      return;
    }

    try {
      setAddingExpense(true);
      setExpensesError(null);

      const res = await fetch(
        `/api/events/${encodeURIComponent(eventId)}/post-expenses`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: descriptionTrimmed,
            totalAmount: amount,
            payerId: newPayerId,
            participantIds: selectedParticipantIds,
          }),
        },
      );

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as ApiError | null;
        setExpensesError(data?.error ?? "Erro ao registrar despesa.");
        return;
      }

      const created = (await res.json()) as Expense;
      const normalized: Expense = {
        ...created,
        totalAmount: Number(created.totalAmount),
        shares: (created.shares ?? []).map((s) => ({
          ...s,
          shareAmount: Number(s.shareAmount),
        })),
      };

      setExpenses((prev) => [...prev, normalized]);

      setNewDescription("");
      setNewTotalAmount("");
      setNewPayerId("");
      setSelectedParticipantIds([]);

      void refreshSummary();
    } catch (err) {
      console.error("[PosEventClient] Erro ao adicionar despesa:", err);
      setExpensesError("Erro inesperado ao adicionar despesa.");
    } finally {
      setAddingExpense(false);
    }
  }

  const sortedParticipants = useMemo(
    () =>
      [...participants].sort((a, b) =>
        a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }),
      ),
    [participants],
  );

  return (
    <div className="min-h-screen bg-app text-app flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
        <Link
          href="/dashboard/"
          className="text-xs font-medium text-muted hover:text-app"
        >
          ← Voltar
        </Link>

        <span className="inline-flex items-center rounded-full bg-card px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted border border-[var(--border)]">
          Evento pós pago
        </span>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-4xl w-full mx-auto flex flex-col gap-4">
        {loadingEvent && (
          <p className="text-sm text-muted">Carregando evento...</p>
        )}

        {eventError && !loadingEvent && (
          <p className="text-sm text-red-500">{eventError}</p>
        )}

        {!loadingEvent && !eventError && (
          <form
            onSubmit={handleSaveEvent}
            className="flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-card p-4 sm:p-6"
          >
            <div className="space-y-1">
              <h1 className="text-lg sm:text-xl font-semibold text-app">
                {event?.name ?? "Configurações do evento pós pago"}
              </h1>
              <p className="text-sm text-muted">
                Aqui você cadastra participantes, registra despesas e vê o
                resumo de quem paga quanto para quem no final.
              </p>
              {event?.roleForCurrentUser === "POST_PARTICIPANT" && (
                <p className="text-[11px] text-app0">
                  Você foi convidado para este evento. Apenas o organizador pode
                  alterar as configurações.
                </p>
              )}
            </div>

            {/* Nome */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted">
                Nome do evento
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app placeholder:text-app0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                placeholder="Digite o nome do evento"
                disabled={savingEvent || !canEditConfig}
              />
            </div>

            {/* Data */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted">
                Data do evento
              </label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app placeholder:text-app0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                disabled={savingEvent || !canEditConfig}
              />
              <p className="text-[10px] text-app0">
                Essa data é salva junto com o evento.
              </p>
            </div>

            {/* Local */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted">
                Local do evento
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app placeholder:text-app0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                placeholder='Ex.: "Bar do Zé, Centro, Criciúma - SC"'
                disabled={savingEvent || !canEditConfig}
              />
              <p className="text-[10px] text-app0">
                Esse endereço será usado para gerar atalhos para Google Maps e
                Waze.
              </p>
            </div>

            {/* Atalhos de mapa */}
            {hasLocation && (
              <div className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-card p-3">
                <span className="text-xs font-medium text-muted">
                  Como chegar ao local
                </span>
                <p className="text-[11px] text-app0">
                  Use os atalhos abaixo para abrir o endereço direto no
                  aplicativo de mapas.
                </p>
                <div className="flex flex-wrap gap-2 mt-1">
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-app hover:bg-card/70"
                  >
                    Abrir no Google Maps
                  </a>
                  <a
                    href={wazeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-app hover:bg-card/70"
                  >
                    Abrir no Waze
                  </a>
                </div>
              </div>
            )}

            {/* Descrição */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted">
                Descrição do evento
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app placeholder:text-app0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 resize-y"
                placeholder="Ex.: Jogo do Brasil + pizza com amigos, racha de mercado, etc."
                disabled={savingEvent || !canEditConfig}
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingEvent || !canEditConfig}
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
              >
                {savingEvent ? "Salvando..." : "Salvar configurações"}
              </button>
            </div>
          </form>
        )}

        {/* PARTICIPANTES */}
        <section className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-card p-4 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-app">
              Participantes do racha
            </h2>
            {loadingParticipants && (
              <span className="text-[11px] text-muted">
                Carregando participantes...
              </span>
            )}
          </div>

          {canManageParticipants && (
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={newParticipantName}
                onChange={(e) => setNewParticipantName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleAddParticipant();
                  }
                }}
                className="flex-1 rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app placeholder:text-app0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                placeholder="Nome do participante (ex: João)"
                disabled={addingParticipant}
              />
              <button
                type="button"
                disabled={addingParticipant}
                onClick={handleAddParticipant}
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
              >
                {addingParticipant ? "Adicionando..." : "Adicionar"}
              </button>
            </div>
          )}

          {!canManageParticipants && (
            <p className="text-[11px] text-app0">
              Você foi adicionado pelo organizador. Apenas ele pode alterar a
              lista de participantes.
            </p>
          )}

          {participantsError && (
            <p className="text-[11px] text-red-500">{participantsError}</p>
          )}

          {!loadingParticipants &&
            !participantsError &&
            !sortedParticipants.length && (
              <p className="text-[11px] text-app0">
                Ainda não há participantes. Adicione quem vai entrar na divisão
                das despesas.
              </p>
            )}

          {sortedParticipants.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-2">
              {sortedParticipants.map((p) => (
                <li
                  key={p.id}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-app px-3 py-1 text-[11px] text-app"
                >
                  <span>{p.name}</span>
                  {canManageParticipants && (
                    <button
                      type="button"
                      onClick={() => void handleRemoveParticipant(p)}
                      disabled={removingParticipantId === p.id}
                      className="rounded-full border border-red-500 px-2 py-0.5 text-[10px] text-red-500 hover:bg-red-50 disabled:opacity-60"
                    >
                      {removingParticipantId === p.id
                        ? "Removendo..."
                        : "Remover"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* DESPESAS */}
        <section className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-card p-4 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-app">
              Despesas para dividir
            </h2>
            {loadingExpenses && (
              <span className="text-[11px] text-muted">
                Carregando despesas...
              </span>
            )}
          </div>

          {participants.length === 0 && (
            <p className="text-[11px] text-app0">
              Antes de lançar despesas, cadastre pelo menos um participante.
            </p>
          )}

          {/* Form de nova despesa */}
          <form
            onSubmit={handleAddExpense}
            className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-card p-3"
          >
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted">
                Descrição da despesa
              </label>
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app placeholder:text-app0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                placeholder="Ex.: Pizza, Uber, Mercado..."
                disabled={addingExpense || !participants.length || !canAddExpenses}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">
                  Valor total (R$)
                </label>
                <input
                  type="text"
                  value={newTotalAmount}
                  onChange={(e) => setNewTotalAmount(e.target.value)}
                  className="rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app placeholder:text-app0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  placeholder="Ex.: 120,00"
                  disabled={addingExpense || !participants.length || !canAddExpenses}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">
                  Quem pagou
                </label>
                <select
                  value={newPayerId}
                  onChange={(e) => setNewPayerId(e.target.value)}
                  className="rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  disabled={addingExpense || !participants.length || !canAddExpenses}
                >
                  <option value="">Selecione</option>
                  {sortedParticipants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">
                  Dividir com
                </label>
                <div className="flex flex-wrap gap-1">
                  {sortedParticipants.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleParticipantInExpense(p.id)}
                      disabled={
                        addingExpense || !participants.length || !canAddExpenses
                      }
                      className={`rounded-full border px-2 py-1 text-[11px] ${
                        selectedParticipantIds.includes(p.id)
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-[var(--border)] bg-app text-app"
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {expensesError && (
              <p className="text-[11px] text-red-500">{expensesError}</p>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={
                  addingExpense || !participants.length || !canAddExpenses
                }
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
              >
                {addingExpense ? "Adicionando..." : "Adicionar despesa"}
              </button>
            </div>
          </form>

          {/* Lista de despesas */}
          {!loadingExpenses && !expensesError && !expenses.length && (
            <p className="text-[11px] text-app0">
              Nenhuma despesa lançada ainda. Use o formulário acima para
              registrar as contas do evento.
            </p>
          )}

          {expenses.length > 0 && (
            <div className="mt-2 space-y-2">
              {expenses.map((exp, index) => {
                const totalShares = exp.shares.length;
                return (
                  <div
                    key={exp.id}
                    className="rounded-xl border border-[var(--border)] bg-app px-3 py-2 text-[11px]"
                  >
                    <div className="flex justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-app0">#{index + 1}</span>
                        <span className="font-semibold text-app">
                          {exp.description}
                        </span>
                      </div>
                      <span className="font-semibold text-app">
                        R$ {exp.totalAmount.toFixed(2)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-app0">
                      <span>
                        Pagou:{" "}
                        <span className="text-app">
                          {exp.payer?.name ?? "—"}
                        </span>
                      </span>
                      <span>•</span>
                      <span>
                        Dividido entre {totalShares}{" "}
                        {totalShares === 1 ? "pessoa" : "pessoas"}
                      </span>
                    </div>
                    {exp.shares.length > 0 && (
                      <div className="mt-1">
                        <p className="text-[10px] text-app0">Cotas:</p>
                        <ul className="mt-0.5 flex flex-wrap gap-2">
                          {exp.shares.map((s) => (
                            <li
                              key={s.id}
                              className="inline-flex items-center rounded-full border border-[var(--border)] bg-card px-2 py-0.5 text-[10px] text-app"
                            >
                              {s.participant?.name ?? "—"}: R${" "}
                              {s.shareAmount.toFixed(2)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* RESUMO DO ACERTO */}
        <section className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-card p-4 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-app">Resumo do acerto</h2>
            <button
              type="button"
              disabled={loadingSummary}
              onClick={() => void refreshSummary()}
              className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-app hover:bg-card/70 disabled:opacity-60"
            >
              {loadingSummary ? "Atualizando..." : "Recalcular"}
            </button>
          </div>

          {summaryError && (
            <p className="text-[11px] text-red-500">{summaryError}</p>
          )}

          {!loadingSummary && !summaryError && !summary.length && (
            <p className="text-[11px] text-app0">
              O resumo aparece depois que você lança participantes e despesas.
            </p>
          )}

          {summary.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-[11px] border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-app">
                    <th className="px-2 py-1 text-left font-medium text-muted">
                      Participante
                    </th>
                    <th className="px-2 py-1 text-right font-medium text-muted">
                      Pagou
                    </th>
                    <th className="px-2 py-1 text-right font-medium text-muted">
                      Deveria pagar
                    </th>
                    <th className="px-2 py-1 text-right font-medium text-muted">
                      Saldo
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((item) => (
                    <tr
                      key={item.participantId}
                      className="border-b border-[var(--border)]"
                    >
                      <td className="px-2 py-1 text-left text-app">
                        {item.name}
                      </td>
                      <td className="px-2 py-1 text-right text-app">
                        R$ {item.totalPaid.toFixed(2)}
                      </td>
                      <td className="px-2 py-1 text-right text-app">
                        R$ {item.totalShare.toFixed(2)}
                      </td>
                      <td className="px-2 py-1 text-right">
                        <span
                          className={
                            item.balance > 0
                              ? "text-emerald-500 font-semibold"
                              : item.balance < 0
                              ? "text-red-500 font-semibold"
                              : "text-muted"
                          }
                        >
                          {item.balance > 0 ? "+" : ""}
                          R$ {item.balance.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="mt-2 text-[10px] text-app0">
                Quem está com saldo positivo deve receber esse valor. Quem está
                negativo deve pagar. Em uma próxima versão dá para sugerir a
                lista de transferências (quem paga para quem).
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
