"use client";

import { useState, useTransition } from "react";
import {
  startCheckoutAction,
  openPortalAction,
  type BillingResult,
} from "@/app/dashboard/sites/[slug]/billing/actions";

type Init = {
  slug: string;
  premium: boolean;
  statusLabel: string;
  renewsAt: string | null; // вече форматирана дата или null
  hasCustomer: boolean;
  configured: boolean; // Stripe е настроен (има ключове)
  priceLabel: string; // напр. „10 €/месец" — само за показване, цената е от Stripe
};

export function BillingPanel({ init }: { init: Init }) {
  // Съгласие по чл. 16(м) от Дир. 2011/83/ЕС: за да започне веднага доставката
  // на дигиталната услуга и да отпадне 14-дневното право на отказ, потребителят
  // дава ИЗРИЧНО съгласие. Отметката е ОТДЕЛНА и НЕ е сложена по подразбиране.
  const [consent, setConsent] = useState(false);
  const [msg, setMsg] = useState<BillingResult | null>(null);
  const [pending, start] = useTransition();

  const go = (fn: () => Promise<BillingResult>) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      if (r.url) window.location.href = r.url; // пренасочване към Stripe
    });

  if (!init.configured) {
    return (
      <section className="card space-y-2">
        <h2 className="font-medium text-white">Билинг</h2>
        <p className="text-sm text-amber-400">
          Билингът не е настроен (липсват Stripe ключове). Плащанията ще са
          достъпни, след като администраторът зададе{" "}
          <code className="text-ink-400">STRIPE_*</code> променливите.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {/* Текущ план */}
      <section className="card space-y-2">
        <h2 className="font-medium text-white">Текущ план</h2>
        {init.premium ? (
          <p className="text-sm text-green-400">
            ✓ Премиум — без воден знак „Carbon Stealth“. Статус: {init.statusLabel}.
          </p>
        ) : (
          <p className="text-sm text-ink-400">
            Безплатен план. Публикуваните сайтове показват малък воден знак
            „Създадено с Carbon Stealth“ във футъра.
          </p>
        )}
        {init.renewsAt && (
          <p className="text-xs text-ink-500">Подновяване/край на периода: {init.renewsAt}</p>
        )}
      </section>

      {/* Направи премиум */}
      {!init.premium && (
        <section className="card space-y-3">
          <h2 className="font-medium text-white">Премиум абонамент</h2>
          <p className="text-sm text-ink-300">
            {init.priceLabel}. Маха водния знак и отключва премиум функции.
            Плащането е през защитената страница на Stripe (картата не докосва
            нашия сървър). Крайната цена с ДДС се изчислява от Stripe според
            държавата ви.
          </p>

          <label className="flex items-start gap-2 text-xs text-ink-300">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              Съгласявам се услугата (премиум функциите) да започне веднага и
              потвърждавам, че с това{" "}
              <b>губя 14-дневното право на отказ</b> за вече предоставената
              дигитална услуга (чл. 16, б. „м“ от Дир. 2011/83/ЕС).
            </span>
          </label>

          <button
            className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50"
            disabled={pending || !consent}
            onClick={() => go(() => startCheckoutAction(init.slug))}
          >
            {pending ? "Пренасочване…" : "Направи премиум"}
          </button>
          {!consent && (
            <p className="text-[11px] text-ink-600">
              Отметнете съгласието, за да продължите към плащане.
            </p>
          )}
        </section>
      )}

      {/* Управление на абонамента */}
      {init.hasCustomer && (
        <section className="card space-y-3">
          <h2 className="font-medium text-white">Управление на абонамента</h2>
          <p className="text-sm text-ink-300">
            Смяна на метод на плащане, фактури и прекратяване — през защитения
            портал на Stripe.
          </p>
          <button
            className="btn-ghost px-3 py-1.5 text-xs disabled:opacity-50"
            disabled={pending}
            onClick={() => go(() => openPortalAction(init.slug))}
          >
            {pending ? "Отваряне…" : "Управлявай абонамента"}
          </button>
        </section>
      )}

      {msg?.error && <p className="text-sm text-red-400">{msg.error}</p>}
    </div>
  );
}
