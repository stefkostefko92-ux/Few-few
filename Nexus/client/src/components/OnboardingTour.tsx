import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * First-time-player onboarding tour. Shows once per character (flagged in
 * localStorage) as a 4-step floating tooltip overlay walking the player
 * through Hunt → Inventory → Map → Forge. Skippable any time.
 */

const STORAGE_KEY = 'nd_onboarding_done';

// Текстовете се превеждат при рендер — тук са само i18n ключовете.
const STEPS = [
  {
    titleKey: 'onboarding.step1Title',
    bodyKey: 'onboarding.step1Body',
    ctaKey: 'onboarding.step1Cta',
    href: '/app/hunting',
  },
  {
    titleKey: 'onboarding.step2Title',
    bodyKey: 'onboarding.step2Body',
    ctaKey: 'onboarding.step2Cta',
    href: '/app/inventory',
  },
  {
    titleKey: 'onboarding.step3Title',
    bodyKey: 'onboarding.step3Body',
    ctaKey: 'onboarding.step3Cta',
    href: '/app/quests',
  },
  {
    titleKey: 'onboarding.step4Title',
    bodyKey: 'onboarding.step4Body',
    ctaKey: 'onboarding.step4Cta',
    href: '/app/forge',
  },
];

export default function OnboardingTour(): React.ReactElement | null {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch {/* ignore */}
  }, []);

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch {/* ignore */}
    setOpen(false);
  }

  if (!open) return null;
  const s = STEPS[step];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, .58)',
        zIndex: 9000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <div
        style={{
          maxWidth: 460,
          background: 'linear-gradient(180deg, rgba(20, 14, 6, .98), rgba(10, 8, 4, .99))',
          border: '1px solid var(--gold-3)',
          borderRadius: 16,
          padding: 28,
          color: '#f4e4ba',
          boxShadow: '0 0 32px rgba(214, 161, 61, .25), 0 24px 60px rgba(0, 0, 0, .8)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--gold-2)' }}>
            {t('onboarding.stepOf', { current: step + 1, total: STEPS.length })}
          </div>
          <button
            onClick={dismiss}
            style={{
              background: 'transparent', border: 'none', color: 'var(--text-3)',
              cursor: 'pointer', fontSize: 12, padding: 4,
            }}
            aria-label={t('onboarding.skipTour')}
          >
            {t('onboarding.skip')} ✕
          </button>
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--gold-1)', margin: '0 0 10px', fontSize: 24 }}>
          {t(s.titleKey)}
        </h2>
        <p style={{ lineHeight: 1.6, fontSize: 14, margin: '0 0 22px' }}>
          {t(s.bodyKey)}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {STEPS.map((_, i) => (
              <span
                key={i}
                style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: i === step ? 'var(--gold-1)' : 'rgba(214, 161, 61, .25)',
                  transition: 'background .2s',
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <button className="btn btn-sm" onClick={() => setStep(step - 1)}>{t('onboarding.back')}</button>
            )}
            {step < STEPS.length - 1 ? (
              <>
                <Link className="btn btn-sm btn-primary" to={s.href} onClick={() => setStep(step + 1)}>
                  {t(s.ctaKey)} →
                </Link>
              </>
            ) : (
              <Link className="btn btn-sm btn-primary" to={s.href} onClick={dismiss}>
                {t(s.ctaKey)} →
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
