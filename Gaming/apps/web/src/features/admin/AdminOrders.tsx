import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDualPrice } from "@aso/shared";
import { Badge, Button, Panel, cn } from "../../ui";
import { useAuthStore } from "../../lib/store";
import { isAdmin } from "../../app/RequireRole";
import { adminApi, type OrderItem } from "./adminApi";
import { ErrorPanel, errorMessage } from "./load";
import { UserDetailModal } from "./AdminUsers";

const STATUSES = ["", "completed", "refunded"] as const;

/** Global orders + refunds (§14). Read for staff; refund is ADMIN/OWNER. */
export function AdminOrders() {
  const { t, i18n } = useTranslation();
  const meRole = useAuthStore((s) => s.user?.role);
  const canRefund = isAdmin(meRole);

  const [status, setStatus] = useState<(typeof STATUSES)[number]>("");
  const [items, setItems] = useState<OrderItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [clawback, setClawback] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [openUser, setOpenUser] = useState<string | null>(null);

  async function load(c?: string) {
    setLoading(true);
    if (!c) setError(null);
    try {
      const r = await adminApi.orders(status, c);
      setItems((prev) => (c ? [...prev, ...r.items] : r.items));
      setCursor(r.nextCursor);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setItems([]);
    void load();
  }, [status]);

  async function refund(id: string) {
    setBusy(id);
    setNotice(null);
    try {
      const r = await adminApi.refundOrder(id, clawback);
      setItems((prev) => prev.map((o) => (o.id === id ? { ...o, status: "refunded" } : o)));
      setNotice(
        t("admin.refundDone", "Върнато. Отнети: {{gems}} камъка, {{chips}} чипа.", {
          gems: r.clawedGems,
          chips: r.clawedChips,
        }),
      );
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setBusy(null);
      setConfirmId(null);
      setClawback(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s || "all"}
            type="button"
            onClick={() => setStatus(s)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              status === s
                ? "border-brass-400/40 bg-brass-400/15 text-brass-300"
                : "border-brass-400/10 text-ink-300 hover:text-ink-100",
            )}
          >
            {s === "" ? t("admin.orderAll", "Всички") : t(`admin.order_${s}`, s)}
          </button>
        ))}
      </div>

      {error && items.length === 0 ? (
        <ErrorPanel error={error} onRetry={() => void load()} />
      ) : loading && items.length === 0 ? (
        <p className="text-ink-muted">{t("common.loading")}</p>
      ) : items.length === 0 ? (
        <Panel className="py-10 text-center text-ink-muted">{t("admin.ordersEmpty", "Няма поръчки.")}</Panel>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((o) => (
            <Panel key={o.id} className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm text-ink-100">
                  <Badge tone="felt">{o.sku ?? o.kind ?? "—"}</Badge>
                  <span className="tnum text-brass-300">{formatDualPrice(o.priceCents)}</span>
                  <Badge tone={o.status === "refunded" ? "felt" : "brass"}>
                    {t(`admin.order_${o.status}`, o.status)}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-ink-muted">
                  <button type="button" className="text-brass-300 underline" onClick={() => setOpenUser(o.userId)}>
                    {o.userName ?? o.userEmail ?? `${o.userId.slice(0, 8)}…`}
                  </button>{" "}
                  · {new Date(o.createdAt).toLocaleString(i18n.language)} ·{" "}
                  <span className="font-mono">{o.stripeId.slice(0, 16)}…</span>
                </div>
              </div>
              {canRefund && o.status === "completed" ? (
                confirmId === o.id ? (
                  <div className="flex flex-col items-end gap-1.5">
                    <label className="flex items-center gap-2 text-xs text-ink-100">
                      <input type="checkbox" checked={clawback} onChange={(e) => setClawback(e.target.checked)} />
                      {t("admin.refundClawback", "Отнеми кредитираните камъни/чипове")}
                    </label>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setConfirmId(null);
                          setClawback(false);
                        }}
                      >
                        {t("admin.cancel", "Отказ")}
                      </Button>
                      <Button loading={busy === o.id} className="!bg-loss" onClick={() => refund(o.id)}>
                        {t("admin.refundConfirm", "Потвърди връщане")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="ghost" onClick={() => setConfirmId(o.id)}>
                    {t("admin.refund", "Върни")}
                  </Button>
                )
              ) : null}
            </Panel>
          ))}
        </ul>
      )}

      {notice ? <p className="text-center text-sm text-ink-100">{notice}</p> : null}
      {cursor && !loading ? (
        <Button variant="ghost" onClick={() => void load(cursor)}>
          {t("admin.loadMore")}
        </Button>
      ) : null}

      {openUser ? (
        <UserDetailModal id={openUser} onClose={() => setOpenUser(null)} onChanged={() => undefined} />
      ) : null}
    </div>
  );
}
