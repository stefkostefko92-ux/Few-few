"use client";

// Смяна на касиера: статус, служебно въвеждане/извеждане на суми,
// последни бонове със сторно, закриване с преброяване и Z-отчет.

import { useCallback, useEffect, useState } from "react";
import { Money, ArrowDown, ArrowUp, XCircle, Printer, FileText } from "@phosphor-icons/react";
import { Modal, Field, Badge, Spinner, apiJson } from "@/components/ui";
import { formatEur, parseCents } from "@/lib/money";
import { STORNO_REASONS, PAYMENT_TYPES } from "@/lib/constants";

interface ShiftData {
  shift: {
    id: string;
    openedAt: string;
    openingCashCents: number;
  } | null;
  stats?: {
    salesCount: number;
    stornoCount: number;
    totalCents: number;
    cashCents: number;
    cardCents: number;
    cashInCents: number;
    cashOutCents: number;
    expectedCashCents: number;
  };
}

interface Sale {
  id: string;
  number: number;
  unp: string;
  status: string;
  totalCents: number;
  paymentType: keyof typeof PAYMENT_TYPES;
  fiscalReceiptNo: string | null;
  createdAt: string;
  stornoReason: string | null;
  user: { name: string };
  invoice: { number: number } | null;
}

export default function ShiftsPage() {
  const [data, setData] = useState<ShiftData | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [cashModal, setCashModal] = useState<"IN" | "OUT" | null>(null);
  const [closeModal, setCloseModal] = useState(false);
  const [stornoSale, setStornoSale] = useState<Sale | null>(null);
  const [invoiceSale, setInvoiceSale] = useState<Sale | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await apiJson<ShiftData>(await fetch("/api/shifts"));
    setData(d);
    if (d.shift) {
      const s = await apiJson<{ sales: Sale[] }>(
        await fetch(`/api/sales?shiftId=${d.shift.id}`)
      );
      setSales(s.sales);
    } else {
      setSales([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return <Spinner label="Зареждане…" />;

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">Смяна</h1>
        {data.shift && (
          <div className="flex gap-2">
            <button onClick={() => setCashModal("IN")} className="btn-ghost text-sm">
              <ArrowDown size={18} /> Служебно въвеждане
            </button>
            <button onClick={() => setCashModal("OUT")} className="btn-ghost text-sm">
              <ArrowUp size={18} /> Служебно извеждане
            </button>
            <button onClick={() => setCloseModal(true)} className="btn-danger text-sm">
              Закрий смяната (Z-отчет)
            </button>
          </div>
        )}
      </div>

      {message && (
        <div className="bg-mint-600/10 border border-mint-600/30 text-mint-600 rounded-xl px-4 py-3 text-sm font-medium">
          {message}
        </div>
      )}

      {!data.shift ? (
        <div className="card p-8 text-center text-ink-400">
          <Money size={40} className="mx-auto mb-3 text-brand-700" weight="duotone" />
          Нямате отворена смяна. Отворете я от екрана „Продажби“.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              ["Отворена в", new Date(data.shift.openedAt).toLocaleTimeString("bg-BG")],
              ["Оборот", formatEur(data.stats?.totalCents ?? 0)],
              [
                "Бонове / сторно",
                `${data.stats?.salesCount ?? 0} / ${data.stats?.stornoCount ?? 0}`,
              ],
              ["Очаквано в касата", formatEur(data.stats?.expectedCashCents ?? 0)],
            ].map(([label, value]) => (
              <div key={label} className="card p-5">
                <div className="text-sm text-ink-400 font-medium">{label}</div>
                <div className="text-xl font-black mt-1 tabular-nums">{value}</div>
              </div>
            ))}
          </div>

          <section className="card overflow-hidden">
            <h2 className="font-bold px-5 py-4 border-b border-ink-800">Бонове в смяната</h2>
            <table className="w-full text-sm">
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id} className="border-b border-ink-800/60 last:border-0 hover:bg-ink-850/50">
                    <td className="py-2.5 px-5 font-mono text-ink-400 w-20">№ {s.number}</td>
                    <td className="py-2.5 px-2">
                      {s.status === "STORNO" ? (
                        <Badge tone="danger">
                          СТОРНО{s.stornoReason ? ` · ${STORNO_REASONS[s.stornoReason as keyof typeof STORNO_REASONS]}` : ""}
                        </Badge>
                      ) : (
                        <Badge tone="success">{PAYMENT_TYPES[s.paymentType]}</Badge>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-ink-400">
                      {new Date(s.createdAt).toLocaleTimeString("bg-BG")}
                    </td>
                    <td className="py-2.5 px-2 text-right font-bold tabular-nums">
                      {formatEur(s.totalCents)}
                    </td>
                    <td className="py-2.5 px-5 text-right w-56 whitespace-nowrap">
                      {s.status === "COMPLETED" && (
                        <>
                          {s.invoice ? (
                            <Badge tone="info">
                              фактура № {String(s.invoice.number).padStart(10, "0").slice(-6)}
                            </Badge>
                          ) : (
                            <button
                              className="btn-ghost !py-1.5 !px-2.5 text-xs"
                              onClick={() => setInvoiceSale(s)}
                            >
                              <FileText size={14} /> Фактура
                            </button>
                          )}
                          <button
                            className="btn-ghost !py-1.5 !px-2.5 text-xs ml-1"
                            onClick={() => setStornoSale(s)}
                          >
                            <XCircle size={14} /> Сторно
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {sales.length === 0 && (
                  <tr>
                    <td className="py-8 text-center text-ink-500" colSpan={5}>
                      Още няма бонове в тази смяна.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      )}

      {/* Служебни суми */}
      <CashModal
        type={cashModal}
        onClose={() => setCashModal(null)}
        onDone={(msg, text) => {
          setCashModal(null);
          setMessage(msg);
          setReceipt(text);
          void load();
        }}
      />

      {/* Закриване */}
      <CloseModal
        open={closeModal}
        expected={data.stats?.expectedCashCents ?? 0}
        onClose={() => setCloseModal(false)}
        onDone={(msg, text) => {
          setCloseModal(false);
          setMessage(msg);
          setReceipt(text);
          void load();
        }}
      />

      {/* Сторно */}
      <StornoModal
        sale={stornoSale}
        onClose={() => setStornoSale(null)}
        onDone={(msg, text) => {
          setStornoSale(null);
          setMessage(msg);
          setReceipt(text);
          void load();
        }}
      />

      {/* Фактура */}
      <InvoiceModal
        sale={invoiceSale}
        onClose={() => setInvoiceSale(null)}
        onDone={(msg, text) => {
          setInvoiceSale(null);
          setMessage(msg);
          setReceipt(text);
          void load();
        }}
      />

      <Modal open={receipt !== null} onClose={() => setReceipt(null)} title="Документ">
        <pre className="font-mono text-[13px] leading-relaxed bg-ink-950 rounded-xl p-4 overflow-x-auto whitespace-pre">
          {receipt}
        </pre>
        <button className="btn-primary w-full mt-4" onClick={() => setReceipt(null)}>
          <Printer size={18} /> Затвори
        </button>
      </Modal>
    </div>
  );
}

function CashModal({
  type,
  onClose,
  onDone,
}: {
  type: "IN" | "OUT" | null;
  onClose: () => void;
  onDone: (message: string, receiptText: string | null) => void;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (type) {
      setAmount("");
      setReason("");
      setError(null);
    }
  }, [type]);

  if (!type) return null;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const cents = parseCents(amount);
      if (isNaN(cents) || cents <= 0) throw new Error("Невалидна сума.");
      if (reason.trim().length < 2) throw new Error("Посочете основание.");
      const r = await apiJson<{ receiptText: string | null }>(
        await fetch("/api/shifts/cash", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, amountCents: cents, reason: reason.trim() }),
        })
      );
      onDone(
        type === "IN" ? "Сумата е служебно въведена." : "Сумата е служебно изведена.",
        r.receiptText
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Грешка.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={type === "IN" ? "Служебно въвеждане на суми" : "Служебно извеждане на суми"}
    >
      <div className="space-y-4">
        <Field label="Сума (EUR)">
          <input
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            className="input w-full h-12 text-center text-xl font-bold"
          />
        </Field>
        <Field label="Основание">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={type === "IN" ? "зареждане с дребни" : "инкасо към офиса"}
            className="input w-full"
          />
        </Field>
        {error && <p className="text-coral-600 text-sm">{error}</p>}
        <button onClick={save} disabled={busy} className="btn-primary w-full h-12">
          {busy ? "Печата се служебен бон…" : "Потвърди"}
        </button>
      </div>
    </Modal>
  );
}

function CloseModal({
  open,
  expected,
  onClose,
  onDone,
}: {
  open: boolean;
  expected: number;
  onClose: () => void;
  onDone: (message: string, receiptText: string | null) => void;
}) {
  const [counted, setCounted] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCounted("");
      setError(null);
    }
  }, [open]);

  const countedCents = parseCents(counted);
  const diff = isNaN(countedCents) ? null : countedCents - expected;

  async function close() {
    setBusy(true);
    setError(null);
    try {
      if (isNaN(countedCents) || countedCents < 0) throw new Error("Невалидна сума.");
      const r = await apiJson<{ differenceCents: number; zReportText: string | null }>(
        await fetch("/api/shifts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "close", closingCashCents: countedCents }),
        })
      );
      onDone(
        r.differenceCents === 0
          ? "Смяната е закрита. Касата излиза точно."
          : `Смяната е закрита. Разлика: ${formatEur(r.differenceCents)}.`,
        r.zReportText
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Грешка.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Закриване на смяна">
      <div className="space-y-4">
        <p className="text-ink-400 text-sm">
          Очаквана касова наличност по системата:{" "}
          <b className="text-ink-100">{formatEur(expected)}</b>. Пребройте касата и въведете
          реалната сума — след потвърждение ФУ ще пусне дневен финансов отчет (Z).
        </p>
        <Field label="Преброена наличност (EUR)">
          <input
            autoFocus
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            className="input w-full h-12 text-center text-xl font-bold"
          />
        </Field>
        {diff !== null && (
          <p className={`text-center font-semibold ${diff === 0 ? "text-mint-600" : "text-coral-600"}`}>
            {diff === 0 ? "Точно." : `Разлика: ${formatEur(diff)}`}
          </p>
        )}
        {error && <p className="text-coral-600 text-sm">{error}</p>}
        <button onClick={close} disabled={busy} className="btn-danger w-full h-12">
          {busy ? "Пуска се Z-отчет…" : "Закрий смяната"}
        </button>
      </div>
    </Modal>
  );
}

