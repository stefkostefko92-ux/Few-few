import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useStore } from '../lib/store';

interface TItem { inv_id: number; name: string; rarity?: string; icon?: string; }
interface Side { name?: string; ready: boolean; gold: number; items: TItem[]; }
interface Offer { id: number; iAmSender: boolean; me: Side; them: Side; }

export default function Trade(): React.ReactElement {
  const { t } = useTranslation();
  const toast = useStore((s) => s.toast);
  const refreshCharacter = useStore((s) => s.refreshCharacter);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [inv, setInv] = useState<any[]>([]);
  const [toName, setToName] = useState('');
  const [gold, setGold] = useState(0);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const dirty = useRef(false);

  const loadOffer = () => api.get<{ offer: Offer | null }>('/trade/active').then((r) => {
    setOffer(r.offer);
    if (r.offer && !dirty.current) {
      setGold(r.offer.me.gold);
      setSel(new Set(r.offer.me.items.map((i) => i.inv_id)));
    }
  }).catch(() => {});
  const loadInv = () => api.get('/inventory').then((r) => setInv((r.items || []).filter((i: any) => !i.equipped && !i.soul_bound && !i.listed && i.category !== 'potion'))).catch(() => {});

  useEffect(() => { loadOffer(); loadInv(); const id = setInterval(loadOffer, 3000); return () => clearInterval(id); }, []);

  const start = async () => {
    if (!toName.trim()) return;
    try { const r = await api.post('/trade/offer', { toName: toName.trim() }); toast(t('trade.sent', { defaultValue: 'Trade offer sent' }), 'success'); setToName(''); await loadOffer(); }
    catch (e: any) { toast(e.message, 'error'); }
  };
  const pushSet = async (items: number[], g: number) => {
    if (!offer) return;
    dirty.current = true;
    try { await api.post(`/trade/${offer.id}/set`, { items, gold: g }); }
    catch (e: any) { toast(e.message, 'error'); }
    finally { dirty.current = false; loadOffer(); }
  };
  const toggleItem = (invId: number) => {
    const next = new Set(sel);
    next.has(invId) ? next.delete(invId) : next.add(invId);
    setSel(next); pushSet([...next], gold);
  };
  const setReady = async (ready: boolean) => {
    if (!offer) return;
    try {
      const r = await api.post(`/trade/${offer.id}/ready`, { ready });
      if (r.executed) { toast(t('trade.done', { defaultValue: 'Trade complete!' }), 'success'); await refreshCharacter(); await loadInv(); }
      await loadOffer();
    } catch (e: any) { toast(e.message, 'error'); await loadOffer(); }
  };
  const cancel = async () => { if (!offer) return; try { await api.post(`/trade/${offer.id}/cancel`, {}); toast(t('trade.cancelled', { defaultValue: 'Trade cancelled' }), 'info'); setSel(new Set()); setGold(0); await loadOffer(); } catch (e: any) { toast(e.message, 'error'); } };

  if (!offer) {
    return (
      <div className="panel">
        <div className="panel-header"><h2 className="panel-title">{t('trade.title', { defaultValue: 'Trade' })}</h2></div>
        <p className="muted">{t('trade.startHint', { defaultValue: 'Start a trade with another player by name (or use the Trade button on their profile).' })}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ flex: 1, padding: '8px 10px', background: 'var(--surface-2,#14171f)', border: '1px solid var(--border,#2a2f3a)', borderRadius: 6, color: 'var(--text-1)' }}
            placeholder={t('trade.playerName', { defaultValue: 'Player name…' })} value={toName} onChange={(e) => setToName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && start()} />
          <button className="btn btn-primary" disabled={!toName.trim()} onClick={start}>{t('trade.offer', { defaultValue: 'Offer trade' })}</button>
        </div>
      </div>
    );
  }

  const Escrow = ({ side, mine }: { side: Side; mine: boolean }) => (
    <div className="card" style={{ flex: 1, minWidth: 220 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong>{mine ? t('trade.you', { defaultValue: 'You' }) : side.name}</strong>
        <span className={side.ready ? 'gold' : 'muted'}>{side.ready ? '✓ ' + t('trade.ready', { defaultValue: 'Ready' }) : t('trade.notReady', { defaultValue: 'Not ready' })}</span>
      </div>
      <div style={{ minHeight: 60 }}>
        {side.items.length === 0 && side.gold === 0 && <span className="muted" style={{ fontSize: 13 }}>{t('trade.nothing', { defaultValue: '(nothing offered)' })}</span>}
        {side.items.map((i) => <div key={i.inv_id} style={{ fontSize: 13 }}>• {i.name}</div>)}
        {side.gold > 0 && <div className="gold" style={{ fontSize: 13, marginTop: 4 }}>+ {side.gold} gold</div>}
      </div>
    </div>
  );

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">{t('trade.title', { defaultValue: 'Trade' })} — {offer.them.name}</h2>
        <button className="btn btn-sm" onClick={cancel}>{t('trade.cancel', { defaultValue: 'Cancel' })}</button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Escrow side={offer.me} mine />
        <Escrow side={offer.them} mine={false} />
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span>{t('trade.gold', { defaultValue: 'Your gold' })}</span>
          <input type="number" min={0} value={gold} onChange={(e) => setGold(Math.max(0, Number(e.target.value)))} onBlur={() => pushSet([...sel], gold)}
            style={{ width: 120, padding: '6px 8px', background: 'var(--surface-2,#14171f)', border: '1px solid var(--border,#2a2f3a)', borderRadius: 6, color: 'var(--text-1)' }} />
        </label>
        <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>{t('trade.yourItems', { defaultValue: 'Your tradable items' })}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
          {inv.map((i) => (
            <label key={i.inv_id} className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', padding: 8, opacity: sel.has(i.inv_id) ? 1 : 0.7, borderColor: sel.has(i.inv_id) ? 'var(--gold-1,#d6a13d)' : undefined }}>
              <input type="checkbox" checked={sel.has(i.inv_id)} onChange={() => toggleItem(i.inv_id)} />
              <span style={{ fontSize: 12 }}>{i.name}</span>
            </label>
          ))}
          {inv.length === 0 && <span className="muted" style={{ fontSize: 13 }}>{t('trade.noItems', { defaultValue: 'No tradable items.' })}</span>}
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        {offer.me.ready
          ? <button className="btn" onClick={() => setReady(false)}>{t('trade.unready', { defaultValue: 'Not ready' })}</button>
          : <button className="btn btn-primary" onClick={() => setReady(true)}>{t('trade.markReady', { defaultValue: 'Ready' })}</button>}
        {offer.me.ready && offer.them.ready && <span className="muted" style={{ alignSelf: 'center' }}>{t('trade.executing', { defaultValue: 'Completing…' })}</span>}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>{t('trade.bothReady', { defaultValue: 'The trade completes automatically when both sides are ready. Any change resets readiness.' })}</p>
    </div>
  );
}
