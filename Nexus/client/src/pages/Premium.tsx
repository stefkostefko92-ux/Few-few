import React, { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useStore } from '../lib/store';

interface ProductEffect {
  gems?: number;
  name_change?: boolean;
  rest?: boolean;
  energy_refill?: number;
}
interface Product {
  kind: string;
  name: string;
  tagline: string;
  description: string;
  price_cents: number;
  currency?: string;
  popular?: boolean;
  best_value?: boolean;
  effects: ProductEffect;
}

const CURRENCY_SYMBOL: Record<string, string> = { eur: '€', usd: '$', gbp: '£' };
function fmtPrice(cents: number, currency: string = 'eur') {
  const sym = CURRENCY_SYMBOL[currency.toLowerCase()] || '€';
  const value = (cents / 100).toFixed(2).replace('.', ',');
  return `${sym}${value}`;
}

interface HistoryRow {
  id: number;
  kind: string;
  amount_cents: number;
  currency: string;
  gems_granted: number;
  status: string;
  mode: string;
  created_at: number;
  completed_at: number | null;
}

export default function Premium(): React.ReactElement {
  const { t } = useTranslation();
  const toast = useStore((s) => s.toast);
  const refresh = useStore((s) => s.refreshCharacter);
  const char = useStore((s) => s.character);
  const location = useLocation();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [mode, setMode] = useState<'stripe' | 'dev'>('dev');
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      const [p, h] = await Promise.all([api.get('/payments/products'), api.get('/payments/history')]);
      setProducts(p.products);
      setMode(p.mode);
      setHistory(h.history);
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }

  useEffect(() => { load(); }, []);

  // Handle redirect callbacks from Stripe / dev mode
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const devId = params.get('dev_complete');
    const sessionId = params.get('session_id');
    const cancelled = params.get('cancelled');

    if (cancelled) {
      toast(t('premium.toasts.purchaseCancelled'), 'info');
      navigate('/app/premium', { replace: true });
      return;
    }

    async function verify(body: { purchase_id?: number; session_id?: string }) {
      try {
        const r = await api.post('/payments/verify', body);
        if (r.ok) {
          toast(t('premium.toasts.purchaseComplete'), 'success');
          await refresh();
          await load();
        } else {
          toast(t('premium.toasts.paymentStatus', { status: r.status }), 'info');
        }
      } catch (e: any) {
        toast(e.message, 'error');
      } finally {
        navigate('/app/premium', { replace: true });
      }
    }

    if (devId) verify({ purchase_id: Number(devId) });
    else if (sessionId) verify({ session_id: sessionId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  async function buy(p: Product) {
    setBusy(p.kind);
    try {
      const r = await api.post('/payments/checkout', { kind: p.kind });
      if (r.url) {
        window.location.assign(r.url);
        return;
      }
      toast(t('premium.toasts.noCheckoutUrl'), 'error');
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="col" style={{ gap: 24 }}>
      <div className="panel" style={{ position: 'relative', overflow: 'hidden' }}>
        <div className="ambient-stars" />
        <div className="panel-header" style={{ position: 'relative' }}>
          <div>
            <h2 className="panel-title">{t('premium.title')}</h2>
            <div className="panel-subtitle">
              {t('premium.subtitle')}
            </div>
          </div>
          <div className="flex gap-sm" style={{ alignItems: 'center' }}>
            {char && (
              <div className="tag" style={{ background: 'rgba(194,148,255,.14)', color: 'var(--amethyst-1)', border: '1px solid rgba(194,148,255,.4)', fontFamily: 'var(--font-mono)' }}>
                {t('premium.gemsTag', { n: (char as any).gems?.toLocaleString() || 0 })}
              </div>
            )}
            <span className={`tag ${mode === 'stripe' ? 'emerald' : 'gold'}`}>
              {mode === 'stripe' ? t('premium.modeLive') : t('premium.modeDev')}
            </span>
          </div>
        </div>
        {mode === 'dev' && (
          <div className="card" style={{ background: 'rgba(214,161,61,.06)', borderColor: 'var(--gold-3)', position: 'relative' }}>
            <strong style={{ color: 'var(--gold-1)' }}>{t('premium.devModeActive')}</strong>
            <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
              <Trans i18nKey="premium.devModeNote" components={{ code: <code /> }}>
                <code>STRIPE_SECRET_KEY</code> is not set — purchases complete instantly without taking real money. Set the env var in production to enable Stripe Checkout.
              </Trans>
            </p>
          </div>
        )}
      </div>

      <div className="grid-cards">
        {products.map((p) => (
          <div
            key={p.kind}
            className="card"
            data-tilt
            style={{
              position: 'relative',
              borderColor: p.best_value ? 'var(--gold-2)' : p.popular ? 'var(--sapphire-1)' : undefined,
              boxShadow: p.best_value
                ? '0 0 32px rgba(214,161,61,.25)'
                : p.popular
                ? '0 0 24px rgba(106,167,255,.18)'
                : undefined,
            }}
          >
            {p.popular && <span className="tag sapphire" style={{ position: 'absolute', top: 12, right: 12 }}>{t('premium.popular')}</span>}
            {p.best_value && <span className="tag gold" style={{ position: 'absolute', top: 12, right: 12 }}>{t('premium.bestValue')}</span>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
              <div style={{
                width: 56, height: 56,
                borderRadius: 14,
                background: 'linear-gradient(135deg, rgba(194,148,255,.25), rgba(106,167,255,.15))',
                border: '1px solid rgba(194,148,255,.4)',
                display: 'grid', placeItems: 'center',
                fontSize: 28,
              }}>{p.effects.name_change ? '✒' : '💎'}</div>
              <div>
                <strong style={{ color: 'var(--gold-1)', fontFamily: 'var(--font-display)', fontSize: 18 }}>{p.name}</strong>
                <div className="muted text-sm">{p.tagline}</div>
              </div>
            </div>
            <div className="muted text-sm" style={{ marginBottom: 14, minHeight: 40 }}>{p.description}</div>
            <div className="flex between" style={{ alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', color: 'var(--gold-1)', fontSize: 22 }}>
                  {fmtPrice(p.price_cents, p.currency)}
                </div>
                <div className="muted text-sm">{(p.currency || 'eur').toUpperCase()} · {t('premium.oneTime')}</div>
              </div>
              <button
                className="btn btn-primary"
                disabled={!!busy}
                onClick={() => buy(p)}
              >
                {busy === p.kind ? t('premium.openingCheckout') : t('premium.buy')}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">{t('premium.purchaseHistory')}</h2>
        </div>
        {history.length === 0 ? (
          <div className="muted">{t('premium.noPurchases')}</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr><th>{t('premium.table.when')}</th><th>{t('premium.table.product')}</th><th>{t('premium.table.status')}</th><th>{t('premium.table.mode')}</th><th>{t('premium.table.amount')}</th><th>{t('premium.table.gems')}</th></tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="muted text-sm">{new Date(h.created_at).toLocaleString()}</td>
                  <td><strong>{h.kind.replace(/_/g, ' ')}</strong></td>
                  <td><span className={`tag ${h.status === 'completed' ? 'emerald' : h.status === 'failed' ? 'crimson' : 'gold'}`}>{t(`premium.status.${h.status}`, { defaultValue: h.status })}</span></td>
                  <td className="muted text-sm">{h.mode}</td>
                  <td className="gold" style={{ fontFamily: 'var(--font-mono)' }}>{fmtPrice(h.amount_cents, h.currency)}</td>
                  <td className="amethyst" style={{ fontFamily: 'var(--font-mono)' }}>{h.gems_granted > 0 ? `+${h.gems_granted}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
