import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Panel } from "../../ui";
import { api } from "../../lib/api";
import { useAuthStore } from "../../lib/store";

export type VipStatus = Awaited<ReturnType<typeof api.vipStatus>>;

const KNOWN_STATES = new Set(["active", "trialing", "past_due", "unpaid", "paused"]);

/** VIP статусът на влезлия играч (null докато се зарежда / при грешка / без вход). */
export function useVipStatus(): VipStatus | null {
  const user = useAuthStore((s) => s.user);
  const [vip, setVip] = useState<VipStatus | null>(null);
  useEffect(() => {
    if (!user) {
      setVip(null);
      return;
    }
    let alive = true;
    api
      .vipStatus()
      .then((v) => {
        if (alive) setVip(v);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [user]);
  return vip;
}

/**
 * Карта „Твоят VIP абонамент“ с видим бутон за управление/ОТКАЗ (Stripe
 * Customer Portal). ЕС: отказът трябва да е лесно достъпен — затова бутонът е
 * винаги видим за абоната, с ясен текст, а не скрит в меню. Сумите и правата
 * не се решават тук — порталът е на Stripe, промените идват през webhook.
 */
export function SubscriptionPanel({ vip, className = "" }: { vip: VipStatus | null; className?: string }) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sub = vip?.subscription;
  if (!sub) return null;

  async function openPortal() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api.billingPortal();
      window.location.href = url;
    } catch {
      setError(t("shop.sub.portalError"));
      setBusy(false);
    }
  }

  const state = KNOWN_STATES.has(sub.status) ? t(`shop.sub.state.${sub.status}`) : sub.status;
  const until = new Date(sub.currentPeriodEnd).toLocaleDateString(i18n.language);

  return (
    <Panel className={`border-brass-400/40 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg text-ink-100">{t("shop.sub.title")}</h2>
        <Badge tone="vip">VIP {sub.tier}</Badge>
      </div>
      <p className="mt-1 text-sm text-ink-300">
        {t("shop.sub.status", { status: state })} · {t("shop.sub.periodEnd", { date: until })}
      </p>
      <p className="mt-1 text-xs text-ink-muted">{t("shop.sub.manageHint")}</p>
      <Button variant="felt" loading={busy} onClick={() => void openPortal()} className="mt-3 w-full sm:w-auto">
        {t("shop.sub.manage")}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-loss">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}
