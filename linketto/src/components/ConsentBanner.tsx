'use client';

// CMP банер + Google Consent Mode v2 (Basic) + Meta Pixel consent.
//
// Правила (ePrivacy/GDPR, виж и SupremeAdManager/RESEARCH.md §4):
// 1. БЕЗ съгласие никакъв рекламен таг не се зарежда (Basic mode — не „зареди и замълчи“).
// 2. Consent Mode v2 default = denied за 4-те сигнала, зададен ПРЕДИ gtag тагът да тръгне.
// 3. „Приемам“ и „Отказвам“ са равностойни бутони; изборът се пази 180 дни.
// 4. Изборът може да се преразгледа по всяко време (бутон в footer-а → събитие).
// Собствената аналитика на linketto е без бисквитки и НЕ зависи от този банер.

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_S,
  adTagsConfigured,
  consentFromCookieHeader,
  serializeConsent,
  type ConsentChoice,
} from '@/lib/consent';

export const MANAGE_CONSENT_EVENT = 'linketto:consent:manage';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean };
    _fbq?: unknown;
  }
}

function writeConsentCookie(choice: ConsentChoice) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(
    serializeConsent(choice),
  )}; Max-Age=${CONSENT_MAX_AGE_S}; Path=/; SameSite=Lax${secure}`;
}

/** Consent Mode v2: default denied ПРЕДИ тага; после update според избора. */
function ensureGtagStub() {
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag('consent', 'default', {
      ad_storage: 'denied',
      analytics_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    window.gtag('js', new Date());
  }
}

function loadGoogleTag(googleAdsId: string) {
  ensureGtagStub();
  window.gtag!('consent', 'update', {
    ad_storage: 'granted',
    analytics_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
  });
  window.gtag!('config', googleAdsId);
  if (!document.querySelector(`script[src^="https://www.googletagmanager.com/gtag/js"]`)) {
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleAdsId)}`;
    document.head.appendChild(s);
  }
}

function loadMetaPixel(metaPixelId: string) {
  if (!window.fbq) {
    const fbq: Window['fbq'] = function fbqShim(...args: unknown[]) {
      fbq!.queue!.push(args);
    };
    fbq.queue = [] as unknown[];
    fbq.loaded = true;
    window.fbq = fbq;
    window._fbq = fbq;
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(s);
  }
  window.fbq!('consent', 'grant');
  window.fbq!('init', metaPixelId);
  window.fbq!('track', 'PageView');
}

function revokeTags() {
  // При оттегляне: сигнализираме denied/revoke; нови тагове не се зареждат.
  if (window.gtag) {
    window.gtag('consent', 'update', {
      ad_storage: 'denied',
      analytics_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  }
  if (window.fbq) {
    window.fbq('consent', 'revoke');
  }
}

export function ConsentBanner({
  googleAdsId,
  metaPixelId,
}: {
  googleAdsId?: string;
  metaPixelId?: string;
}) {
  const t = useTranslations('consent');
  const locale = useLocale();
  const configured = adTagsConfigured(googleAdsId, metaPixelId);
  const [visible, setVisible] = useState(false);

  const applyChoice = useCallback(
    (choice: ConsentChoice) => {
      if (choice === 'granted') {
        if (googleAdsId?.trim()) loadGoogleTag(googleAdsId.trim());
        if (metaPixelId?.trim()) loadMetaPixel(metaPixelId.trim());
      } else {
        revokeTags();
      }
    },
    [googleAdsId, metaPixelId],
  );

  const decide = useCallback(
    (choice: ConsentChoice) => {
      writeConsentCookie(choice);
      applyChoice(choice);
      setVisible(false);
    },
    [applyChoice],
  );

  useEffect(() => {
    if (!configured) return;
    const stored = consentFromCookieHeader(document.cookie);
    if (stored === 'granted') {
      applyChoice('granted');
    } else if (stored === null) {
      setVisible(true);
    }
    // Footer бутонът „Управление на бисквитки“ отваря банера отново.
    const onManage = () => setVisible(true);
    window.addEventListener(MANAGE_CONSENT_EVENT, onManage);
    return () => window.removeEventListener(MANAGE_CONSENT_EVENT, onManage);
  }, [configured, applyChoice]);

  if (!configured || !visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={t('title')}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-800 bg-slate-950/95 px-6 py-4 text-sm text-slate-200 backdrop-blur"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center">
        <p className="flex-1 leading-relaxed">
          <span className="font-semibold">{t('title')}</span> {t('body')}{' '}
          <a href={`/${locale}/cookies`} className="underline hover:text-white">
            {t('moreInfo')}
          </a>
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => decide('denied')}
            className="rounded-lg border border-slate-600 px-4 py-2 font-medium hover:bg-slate-800"
          >
            {t('decline')}
          </button>
          <button
            type="button"
            onClick={() => decide('granted')}
            className="rounded-lg bg-white px-4 py-2 font-semibold text-slate-900 hover:bg-slate-200"
          >
            {t('accept')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Footer бутон: отваря банера за преразглеждане на избора (GDPR: оттегляне по всяко време). */
export function ManageConsentButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(MANAGE_CONSENT_EVENT))}
      className="transition hover:text-white"
    >
      {label}
    </button>
  );
}
