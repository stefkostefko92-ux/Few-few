import React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useStore } from '../lib/store';

const CONTACT_EMAIL = 'info@carbonstealth.eu';

/**
 * Пълноекранен ban screen. Показва се, когато сървърът върне 403
 * { error:'banned' } (акаунт/IP/устройство спрян — напр. chargeback).
 * Блокира интеракцията с играта и обяснява причината + път за контакт
 * (DSA чл. 17 — обосновка достига засегнатия и през вътрешната поща).
 */
export default function BanScreen(): React.ReactElement | null {
  const { t, i18n } = useTranslation();
  const banned = useStore((s) => s.banned);
  const logout = useStore((s) => s.logout);
  if (!banned) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={t('ban.title', { defaultValue: 'Access suspended' })}
      style={{
        position: 'fixed', inset: 0, zIndex: 100000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(circle at 50% 30%, #1a0d10, #05060a 70%)',
        padding: 24, textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 460 }}>
        <div aria-hidden="true" style={{ fontSize: 56, marginBottom: 12 }}>⛔</div>
        <h1 style={{ margin: '0 0 10px', color: '#e85a4f', fontSize: 26, letterSpacing: 0.5 }}>
          {banned.until > 0
            ? t('ban.titleTemporary', { defaultValue: 'Access temporarily suspended' })
            : t('ban.title', { defaultValue: 'Access suspended' })}
        </h1>
        <p style={{ color: 'var(--text-2, #b8bcc8)', lineHeight: 1.5, margin: '0 0 8px' }}>
          {banned.reason}
        </p>
        {banned.until > 0 && (
          <p style={{ color: 'var(--gold-1, #d6a13d)', lineHeight: 1.5, margin: '0 0 8px', fontWeight: 600 }}>
            {t('ban.restoredOn', { defaultValue: 'Access is restored on {{date}}.', date: new Date(banned.until).toLocaleString(i18n.language) })}
          </p>
        )}
        <p style={{ color: 'var(--text-3, #7a7f8c)', fontSize: 13, lineHeight: 1.5, margin: '0 0 22px' }}>
          <Trans
            i18nKey="ban.contact"
            values={{ email: CONTACT_EMAIL }}
            components={{ mail: <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'var(--gold-1, #d6a13d)' }} /> }}
          />
        </p>
        <button
          className="btn"
          onClick={() => { logout(); window.location.href = '/'; }}
          style={{ minWidth: 140 }}
        >
          {t('ban.returnToStart', { defaultValue: 'Return to start' })}
        </button>
      </div>
    </div>
  );
}
