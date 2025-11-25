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
  eventDate?: string | null;
  ticketPrice?: string | null;
  paymentLink?: string | null;
  salesStart?: string | null;
  salesEnd?: string | null;
  inviteSlug?: string | null;
};

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.trim()
    ? process.env.NEXT_PUBLIC_APP_URL.trim().replace(/\/$/, "")
    : null;

export default function PreEventClient() {
  const params = useParams() as { id?: string };
  const eventId = String(params?.id ?? "").trim();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Campos do formulário
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState(""); // "YYYY-MM-DD"
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [ticketPrice, setTicketPrice] = useState("");
  const [paymentLink, setPaymentLink] = useState("");
  const [salesStart, setSalesStart] = useState("");
  const [salesEnd, setSalesEnd] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        setSuccess(null);

        if (!eventId) {
          setError("Evento não encontrado.");
          return;
        }

        const res = await fetch(`/api/events/${eventId}`);
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          if (!active) return;
          setError(data?.error ?? "Erro ao carregar evento.");
          return;
        }

        const found = (await res.json()) as Event;
        if (!active) return;

        setName(found.name ?? "");
        setDescription(found.description ?? "");
        setLocation(found.location ?? "");
        setTicketPrice(found.ticketPrice ?? "");

        if (found.eventDate) {
          setEventDate(found.eventDate.slice(0, 10));
        } else {
          setEventDate("");
        }

        if (found.salesStart) {
          setSalesStart(found.salesStart.slice(0, 10));
        } else {
          setSalesStart("");
        }

        if (found.salesEnd) {
          setSalesEnd(found.salesEnd.slice(0, 10));
        } else {
          setSalesEnd("");
        }

        // Monta o link de checkout automaticamente:
        // prioridade:
        // 1) paymentLink salvo no banco
        // 2) se não tiver, usa inviteSlug -> /checkout/[slug]
        if (found.paymentLink && found.paymentLink.trim()) {
          setPaymentLink(found.paymentLink.trim());
        } else if (found.inviteSlug && found.inviteSlug.trim()) {
          const base =
            APP_URL ??
            (typeof window !== "undefined" ? window.location.origin : "");
          const link = base
            ? `${base.replace(/\/$/, "")}/checkout/${found.inviteSlug.trim()}`
            : "";
          setPaymentLink(link);
        } else {
          setPaymentLink("");
        }
      } catch (err) {
        console.error("[PreEventClient] Erro no fetch:", err);
        if (!active) return;
        setError("Erro inesperado ao carregar evento.");
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [eventId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!eventId) {
      setError("Evento não encontrado.");
      return;
    }

    if (!name.trim()) {
      setError("O nome do evento não pode ficar vazio.");
      setSuccess(null);
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

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
          ticketPrice: ticketPrice.trim() || null,
          paymentLink: paymentLink.trim() || null,
          eventDate: eventDate || null,
          salesStart: salesStart || null,
          salesEnd: salesEnd || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Erro ao salvar alterações.");
        return;
      }

      setSuccess("Alterações salvas com sucesso.");
    } catch (err) {
      console.error("[PreEventClient] Erro ao salvar:", err);
      setError("Erro inesperado ao salvar alterações.");
    } finally {
      setSaving(false);
    }
  }

  const trimmedLocation = location.trim();
  const hasLocation = trimmedLocation.length > 0;

  const googleMapsUrl = hasLocation
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        trimmedLocation,
      )}`
    : null;

  const wazeUrl = hasLocation
    ? `https://waze.com/ul?q=${encodeURIComponent(
        trimmedLocation,
      )}&navigate=yes`
    : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <Link
          href="/dashboard/"
          className="text-xs font-medium text-slate-300 hover:text-slate-100"
        >
          ← Voltar
        </Link>

        <span className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-300 border border-slate-700">
          Evento pré pago
        </span>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-3xl w-full mx-auto flex flex-col gap-4">
        {loading && (
          <p className="text-sm text-slate-300">Carregando evento...</p>
        )}

        {!loading && error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        {!loading && !error && (
          <form
            onSubmit={handleSave}
            className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-6"
          >
            <h1 className="text-lg sm:text-xl font-semibold text-slate-50">
              Configurações do evento pré pago
            </h1>

            {success && (
              <p className="text-xs text-emerald-400">
                {success}
              </p>
            )}

            {/* Nome */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-300">
                Nome do evento
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                placeholder="Digite o nome do evento"
              />
            </div>

            {/* Data do evento */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-300">
                Data do evento
              </label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              />
              <p className="text-[10px] text-slate-500">
                Essa data é salva junto com o evento e pode aparecer nos convites.
              </p>
            </div>

            {/* Período de vendas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-300">
                  Início das vendas
                </label>
                <input
                  type="date"
                  value={salesStart}
                  onChange={(e) => setSalesStart(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                />
                <p className="text-[10px] text-slate-500">
                  Data a partir da qual você considera as vendas abertas.
                </p>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-300">
                  Fim das vendas
                </label>
                <input
                  type="date"
                  value={salesEnd}
                  onChange={(e) => setSalesEnd(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                />
                <p className="text-[10px] text-slate-500">
                  Data limite para a compra de ingressos (opcional).
                </p>
              </div>
            </div>

            {/* Local do evento */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-300">
                Local do evento
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                placeholder="Ex.: Rua Nome da Rua, 123 - Bairro, Cidade - UF"
              />
              <p className="text-[10px] text-slate-500">
                Formato sugerido: "Rua Nome da Rua, 123 - Bairro, Cidade - UF".
                Ex.: "Rua Joaquim Nabuco, 100 - Centro, Criciúma - SC".
              </p>
              <p className="text-[10px] text-slate-500">
                Esse endereço será usado para gerar atalhos para Google Maps e Waze.
              </p>
            </div>

            {/* Atalhos de mapa (se tiver local) */}
            {hasLocation && (
              <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <span className="text-xs font-medium text-slate-300">
                  Como chegar ao local
                </span>
                <p className="text-[11px] text-slate-500">
                  Use os atalhos abaixo para abrir o endereço direto no aplicativo de mapas.
                </p>

                <div className="flex flex-wrap gap-2 mt-1">
                  {googleMapsUrl && (
                    <a
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-lg border border-slate-600 px-3 py-1.5 text-[11px] font-semibold text-slate-100 hover:bg-slate-800/80"
                    >
                      Abrir no Google Maps
                    </a>
                  )}

                  {wazeUrl && (
                    <a
                      href={wazeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-lg border border-slate-600 px-3 py-1.5 text-[11px] font-semibold text-slate-100 hover:bg-slate-800/80"
                    >
                      Abrir no Waze
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Valor do ingresso */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-300">
                Valor do ingresso
              </label>
              <input
                type="text"
                value={ticketPrice}
                onChange={(e) => setTicketPrice(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                placeholder='Ex.: "R$ 50,00" ou "R$ 30,00 meia, R$ 60,00 inteira"'
              />
              <p className="text-[10px] text-slate-500">
                Campo livre para você descrever valores (inteira, meia, lotes, etc).
              </p>
            </div>

            {/* Link de pagamento */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-300">
                Link para pagamento / checkout
              </label>
              <input
                type="url"
                value={paymentLink}
                readOnly
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                placeholder="O link será gerado automaticamente a partir do código de convite."
              />
              <p className="text-[10px] text-slate-500">
                Copie esse link e envie aos convidados para realizarem o checkout
                do ingresso.
              </p>
              {paymentLink && (
                <p className="text-[10px] text-emerald-400 break-all">
                  {paymentLink}
                </p>
              )}
            </div>

            {/* Descrição */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-300">
                Descrição do evento
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 resize-y"
                placeholder="Detalhe regras de pagamento, política de reembolso, lotes, etc."
              />
            </div>

            <div className="flex justify-end">
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
