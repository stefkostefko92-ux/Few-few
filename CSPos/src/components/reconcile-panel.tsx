"use client";

// Сверка на прекъснати плащания (Прил. № 29, т. 2) — само за управител. Показва се, когато
// има продажба, спряла по време на плащане (процесът е спрял или записът след бона не е
// успял). Решението се взема по контролната лента на ФУ: има ли издаден бон или няма.

import { useCallback, useEffect, useState } from "react";
import { WarningOctagon, CheckCircle, ArrowCounterClockwise } from "@phosphor-icons/react";
import { Modal, Field, apiJson } from "@/components/ui";
import { formatEur } from "@/lib/money";
import { PAYMENT_TYPES } from "@/lib/constants";

interface Pending {
  id: string;
  unp: string;
  state: "PAYING" | "RECONCILE";
  stale: boolean;
  openedAt: string;
  payingAt: string | null;
  operator: { name: string; operatorCode: number };
  lines: number;
  payment: { type: keyof typeof PAYMENT_TYPES; totalCents: number; paidCard: number } | null;
  fiscalReceiptNo: string | null;
  terminalRef: string | null;
}

export function ReconcilePanel({ onChanged }: { onChanged?: () => void }) {
  const [items, setItems] = useState<Pending[] | null>(null);
  const [target, setTarget] = useState<Pending | null>(null);
  const [receiptNo, setReceiptNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiJson<{ drafts: Pending[] }>(await fetch("/api/sales/reconcile", { cache: "no-store" }));
      setItems(r.drafts);
    } catch {
      setItems([]); // касиер — няма достъп; панелът просто не се показва
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(resolution: "record" | "release") {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiJson<{ manualCardRefund?: boolean }>(
        await fetch("/api/sales/reconcile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            resolution === "record"
              ? { draftId: target.id, resolution, ...(receiptNo.trim() ? { receiptNumber: receiptNo.trim() } : {}) }
              : { draftId: target.id, resolution }
          ),
        })
      );
      setInfo(
        resolution === "record"
          ? `Продажба ${target.unp} е записана по издадения бон.`
          : r.manualCardRefund
            ? `Продажба ${target.unp} е върната за ново плащане. Картата е таксувана — върнете сумата ръчно от терминала.`
            : `Продажба ${target.unp} е върната за ново плащане.`
      );
      setTarget(null);
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Сверката не успя.");
    } finally {
      setBusy(false);
    }
  }

  if (!items || (items.length === 0 && !info)) return null;

  return (
    <section className="card p-5 space-y-3 border border-coral-600/30">
      <div className="flex items-start gap-3">
        <WarningOctagon size={24} weight="duotone" className="text-coral-600 shrink-0" />
        <div>
          <h2 className="font-bold text-lg">Прекъснати плащания</h2>
          <p className="text-sm text-ink-400">
            Проверете контролната лента на ФУ: ако бонът е издаден — запишете продажбата; ако няма бон — върнете я за ново плащане.
          </p>
        </div>
      </div>
      {info && <p className="text-sm font-medium text-mint-600">{info}</p>}
      <div className="divide-y divide-ink-800/60">
        {items.map((d) => (
          <div key={d.id} className="py-3 flex flex-wrap items-center gap-3 text-sm">
            <div className="flex-1 min-w-[14rem]">
              <div className="font-semibold tabular-nums selectable">{d.unp}</div>
              <div className="text-ink-400">
                {d.operator.name}, {d.lines} арт.
                {d.payment ? `, ${formatEur(d.payment.totalCents)} ${PAYMENT_TYPES[d.payment.type].toLowerCase()}` : ""}
                {d.fiscalReceiptNo ? `, бон № ${d.fiscalReceiptNo}` : ", бон не е потвърден"}
              </div>
            </div>
            <button
              className="btn-ghost text-sm"
              disabled={!d.stale}
              title={d.stale ? "Сверка" : "Плащането още тече — изчакайте две минути"}
              onClick={() => {
                setTarget(d);
                setReceiptNo("");
                setError(null);
                setInfo(null);
              }}
            >
              {d.stale ? "Сверка" : "Плащането тече…"}
            </button>
          </div>
        ))}
      </div>

      <Modal open={!!target} onClose={() => !busy && setTarget(null)} title={`Сверка на ${target?.unp ?? ""}`}>
        {target && (
          <div className="space-y-4 text-sm">
            <p className="text-ink-400">
              Операторът е {target.operator.name}. {target.payment ? `Сума ${formatEur(target.payment.totalCents)}.` : ""}{" "}
              {target.terminalRef ? "Картата е таксувана." : ""}
            </p>
            {!target.fiscalReceiptNo || target.fiscalReceiptNo === "(без номер)" ? (
              <Field label="Номер на издадения бон (от контролната лента)">
                <input value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} className="input w-full font-mono" inputMode="numeric" />
              </Field>
            ) : (
              <p>
                ФУ е издало бон № <b className="text-ink-100">{target.fiscalReceiptNo}</b>.
              </p>
            )}
            {error && <p className="text-coral-600 font-medium">{error}</p>}
            <div className="grid sm:grid-cols-2 gap-2">
              <button className="btn-success h-12" disabled={busy} onClick={() => void resolve("record")}>
                <CheckCircle size={18} /> Бонът е издаден — запиши
              </button>
              <button
                className="btn-ghost h-12"
                disabled={busy || Boolean(target.fiscalReceiptNo)}
                onClick={() => void resolve("release")}
                title={target.fiscalReceiptNo ? "Има издаден бон — продажбата се записва" : undefined}
              >
                <ArrowCounterClockwise size={18} /> Няма бон — върни за плащане
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
