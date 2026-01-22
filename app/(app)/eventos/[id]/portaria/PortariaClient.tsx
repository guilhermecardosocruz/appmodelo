"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Scanner } from "@yudiel/react-qr-scanner";

type EventType = "PRE_PAGO" | "POS_PAGO" | "FREE";

type Event = {
  id: string;
  name: string;
  type: EventType;
  location?: string | null;
  eventDate?: string | null;
};

type TicketStatus = "ACTIVE" | "CANCELLED";

type TicketForPortaria = {
  id: string;
  code?: string | null;
  attendeeName?: string | null;
  guestName?: string | null;
  userEmail?: string | null;
  status: TicketStatus;
  checkedInAt?: string | null;
  createdAt?: string | null;
};

type ScanState =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "warning"; message: string }
  | { kind: "error"; message: string };

function formatDateTime(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const ano = d.getFullYear();

  const hora = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");

  return `${dia}/${mes}/${ano} ${hora}:${min}`;
}

function getTicketDisplayName(ticket: TicketForPortaria): string {
  const name =
    ticket.attendeeName?.trim() ||
    ticket.guestName?.trim() ||
    ticket.userEmail?.trim() ||
    "";
  return name || "Participante";
}

export default function PortariaClient() {
  const params = useParams() as { id?: string };
  const eventId = String(params?.id ?? "").trim();

  const [event, setEvent] = useState<Event | null>(null);
  const [tickets, setTickets] = useState<TicketForPortaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scanState, setScanState] = useState<ScanState>({ kind: "idle" });
  const [scannerEnabled, setScannerEnabled] = useState(true);
  const [scanBusy, setScanBusy] = useState(false);
  const [lastScannedTicketId, setLastScannedTicketId] =
    useState<string | null>(null);

  const sortedTickets = useMemo(() => {
    return [...tickets].sort((a, b) =>
      getTicketDisplayName(a).localeCompare(getTicketDisplayName(b), "pt-BR", {
        sensitivity: "base",
      }),
    );
  }, [tickets]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        if (!eventId) {
          setError("Evento não encontrado.");
          setEvent(null);
          setTickets([]);
          return;
        }

        setLoading(true);
        setError(null);
        setScanState({ kind: "idle" });

        const eventRes = await fetch(
          `/api/events/${encodeURIComponent(eventId)}`,
          {
            cache: "no-store",
          },
        );

        if (!eventRes.ok) {
          const data = await eventRes.json().catch(() => null);
          if (!active) return;
          setError(data?.error ?? "Erro ao carregar evento.");
          setEvent(null);
          setTickets([]);
          setLoading(false);
          return;
        }

        const ev = (await eventRes.json()) as Event;
        if (!active) return;
        setEvent(ev);

        setLoadingList(true);
        const listRes = await fetch(
          `/api/events/${encodeURIComponent(eventId)}/tickets`,
          { cache: "no-store" },
        );

        if (!listRes.ok) {
          const data = await listRes.json().catch(() => null);
          if (!active) return;
          setError(data?.error ?? "Erro ao carregar lista de ingressos.");
          setTickets([]);
          setLoadingList(false);
          setLoading(false);
          return;
        }

        const json = (await listRes.json()) as {
          tickets?: TicketForPortaria[];
        };
        if (!active) return;
        setTickets(json.tickets ?? []);
      } catch (err) {
        console.error("[PortariaClient] Erro ao carregar dados:", err);
        if (!active) return;
        setError("Erro inesperado ao carregar dados da portaria.");
        setTickets([]);
      } finally {
        if (!active) return;
        setLoading(false);
        setLoadingList(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [eventId]);

  async function handleRefreshList() {
    if (!eventId) return;

    try {
      setLoadingList(true);
      setError(null);

      const res = await fetch(
        `/api/events/${encodeURIComponent(eventId)}/tickets`,
        {
          cache: "no-store",
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Erro ao recarregar lista de ingressos.");
        return;
      }

      const json = (await res.json()) as { tickets?: TicketForPortaria[] };
      setTickets(json.tickets ?? []);
    } catch (err) {
      console.error("[PortariaClient] Erro ao recarregar lista:", err);
      setError("Erro inesperado ao recarregar lista de ingressos.");
    } finally {
      setLoadingList(false);
    }
  }

  async function applyCheckin(ticketId: string, source: "scan" | "manual") {
    if (!eventId) return;

    try {
      setScanBusy(source === "scan");
      if (source === "scan") {
        setScanState({ kind: "idle" });
      }

      const res = await fetch(
        `/api/events/${encodeURIComponent(eventId)}/tickets`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticketId, mode: source }),
        },
      );

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        console.warn("[PortariaClient] Erro no check-in:", data);
        const msg = data?.error ?? "Erro ao registrar entrada.";
        if (source === "scan") {
          setScanState({ kind: "error", message: msg });
        } else {
          setError(msg);
        }
        return;
      }

      const updatedTicket = (data?.ticket ?? null) as TicketForPortaria | null;
      const status = String(data?.status ?? "").toLowerCase();

      if (updatedTicket) {
        setTickets((prev) =>
          prev.map((t) => (t.id === updatedTicket.id ? updatedTicket : t)),
        );
      }

      if (source === "scan") {
        setLastScannedTicketId(ticketId);

        if (status === "checked-in" || updatedTicket?.checkedInAt) {
          setScanState({
            kind: "success",
            message: "Entrada registrada com sucesso.",
          });
        } else if (status === "already-checked") {
          setScanState({
            kind: "warning",
            message:
              "Entrada já realizada anteriormente para este ingresso.",
          });
        } else if (status === "removed-checkin") {
          setScanState({
            kind: "warning",
            message: "Check-in removido para este ingresso.",
          });
        } else {
          setScanState({
            kind: "success",
            message: "Operação realizada com sucesso.",
          });
        }
      }
    } catch (err) {
      console.error("[PortariaClient] Erro inesperado no check-in:", err);
      if (source === "scan") {
        setScanState({
          kind: "error",
          message: "Erro inesperado ao registrar entrada.",
        });
      } else {
        setError("Erro inesperado ao registrar entrada.");
      }
    } finally {
      if (source === "scan") {
        setScanBusy(false);
      }
    }
  }

  function handleManualToggle(ticket: TicketForPortaria) {
    void applyCheckin(ticket.id, "manual");
  }

  async function handleScan(text: string | null) {
    if (!text || scanBusy || !scannerEnabled) return;

    let ticketId: string | null = null;
    const rawText = text.trim();

    // 1) Tenta como JSON: { kind: "TICKET", ticketId } ou { ticketId }
    try {
      const parsed = JSON.parse(rawText) as
        | { kind?: string; ticketId?: string; id?: string }
        | null;
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.ticketId === "string" && parsed.ticketId.trim()) {
          ticketId = parsed.ticketId.trim();
        } else if (typeof parsed.id === "string" && parsed.id.trim()) {
          ticketId = parsed.id.trim();
        }

        if (!ticketId && parsed.kind && parsed.kind !== "TICKET") {
          ticketId = null;
        }
      }
    } catch {
      // Não é JSON válido, vamos tentar outros formatos
    }

    // 2) Se ainda não temos, tenta tratar como URL (ex: https://.../ingressos/:id)
    if (!ticketId) {
      try {
        const maybeUrl = new URL(rawText);
        const path = maybeUrl.pathname;

        const matchIngresso = path.match(/\/ingressos\/([^/]+)/);
        if (matchIngresso?.[1]) {
          ticketId = decodeURIComponent(matchIngresso[1]);
        }

        if (!ticketId) {
          const matchTicket = path.match(/\/tickets\/([^/]+)/);
          if (matchTicket?.[1]) {
            ticketId = decodeURIComponent(matchTicket[1]);
          }
        }
      } catch {
        // Não é URL, segue
      }
    }

    // 3) Como fallback, usa o texto cru se parecer um ID razoável (sem espaços e com tamanho mínimo)
    if (!ticketId) {
      if (rawText && !rawText.includes(" ") && rawText.length >= 8) {
        ticketId = rawText;
      }
    }

    if (!ticketId) {
      setScanState({
        kind: "error",
        message: "QR Code inválido para ingresso.",
      });
      return;
    }

    if (ticketId === lastScannedTicketId) {
      setScanState({
        kind: "warning",
        message: "Este ingresso já foi lido recentemente.",
      });
      return;
    }

    await applyCheckin(ticketId, "scan");
  }

  const eventTitle = event?.name ?? "Portaria do evento";

  let scanStatusClass = "";
  if (scanState.kind === "success") {
    scanStatusClass =
      "border-emerald-700/70 bg-emerald-950/40 text-emerald-200";
  } else if (scanState.kind === "warning") {
    scanStatusClass = "border-amber-600/70 bg-amber-950/40 text-amber-200";
  } else if (scanState.kind === "error") {
    scanStatusClass = "border-red-600/70 bg-red-950/40 text-red-200";
  }

  return (
    <div className="min-h-screen bg-app text-app flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
        <Link
          href="/dashboard/"
          className="text-xs font-medium text-muted hover:text-app"
        >
          ← Voltar para o painel
        </Link>

        <span className="inline-flex items-center rounded-full bg-card px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted border border-[var(--border)]">
          Portaria
        </span>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-4xl w-full mx-auto flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl sm:text-2xl font-semibold text-app">
            {eventTitle}
          </h1>
          <p className="text-sm text-muted">
            Tela dedicada para a portaria conferir a entrada dos participantes,
            via QR Code ou lista em ordem alfabética.
          </p>
        </div>

        {loading && (
          <p className="text-sm text-muted">Carregando dados do evento...</p>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-red-700/70 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {!loading && !error && (
          <section className="rounded-2xl border border-[var(--border)] bg-card p-4 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-app">
                  Leitor de QR Code
                </h2>
                <p className="text-[11px] text-muted max-w-xl">
                  Aponte a câmera para o QR Code do ingresso. A entrada será
                  registrada automaticamente. Se o mesmo ingresso for
                  apresentado novamente, a tela irá avisar que a entrada já foi
                  realizada.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setScannerEnabled((prev) => !prev)}
                  className={`inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-[11px] font-semibold shadow-sm border border-[var(--border)] ${
                    scannerEnabled
                      ? "bg-emerald-600 text-white hover:bg-emerald-500"
                      : "bg-card text-app hover:bg-card/70"
                  }`}
                >
                  {scannerEnabled ? "Desativar câmera" : "Ativar câmera"}
                </button>

                <button
                  type="button"
                  onClick={handleRefreshList}
                  disabled={loadingList}
                  className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-[11px] font-semibold border border-[var(--border)] text-app hover:bg-card/70 disabled:opacity-60"
                >
                  {loadingList ? "Atualizando lista..." : "Atualizar lista"}
                </button>
              </div>
            </div>

            {scannerEnabled ? (
              <div className="w-full max-w-sm">
                <div className="rounded-xl overflow-hidden border border-[var(--border)] bg-app">
                  <Scanner
                    onScan={(results: unknown) => {
                      if (!results || scanBusy || !scannerEnabled) return;

                      let value: unknown = null;

                      if (Array.isArray(results)) {
                        const first = results[0] as
                          | { rawValue?: unknown }
                          | string
                          | undefined;
                        if (
                          first &&
                          typeof first === "object" &&
                          "rawValue" in first
                        ) {
                          value = (first as { rawValue?: unknown }).rawValue;
                        } else {
                          value = first ?? null;
                        }
                      } else if (
                        typeof results === "object" &&
                        results !== null &&
                        "rawValue" in results
                      ) {
                        value = (results as { rawValue?: unknown }).rawValue;
                      } else {
                        value = results;
                      }

                      if (typeof value === "string" && value.trim()) {
                        void handleScan(value.trim());
                      }
                    }}
                    onError={(err: unknown) => {
                      console.warn("[PortariaClient] Scanner error:", err);
                    }}
                    constraints={{
                      facingMode: "environment",
                    }}
                    styles={{
                      container: {
                        width: "100%",
                        aspectRatio: "3 / 4",
                      },
                      video: {
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      },
                    }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  Dica: mantenha o QR Code centralizado e a uma distância
                  confortável para leitura.
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-muted">
                Câmera desativada. Clique em &quot;Ativar câmera&quot; para ler
                QR Codes, ou use apenas a lista abaixo.
              </p>
            )}

            {scanState.kind !== "idle" && (
              <div
                className={`mt-2 rounded-xl border px-3 py-2 text-[11px] ${scanStatusClass}`}
              >
                {scanState.message}
              </div>
            )}
          </section>
        )}

        {!loading && !error && (
          <section className="rounded-2xl border border-[var(--border)] bg-card p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-app">
                Lista de participantes (ordem alfabética)
              </h2>
              <span className="text-[11px] text-muted">
                Total: {sortedTickets.length}
              </span>
            </div>

            {loadingList && (
              <p className="text-[11px] text-muted">
                Atualizando lista de ingressos...
              </p>
            )}

            {!loadingList && sortedTickets.length === 0 && (
              <p className="text-[11px] text-muted">
                Nenhum ingresso encontrado para este evento ainda.
              </p>
            )}

            {sortedTickets.length > 0 && (
              <div className="max-h-[480px] overflow-auto rounded-xl border border-[var(--border)]">
                <table className="w-full text-xs">
                  <thead className="bg-app/60 sticky top-0 z-10">
                    <tr className="border-b border-[var(--border)]">
                      <th className="px-3 py-2 text-left font-semibold text-app0 w-10">
                        #
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-app0">
                        Nome
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-app0">
                        Código / Ticket
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-app0">
                        Situação
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-app0">
                        Entrada
                      </th>
                      <th className="px-3 py-2 text-right font-semibold text-app0 w-28">
                        Ação
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTickets.map((ticket, index) => {
                      const name = getTicketDisplayName(ticket);
                      const isCheckedIn = !!ticket.checkedInAt;
                      const isCancelled = ticket.status === "CANCELLED";
                      const lineMuted = isCancelled;

                      const entradaLabel = ticket.checkedInAt
                        ? formatDateTime(ticket.checkedInAt)
                        : "—";

                      return (
                        <tr
                          key={ticket.id}
                          className={`border-b border-[var(--border)] ${
                            index % 2 === 0 ? "bg-app/40" : "bg-app/20"
                          }`}
                        >
                          <td className="px-3 py-2 align-middle text-[11px] text-app0">
                            {index + 1}
                          </td>
                          <td
                            className={`px-3 py-2 align-middle text-[11px] ${
                              lineMuted ? "text-app0/70" : "text-app"
                            }`}
                          >
                            {name}
                            {ticket.userEmail && (
                              <span className="block text-[10px] text-app0">
                                {ticket.userEmail}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 align-middle text-[11px] text-app0">
                            {ticket.code || ticket.id}
                          </td>
                          <td className="px-3 py-2 align-middle text-[11px]">
                            {isCancelled ? (
                              <span className="inline-flex rounded-full border border-red-700/70 bg-red-950/40 px-2 py-0.5 text-[10px] text-red-200">
                                Cancelado
                              </span>
                            ) : isCheckedIn ? (
                              <span className="inline-flex rounded-full border border-emerald-700/70 bg-emerald-950/40 px-2 py-0.5 text-[10px] text-emerald-200">
                                Entrada registrada
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full border border-[var(--border)] bg-app px-2 py-0.5 text-[10px] text-muted">
                                Aguardando entrada
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 align-middle text-[10px] text-app0">
                            {entradaLabel}
                          </td>
                          <td className="px-3 py-2 align-middle text-right">
                            <button
                              type="button"
                              disabled={isCancelled}
                              onClick={() => handleManualToggle(ticket)}
                              className={`inline-flex items-center justify-center rounded-lg px-2.5 py-1 text-[10px] font-semibold shadow-sm ${
                                isCancelled
                                  ? "bg-card text-app0/60 border border-[var(--border)] cursor-not-allowed"
                                  : isCheckedIn
                                  ? "bg-card text-app border border-[var(--border)] hover:bg-card/70"
                                  : "bg-emerald-600 text-white hover:bg-emerald-500"
                              }`}
                            >
                              {isCancelled
                                ? "Cancelado"
                                : isCheckedIn
                                ? "Desfazer"
                                : "Dar entrada"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
