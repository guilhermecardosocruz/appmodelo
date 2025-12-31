"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type EventType = "PRE_PAGO" | "POS_PAGO" | "FREE";

type Event = {
  id: string;
  name: string;
  type: EventType;
  description?: string | null;
  location?: string | null;
  inviteSlug?: string | null;
  eventDate?: string | null; // ISO string
  createdAt?: string;
};

type Mode = "free" | "pre" | "pos";

type Props = {
  mode: Mode;
};

function getTitle(mode: Mode) {
  if (mode === "pre") return "Configurações do evento pré pago";
  if (mode === "pos") return "Configurações do evento pós pago";
  return "Configurações do evento free";
}

function getIntro(mode: Mode) {
  if (mode === "pre") {
    return "Configure aqui os detalhes do evento pré pago e gere o link de checkout (pagamento antecipado).";
  }
  if (mode === "pos") {
    return "Configure aqui os detalhes do evento pós pago.";
  }
  return "Configure aqui os detalhes do seu evento gratuito.";
}

export default function EventTipoClient({ mode }: Props) {
  const params = useParams() as { id?: string };
  const eventId = String(params?.id ?? "").trim();

  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // campos do formulário (configurações básicas)
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState(""); // YYYY-MM-DD
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // checkout (pré-pago)
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutSuccess, setCheckoutSuccess] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [generatingCheckout, setGeneratingCheckout] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        setCheckoutError(null);
        setCheckoutSuccess(null);
        setCopyMessage(null);

        console.log(
          "[EventTipoClient] params.id:",
          params?.id,
          "eventId:",
          eventId
        );

        if (!eventId) {
          setError("Evento não encontrado.");
          setEvent(null);
          return;
        }

        console.log(
          "[EventTipoClient] Carregando evento de /api/events/[id]..."
        );
        const res = await fetch(`/api/events/${eventId}`);

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          if (!active) return;

          setError(data?.error ?? "Erro ao carregar evento.");
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
        console.error("[EventTipoClient] Erro no fetch:", err);
        if (!active) return;
        setError("Erro inesperado ao carregar evento.");
        setEvent(null);
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, mode]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    if (!eventId) {
      setError("Evento não encontrado.");
      return;
    }

    if (!name.trim()) {
      setError("O nome do evento não pode ficar vazio.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const res = await fetch("/api/events", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: eventId,
          name: name.trim(),
          description: description.trim() || null,
          location: location.trim() || null,
          eventDate: eventDate || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Erro ao salvar alterações.");
        return;
      }

      const updated = (await res.json()) as Event;
      setEvent(updated);
    } catch (err) {
      console.error("[EventTipoClient] Erro ao salvar evento:", err);
      setError("Erro inesperado ao salvar alterações.");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateCheckoutLink() {
    if (!eventId) {
      setCheckoutError("Evento não encontrado.");
      return;
    }

    try {
      setGeneratingCheckout(true);
      setCheckoutError(null);
      setCheckoutSuccess(null);

      const randomPart = Math.random().toString(36).slice(2, 8);
      const newSlug = `${eventId.slice(0, 6)}-${randomPart}`;

      const res = await fetch("/api/events", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: eventId,
          inviteSlug: newSlug,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setCheckoutError(data?.error ?? "Erro ao gerar link de checkout.");
        return;
      }

      const updated = (await res.json()) as Event;
      setEvent(updated);
      setCheckoutSuccess("Link de checkout atualizado com sucesso.");
    } catch (err) {
      console.error("[EventTipoClient] Erro ao gerar link de checkout:", err);
      setCheckoutError("Erro inesperado ao gerar link de checkout.");
    } finally {
      setGeneratingCheckout(false);
    }
  }

  async function handleCopyCheckoutLink() {
    if (!event?.inviteSlug) {
      setCopyMessage("Nenhum link gerado ainda para copiar.");
      return;
    }

    const path = `/checkout/${event.inviteSlug}`;
    const fullUrl =
      typeof window !== "undefined" ? `${window.location.origin}${path}` : path;

    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopyMessage("Link de checkout copiado para a área de transferência.");
      setTimeout(() => setCopyMessage(null), 3000);
    } catch (err) {
      console.error("[EventTipoClient] Erro ao copiar link de checkout:", err);
      setCopyMessage(
        `Não foi possível copiar automaticamente. Copie manualmente: ${fullUrl}`
      );
    }
  }

  const checkoutPath =
    event?.inviteSlug != null ? `/checkout/${event.inviteSlug}` : null;

  const hasLocation = location.trim().length > 0;
  const encodedLocation = hasLocation ? encodeURIComponent(location.trim()) : "";
  const googleMapsUrl = hasLocation
    ? `https://www.google.com/maps/search/?api=1&query=${encodedLocation}`
    : "#";
  const wazeUrl = hasLocation ? `https://waze.com/ul?q=${encodedLocation}` : "#";

  return (
    <div className="min-h-screen bg-app text-app flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
        <Link
          href="/dashboard/"
          className="text-xs font-medium text-muted hover:text-app"
        >
          ← Voltar
        </Link>

        {event && (
          <span className="inline-flex items-center rounded-full bg-card px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted border border-[var(--border)]">
            {event.type}
          </span>
        )}
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-3xl w-full mx-auto flex flex-col gap-4">
        {loading && <p className="text-sm text-muted">Carregando evento...</p>}

        {error && !loading && <p className="text-sm text-red-500">{error}</p>}

        {!loading && !error && !event && (
          <p className="text-sm text-muted">Evento não encontrado.</p>
        )}

        {event && (
          <form
            onSubmit={handleSave}
            className="flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-card p-4 sm:p-6"
          >
            <div className="space-y-1">
              <h1 className="text-xl sm:text-2xl font-semibold text-app">
                {event.name}
              </h1>
              <h2 className="text-sm font-medium text-app">{getTitle(mode)}</h2>
              <p className="text-sm text-muted">{getIntro(mode)}</p>
            </div>

            {/* Nome do evento */}
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
              />
            </div>

            {/* Data do evento */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted">
                Data do evento
              </label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app placeholder:text-app0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              />
              <p className="text-[10px] text-app0">
                Essa data será exibida junto com o evento nas páginas de convite.
              </p>
            </div>

            {/* Local do evento */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted">
                Local do evento
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app placeholder:text-app0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                placeholder="Rua Nome da Rua, 123 - Bairro, Cidade - UF"
              />
              <p className="text-[10px] text-app0">
                Formato sugerido: &quot;Rua Nome da Rua, 123 - Bairro, Cidade -
                UF&quot;. Esse endereço será usado para abrir atalhos para
                Google Maps e Waze.
              </p>
            </div>

            {/* Como chegar ao local */}
            {hasLocation && (
              <div className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-card p-3">
                <span className="text-xs font-medium text-muted">
                  Como chegar ao local
                </span>
                <p className="text-[10px] text-app0">
                  Use os atalhos abaixo para abrir o endereço direto no
                  aplicativo de mapas.
                </p>
                <div className="flex flex-wrap gap-2">
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

            {/* Descrição do evento */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted">
                Descrição do evento
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="rounded-lg border border-[var(--border)] bg-app px-3 py-2 text-sm text-app placeholder:text-app0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 resize-y"
                placeholder="Detalhe regras de pagamento, política de reembolso, lotes, etc."
              />
            </div>

            {/* BLOCO DE CHECKOUT APENAS PARA PRÉ PAGO */}
            {mode === "pre" && (
              <section className="mt-2 flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-app uppercase tracking-wide">
                    Link de checkout (pagamento antecipado)
                  </h3>

                  {event.inviteSlug && (
                    <span className="text-[11px] text-app0">
                      Código do checkout:{" "}
                      <span className="text-app">{event.inviteSlug}</span>
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-muted">
                  Gere o link de checkout e envie para os participantes. Eles
                  irão para uma página onde preenchem seus dados e depois seguem
                  para o pagamento.
                </p>

                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2 mt-1">
                    {checkoutPath ? (
                      <Link
                        href={checkoutPath}
                        target="_blank"
                        className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-app hover:bg-card/70"
                      >
                        Ver página de checkout
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-app0 cursor-not-allowed opacity-70"
                      >
                        Ver página de checkout
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={!event.inviteSlug}
                      onClick={handleCopyCheckoutLink}
                      className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-app hover:bg-card/70 disabled:opacity-50"
                    >
                      Copiar link de checkout
                    </button>

                    <button
                      type="button"
                      onClick={handleGenerateCheckoutLink}
                      disabled={generatingCheckout}
                      className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
                    >
                      {generatingCheckout
                        ? "Gerando..."
                        : "Gerar novo link de checkout"}
                    </button>
                  </div>

                  {checkoutPath && (
                    <div className="mt-1">
                      <p className="text-[11px] text-muted mb-1">
                        URL do checkout:
                      </p>
                      <code className="block w-full rounded-lg bg-app border border-[var(--border)] px-3 py-2 text-[11px] text-app break-all">
                        {typeof window !== "undefined"
                          ? `${window.location.origin}${checkoutPath}`
                          : checkoutPath}
                      </code>
                    </div>
                  )}
                </div>

                {checkoutError && (
                  <p className="text-[11px] text-red-500">{checkoutError}</p>
                )}

                {checkoutSuccess && (
                  <p className="text-[11px] text-emerald-500">
                    {checkoutSuccess}
                  </p>
                )}

                {copyMessage && (
                  <p className="text-[11px] text-emerald-500">{copyMessage}</p>
                )}
              </section>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
              >
                {saving ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