function StornoModal({
  sale,
  onClose,
  onDone,
}: {
  sale: Sale | null;
  onClose: () => void;
  onDone: (message: string, receiptText: string | null) => void;
}) {
  const [reason, setReason] = useState<keyof typeof STORNO_REASONS>("OPERATOR_ERROR");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (sale) {
      setReason("OPERATOR_ERROR");
      setError(null);
    }
  }, [sale]);

  if (!sale) return null;

  async function storno() {
    if (!sale) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiJson<{ receiptText: string | null }>(
        await fetch(`/api/sales/${sale.id}/storno`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        })
      );
      onDone(`Бон № ${sale.number} е сторниран.`, r.receiptText);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Грешка.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Сторно на бон № ${sale.number}`}>
      <div className="space-y-4">
        <p className="text-ink-400 text-sm">
          Сума: <b className="text-ink-100">{formatEur(sale.totalCents)}</b> · УНП{" "}
          <span className="font-mono">{sale.unp}</span>
        </p>
        <Field label="Причина (чл. 31 Наредба Н-18)">
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as keyof typeof STORNO_REASONS)}
            className="input w-full"
          >
            {Object.entries(STORNO_REASONS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <p className="text-xs text-ink-500">
          Изисква права на управител. При „връщане/рекламация“ и „операторска грешка“
          стоката се връща в склада; сторно бонът се печата на ФУ.
        </p>
        {error && <p className="text-coral-600 text-sm">{error}</p>}
        <button onClick={storno} disabled={busy} className="btn-danger w-full h-12">
          {busy ? "Печата се сторно бон…" : "Потвърди сторно"}
        </button>
      </div>
    </Modal>
  );
}

function InvoiceModal({
  sale,
  onClose,
  onDone,
}: {
  sale: Sale | null;
  onClose: () => void;
  onDone: (message: string, text: string | null) => void;
}) {
  const [form, setForm] = useState({ name: "", eik: "", vat: "", address: "", mol: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (sale) {
      setForm({ name: "", eik: "", vat: "", address: "", mol: "" });
      setError(null);
    }
  }, [sale]);

  if (!sale) return null;

  async function issue() {
    if (!sale) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiJson<{ invoiceText: string | null }>(
        await fetch("/api/invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            saleId: sale.id,
            buyerName: form.name.trim(),
            buyerEik: form.eik.trim() || undefined,
            buyerVat: form.vat.trim() || undefined,
            buyerAddress: form.address.trim() || undefined,
            buyerMol: form.mol.trim() || undefined,
          }),
        })
      );
      onDone(`Фактура към бон № ${sale.number} е издадена.`, r.invoiceText);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Грешка при издаване.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Фактура към бон № ${sale.number}`} wide>
      <div className="space-y-4">
        <p className="text-ink-400 text-sm">
          Сума: <b className="text-ink-100">{formatEur(sale.totalCents)}</b> · фактура по чл. 114
          ЗДДС с последователна номерация. Въведете данните на получателя.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Field label="Получател (юридическо лице / име)">
              <input
                autoFocus
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="input w-full"
              />
            </Field>
          </div>
          <Field label="ЕИК / Булстат">
            <input value={form.eik} onChange={(e) => setForm((f) => ({ ...f, eik: e.target.value }))} className="input w-full" />
          </Field>
          <Field label="ЗДДС номер">
            <input value={form.vat} onChange={(e) => setForm((f) => ({ ...f, vat: e.target.value }))} className="input w-full" />
          </Field>
          <Field label="Адрес">
            <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="input w-full" />
          </Field>
          <Field label="МОЛ / получил">
            <input value={form.mol} onChange={(e) => setForm((f) => ({ ...f, mol: e.target.value }))} className="input w-full" />
          </Field>
        </div>
        {error && <p className="text-coral-600 text-sm">{error}</p>}
        <button disabled={!form.name.trim() || busy} onClick={issue} className="btn-primary w-full h-12">
          {busy ? "Издава се…" : "Издай фактура"}
        </button>
      </div>
    </Modal>
  );
}
