import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import Sprite, { spriteForItem } from '../components/Sprite';
import type { InventoryItem } from '../lib/types';

interface ForgeStatus {
  item: { name: string; rarity: string; tier: number };
  enchants: number;
  max_enchants: number;
  cost: number;
  can_afford: boolean;
  weights: { small: number; medium: number; greater: number; shatter: number };
  bonuses: Record<string, number>;
}

export default function Forge(): React.ReactElement {
  const toast = useStore((s) => s.toast);
  const refresh = useStore((s) => s.refreshCharacter);
  const char = useStore((s) => s.character);
  const [bag, setBag] = useState<InventoryItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [status, setStatus] = useState<ForgeStatus | null>(null);
  const [outcome, setOutcome] = useState<{ kind: string; text: string } | null>(null);

  async function loadBag() {
    try {
      const r = await api.get('/inventory');
      const enchantable = (r.items || []).filter((i: InventoryItem) => i.category !== 'potion' && !i.equipped);
      setBag(enchantable);
    } catch (e: any) { toast(e.message, 'error'); }
  }

  async function loadStatus(id: number) {
    try {
      const r = await api.get(`/forge/status/${id}`);
      setStatus(r);
    } catch (e: any) { toast(e.message, 'error'); setStatus(null); }
  }

  useEffect(() => { loadBag(); }, []);
  useEffect(() => { if (selectedId) loadStatus(selectedId); else setStatus(null); }, [selectedId]);

  async function enchant() {
    if (!selectedId) return;
    setOutcome(null);
    try {
      const r = await api.post('/forge/enchant', { inventoryId: selectedId });
      const cls = r.outcome === 'shatter' ? 'error' : r.outcome === 'greater' ? 'success' : 'info';
      const text = r.outcome === 'shatter' ? r.message : `${r.outcome.toUpperCase()} ${r.message}`;
      setOutcome({ kind: r.outcome, text });
      toast(text, cls as any);
      await Promise.all([loadBag(), refresh()]);
      if (r.outcome === 'shatter') setSelectedId(null);
      else await loadStatus(selectedId);
    } catch (e: any) { toast(e.message, 'error'); }
  }

  return (
    <div className="col" style={{ gap: 22 }}>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">The Forge</h2>
            <div className="panel-subtitle">
              Pour gold into the anvil's fire. Better rarity, kinder odds — but no enchant is free.
            </div>
          </div>
          <span className="tag gold" style={{ fontFamily: 'var(--font-mono)' }}>{char?.gold.toLocaleString() || 0}g</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 22 }}>
        {/* Left: pick item */}
        <div className="panel">
          <div className="panel-title" style={{ fontSize: 16 }}>Bag</div>
          {bag.length === 0 ? (
            <div className="muted">No enchantable items. Equipment in your bag (not equipped) can be enchanted.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 8 }}>
              {bag.map((it) => (
                <div
                  key={it.inv_id}
                  onClick={() => setSelectedId(it.inv_id)}
                  className={`forge-slot rarity-border-${it.rarity} ${selectedId === it.inv_id ? 'selected' : ''}`}
                  style={{
                    aspectRatio: '1 / 1',
                    display: 'grid',
                    placeItems: 'center',
                    background: selectedId === it.inv_id ? 'var(--surface-2)' : 'var(--surface-1)',
                    borderRadius: 8,
                    cursor: 'pointer',
                    border: `1px solid ${selectedId === it.inv_id ? 'var(--gold-1)' : 'var(--border-1)'}`,
                  }}
                  title={it.name}
                >
                  <Sprite {...spriteForItem(it.icon, it.category)} size={36} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: forge altar */}
        <div className="panel">
          {!status ? (
            <div className="muted" style={{ textAlign: 'center', padding: 30 }}>
              Select an item from your bag to inspect odds and pour the fire.
            </div>
          ) : (
            <div className="col" style={{ gap: 14 }}>
              <div style={{ textAlign: 'center' }}>
                <h3 className={`rarity-${status.item.rarity}`} style={{ margin: 0 }}>{status.item.name}</h3>
                <div className="muted text-sm">Tier {status.item.tier} · {status.item.rarity}</div>
              </div>
              <div className="card" style={{ padding: 16, textAlign: 'center', background: 'radial-gradient(circle at center, rgba(255,177,89,.12), transparent 70%)' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--gold-1)' }}>
                  Enchants: {status.enchants} / {status.max_enchants}
                </div>
                <div style={{ marginTop: 10 }} className="flex gap-sm" >
                  <span className="tag" style={{ background: 'rgba(106,216,164,.15)', color: 'var(--emerald-1)' }}>Minor {status.weights.small}%</span>
                  <span className="tag" style={{ background: 'rgba(106,167,255,.15)', color: 'var(--azure-1)' }}>Strong {status.weights.medium}%</span>
                  <span className="tag" style={{ background: 'rgba(194,148,255,.15)', color: '#c294ff' }}>Greater {status.weights.greater}%</span>
                  <span className="tag" style={{ background: 'rgba(232,90,79,.18)', color: 'var(--crimson-1)' }}>Shatter {status.weights.shatter}%</span>
                </div>
              </div>

              {Object.keys(status.bonuses).length > 0 && (
                <div className="card" style={{ padding: 12 }}>
                  <div className="muted text-sm" style={{ marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.08em' }}>Existing enchants</div>
                  <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                    {Object.entries(status.bonuses).map(([k, v]) => (
                      <span key={k} className="tag gold">+{v} {k.replace('_bonus', '').replace('atk_max', 'attack')}</span>
                    ))}
                  </div>
                </div>
              )}

              {outcome && (
                <div className={`card outcome-${outcome.kind}`} style={{ padding: 12, textAlign: 'center', fontFamily: 'var(--font-display)' }}>
                  {outcome.text}
                </div>
              )}

              <button
                className="btn btn-primary"
                disabled={!status.can_afford || status.enchants >= status.max_enchants}
                onClick={enchant}
                style={{ width: '100%', fontSize: 16 }}
              >
                {status.enchants >= status.max_enchants
                  ? 'Fully enchanted'
                  : status.can_afford
                    ? `Strike the anvil · ${status.cost}g`
                    : `Need ${status.cost}g`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
