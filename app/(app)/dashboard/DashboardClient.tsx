"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type EventType = "PRE_PAGO" | "POS_PAGO" | "FREE";
type RoleForCurrentUser = "ORGANIZER" | "POST_PARTICIPANT" | "INVITED";

type Event = {
  id: string;
  name: string;
  type: EventType;
  createdAt?: string;

  deletedAt?: string | null;
  purgeAt?: string | null;

  hiddenAt?: string | null;
  hiddenPurgeAt?: string | null;

  roleForCurrentUser?: RoleForCurrentUser;
  isOrganizer?: boolean;

  hasTicketForCurrentUser?: boolean;
  ticketIdForCurrentUser?: string | null;
  inviteGuestSlugForCurrentUser?: string | null;
};

type ApiError = { error?: string };

type MeResponse =
  | { authenticated: true; user: { id: string; role?: "USER" | "ADMIN" } }
  | { authenticated: false };

function getTypeLabel(type: EventType) {
  if (type === "PRE_PAGO") return "PRÉ PAGO";
  if (type === "POS_PAGO") return "PÓS PAGO";
  return "FREE";
}

function getEventHref(event: Event) {
  // Se o usuário é convidado:
  // - se já tem ticket: abre ingresso
  // - se ainda não tem ticket, mas tem slug pessoal: abre página de convite
  if (event.roleForCurrentUser === "INVITED") {
    if (event.ticketIdForCurrentUser) {
      return `/ingressos/${event.ticketIdForCurrentUser}`;
    }
    if (event.inviteGuestSlugForCurrentUser) {
      return `/convite/pessoa/${event.inviteGuestSlugForCurrentUser}`;
    }
  }

  if (event.type === "PRE_PAGO") return `/eventos/${event.id}/pre`;
  if (event.type === "POS_PAGO") return `/eventos/${event.id}/pos`;
  return `/eventos/${event.id}/free`;
}

function toApiType(v: string): EventType {
  if (v === "PRE_PAGO") return "PRE_PAGO";
  if (v === "POS_PAGO") return "POS_PAGO";
  return "FREE";
}

function formatDateTimeBR(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR");
}

