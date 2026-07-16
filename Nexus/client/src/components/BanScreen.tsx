import React from 'react';
import { useStore } from '../lib/store';

/**
 * Пълноекранен ban screen. Показва се, когато сървърът върне 403
 * { error:'banned' } (акаунт/IP/устройство спрян — напр. chargeback).
 * Блокира интеракцията с играта и обяснява причината + път за контакт
 * (DSA чл. 17 — обосновка достига засегнатия и през вътрешната поща).
 */
export default function BanScreen(): React.ReactElement | null {
  const banned = useStore((s) => s.banned);
  const logout = useStore((s) => s.logout);
  if (!banned) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Access suspended"
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
          {banned.until > 0 ? 'Access temporarily suspended' : 'Access suspended'}
        </h1>
        <p style={{ color: 'var(--text-2, #b8bcc8)', lineHeight: 1.5, margin: '0 0 8px' }}>
          {banned.reason}
        </p>
        {banned.until > 0 && (
          <p style={{ color: 'var(--gold-1, #d6a13d)', lineHeight: 1.5, margin: '0 0 8px', fontWeight: 600 }}>
            Access is restored on {new Date(banned.until).toLocaleString()}.
          </p>
        )}
        <p style={{ color: 'var(--text-3, #7a7f8c)', fontSize: 13, lineHeight: 1.5, margin: '0 0 22px' }}>
          If you believe this is a mistake, contact{' '}
          <a href="mailto:info@carbonstealth.eu" style={{ color: 'var(--gold-1, #d6a13d)' }}>
            info@carbonstealth.eu
          </a>
          . Any statement of reasons has also been delivered to your in-game mail (EU DSA Art. 17).
        </p>
        <button
          className="btn"
          onClick={() => { logout(); window.location.href = '/'; }}
          style={{ minWidth: 140 }}
        >
          Return to start
        </button>
      </div>
    </div>
  );
}