export default function DashboardClient() {
  const router = useRouter();

  const [events, setEvents] = useState<Event[]>([]);
  const [trash, setTrash] = useState<Event[]>([]);
  const [tab, setTab] = useState<"events" | "trash">("events");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<EventType>("FREE");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);

  const canSubmit = useMemo(
    () => name.trim().length >= 2 && !creating,
    [name, creating],
  );

  async function loadMe() {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (!res.ok) {
      setIsAdmin(false);
      return;
    }
    const data = (await res.json()) as MeResponse;
    if (data && "authenticated" in data && data.authenticated) {
      setIsAdmin(data.user.role === "ADMIN");
    } else {
      setIsAdmin(false);
    }
  }

  async function refreshEvents() {
    const res = await fetch("/api/events?includeDeleted=1", {
      cache: "no-store",
    });

    if (!res.ok) {
      let msg = "Erro ao carregar eventos.";
      try {
        const body = (await res.json()) as ApiError;
        if (body?.error) msg = body.error;
      } catch {}
      throw new Error(msg);
    }

    const data = (await res.json()) as unknown;
    const arr = Array.isArray(data) ? (data as Event[]) : [];

    const active: Event[] = [];
    const deletedOrHidden: Event[] = [];

    for (const ev of arr) {
      if (ev.deletedAt || ev.hiddenAt) deletedOrHidden.push(ev);
      else active.push(ev);
    }

    setEvents(active);
    setTrash(deletedOrHidden);
  }

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        await loadMe();
        await refreshEvents();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Falha ao carregar eventos.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!isAdmin && type === "PRE_PAGO") setType("FREE");
  }, [isAdmin, type]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    const safeType: EventType =
      !isAdmin && type === "PRE_PAGO" ? "FREE" : type;

    try {
      setCreating(true);
      setError(null);

      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), type: safeType }),
      });

      if (!res.ok) {
        let msg = "Erro ao criar evento.";
        try {
          const body = (await res.json()) as ApiError;
          if (body?.error) msg = body.error;
        } catch {}
        throw new Error(msg);
      }

      await refreshEvents();
      setName("");
      setType("FREE");
      setTab("events");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao criar evento.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleMoveToTrash(event: Event) {
    const isOrganizer = event.isOrganizer ?? true;
    if (!isOrganizer) {
      setError("Somente o organizador pode enviar este evento para a lixeira.");
      return;
    }

    const ok = window.confirm(
      `Enviar o evento "${event.name}" para a lixeira?\nVocê poderá restaurar por 30 dias.`,
    );
    if (!ok) return;

    try {
      setBusyId(event.id);
      setError(null);

      const res = await fetch(`/api/events/${event.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        let msg = "Não foi possível enviar para a lixeira.";
        try {
          const body = (await res.json()) as ApiError;
          if (body?.error) msg = body.error;
        } catch {}
        setError(msg);
        return;
      }

      await refreshEvents();
      window.alert("Evento enviado para a lixeira.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao enviar para lixeira.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleHideFromDashboard(event: Event) {
    const ok = window.confirm(
      `Remover "${event.name}" do seu dashboard?\nIsso só oculta para você (30 dias).`,
    );
    if (!ok) return;

    try {
      setBusyId(event.id);
      setError(null);

      const res = await fetch(`/api/events/${event.id}/hide`, {
        method: "POST",
      });

      if (!res.ok) {
        let msg = "Não foi possível remover do dashboard.";
        try {
          const body = (await res.json()) as ApiError;
          if (body?.error) msg = body.error;
        } catch {}
        setError(msg);
        return;
      }

      await refreshEvents();
      window.alert(
        "Evento removido do seu dashboard (lixeira pessoal).",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao ocultar evento.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleRestoreHidden(event: Event) {
    try {
      setBusyId(event.id);
      setError(null);

      const res = await fetch(`/api/events/${event.id}/unhide`, {
        method: "POST",
      });

      if (!res.ok) {
        let msg = "Não foi possível restaurar.";
        try {
          const body = (await res.json()) as ApiError;
          if (body?.error) msg = body.error;
        } catch {}
        setError(msg);
        return;
      }

      await refreshEvents();
      window.alert("Evento restaurado no seu dashboard.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao restaurar.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleRestoreDeleted(event: Event) {
    const isOrganizer = event.isOrganizer ?? true;
    if (!isOrganizer) {
      setError("Somente o organizador pode restaurar este evento.");
      return;
    }

    try {
      setBusyId(event.id);
      setError(null);

      const res = await fetch(`/api/events/${event.id}/restore`, {
        method: "POST",
      });

      if (!res.ok) {
        let msg = "Não foi possível restaurar.";
        try {
          const body = (await res.json()) as ApiError;
          if (body?.error) msg = body.error;
        } catch {}
        setError(msg);
        return;
      }

      await refreshEvents();
      window.alert("Evento restaurado.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao restaurar.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handlePurgeDeleted(event: Event) {
    const isOrganizer = event.isOrganizer ?? true;
    if (!isOrganizer) {
      setError("Somente o organizador pode excluir definitivamente.");
      return;
    }

    const ok = window.confirm(
      `Excluir DEFINITIVAMENTE "${event.name}"?\nIsso só funciona se não houver pendências.`,
    );
    if (!ok) return;

    try {
      setBusyId(event.id);
      setError(null);

      const res = await fetch(`/api/events/${event.id}/purge`, {
        method: "DELETE",
      });

      if (!res.ok) {
        let msg = "Não foi possível excluir definitivamente.";
        try {
          const body = (await res.json()) as ApiError;
          if (body?.error) msg = body.error;
        } catch {}
        setError(msg);
        return;
      }

      await refreshEvents();
      window.alert("Evento excluído definitivamente.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao excluir definitivamente.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-app">Meus eventos</h1>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab("events")}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              tab === "events"
                ? "border-app bg-card-strong text-app"
                : "border-[var(--border)] bg-card text-muted hover:bg-card-hover"
            }`}
          >
            Eventos ({events.length})
          </button>

          <button
            type="button"
            onClick={() => setTab("trash")}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              tab === "trash"
                ? "border-app bg-card-strong text-app"
                : "border-[var(--border)] bg-card text-muted hover:bg-card-hover"
            }`}
          >
            Lixeira ({trash.length})
          </button>
        </div>
      </div>

      {tab === "events" ? (
        <form
          onSubmit={onCreate}
          className="mb-6 flex flex-col gap-3 rounded-2xl border border-app bg-card-strong p-4 shadow-sm sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <label className="text-xs font-medium text-muted">
              Nome do evento
            </label>
            <input
              value={name}
              onChange={(ev) => setName(ev.target.value)}
              className="input-app mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:ring-app"
              placeholder="Digite o nome do evento"
            />
          </div>

          <div className="w-full sm:w-44">
            <label className="text-xs font-medium text-muted">Tipo</label>
            <select
              value={type}
              onChange={(ev) => setType(toApiType(ev.target.value))}
              className="input-app mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:ring-app"
            >
              <option value="FREE">Free</option>
              <option value="POS_PAGO">Pós pago</option>
              {isAdmin ? <option value="PRE_PAGO">Pré pago</option> : null}
            </select>

            {!isAdmin ? (
              <p className="mt-1 text-[10px] text-app0">
                Pré-pago e recorrente serão liberados em breve.
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creating ? "Adicionando..." : "Adicionar evento"}
          </button>
        </form>
      ) : null}

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {tab === "events" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => {
            const isOrganizer = event.isOrganizer ?? true;
            const role = event.roleForCurrentUser;

            return (
              <div
                key={event.id}
                onClick={() => router.push(getEventHref(event))}
                className="cursor-pointer rounded-2xl border border-app bg-card p-4 shadow-sm transition hover:bg-card-hover"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-muted">
                      {getTypeLabel(event.type)}
                    </span>

                    {!isOrganizer && (
                      <span className="mt-0.5 inline-flex items-center rounded-full bg-app px-2 py-0 text-[10px] font-medium text-muted">
                        {role === "POST_PARTICIPANT"
                          ? "Convidado do racha"
                          : "Convidado"}
                      </span>
                    )}

                    {event.hasTicketForCurrentUser &&
                      event.roleForCurrentUser === "INVITED" && (
                        <span className="mt-0.5 text-[10px] text-emerald-500">
                          Você tem um ingresso para este evento.
                        </span>
                      )}
                  </div>

                  {isOrganizer ? (
                    <button
                      type="button"
                      disabled={busyId === event.id}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        void handleMoveToTrash(event);
                      }}
                      className="rounded-md border border-red-500 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      {busyId === event.id ? "..." : "Enviar à lixeira"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === event.id}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        void handleHideFromDashboard(event);
                      }}
                      className="rounded-md border border-[var(--border)] px-2 py-0.5 text-xs text-muted hover:bg-card-hover disabled:opacity-60"
                    >
                      {busyId === event.id ? "..." : "Remover"}
                    </button>
                  )}
                </div>

                <h2 className="text-sm font-semibold text-app">
                  {event.name}
                </h2>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trash.map((event) => {
            const isOrganizer = event.isOrganizer ?? true;
            const isDeleted = !!event.deletedAt;
            const isHidden = !!event.hiddenAt;

            return (
              <div
                key={event.id}
                onClick={() => router.push(getEventHref(event))}
                className="cursor-pointer rounded-2xl border border-[var(--border)] bg-card p-4 shadow-sm transition hover:bg-card-hover"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-muted">
                      {getTypeLabel(event.type)}
                    </span>

                    {isDeleted ? (
                      <>
                        <span className="mt-1 text-[10px] text-muted">
                          Lixeira do evento desde:{" "}
                          {formatDateTimeBR(event.deletedAt)}
                        </span>
                        <span className="mt-0.5 text-[10px] text-muted">
                          Expira em: {formatDateTimeBR(event.purgeAt)}
                        </span>
                      </>
                    ) : isHidden ? (
                      <>
                        <span className="mt-1 text-[10px] text-muted">
                          Lixeira pessoal desde:{" "}
                          {formatDateTimeBR(event.hiddenAt)}
                        </span>
                        <span className="mt-0.5 text-[10px] text-muted">
                          Expira em: {formatDateTimeBR(
                            event.hiddenPurgeAt,
                          )}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>

                <h2 className="mb-3 text-sm font-semibold text-app">
                  {event.name}
                </h2>

                <div className="flex flex-wrap gap-2">
                  {isDeleted ? (
                    <>
                      <button
                        type="button"
                        disabled={!isOrganizer || busyId === event.id}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          void handleRestoreDeleted(event);
                        }}
                        className="rounded-md border border-app px-3 py-1 text-xs text-app hover:bg-card-hover disabled:opacity-60"
                      >
                        {busyId === event.id ? "..." : "Restaurar"}
                      </button>

                      <button
                        type="button"
                        disabled={!isOrganizer || busyId === event.id}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          void handlePurgeDeleted(event);
                        }}
                        className="rounded-md border border-red-500 px-3 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-60"
                        title="Só funciona se não houver pendências"
                      >
                        {busyId === event.id
                          ? "..."
                          : "Excluir definitivamente"}
                      </button>
                    </>
                  ) : isHidden ? (
                    <button
                      type="button"
                      disabled={busyId === event.id}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        void handleRestoreHidden(event);
                      }}
                      className="rounded-md border border-app px-3 py-1 text-xs text-app hover:bg-card-hover disabled:opacity-60"
                    >
                      {busyId === event.id
                        ? "..."
                        : "Restaurar no dashboard"}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-muted">Carregando…</p>
      ) : null}
    </div>
  );
}
