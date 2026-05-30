import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import Sprite from '../components/Sprite';

interface MountDef {
  slug: string;
  name: string;
  description: string;
  gem_cost: number;
  rarity: 'uncommon' | 'rare' | 'epic' | 'legendary';
  tier: number;
  cooldown_reduction_pct: number;
  phys_dmg_bonus: number;
  phys_def_bonus: number;
  mag_dmg_bonus: number;
  mag_def_bonus: number;
  owned: boolean;
}

interface Data {
  gems: number;
  active_mount_inventory_id: number;
  owned: { inv_id: number; slug: string; name: string }[];
  catalog: MountDef[];
}

const MOUNT_SPRITE: Record<string, string> = {
  mount_riding_horse: 'icon-portal',
  mount_warhound: 'monster-wolf',
  mount_arcwing_drake: 'monster-dragon',
  mount_solar_courser: 'icon-flame',
  mount_voidstrider: 'monster-ghost',
  mount_crowned_griffin: 'monster-hydra',
  mount_world_serpent: 'monster-hydra',
};

function StatPill({ label, value, kind }: { label: string; value: number; kind: 'physd' | 'physf' | 'magd' | 'magf' | 'cd' }) {
  const palette: Record<string, { bg: string; fg: string }> = {
    physd: { bg: 'rgba(232,90,79,.15)',  fg: 'var(--crimson-1)' },
    physf: { bg: 'rgba(214,161,61,.15)', fg: 'var(--gold-1)' },
    magd:  { bg: 'rgba(194,148,255,.15)', fg: '#c294ff' },
    magf:  { bg: 'rgba(106,167,255,.15)', fg: 'var(--azure-1)' },
    cd:    { bg: 'rgba(106,216,164,.15)', fg: 'var(--emerald-1)' },
  };
  const p = palette[kind];
  return (
    <span className="tag" style={{ background: p.bg, color: p.fg, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
      {label} {value > 0 ? '+' : ''}{value}{kind === 'cd' ? '%' : ''}
    </span>
  );
}

export default function MountShop(): React.ReactElement {
  const toast = useStore((s) => s.toast);
  const refresh = useStore((s) => s.refreshCharacter);
  const [data, setData] = useState<Data | null>(null);

  async function load() {
    try { setData(await api.get('/mount')); } catch (e: any) { toast(e.message, 'error'); }
  }
  useEffect(() => { load(); }, []);

  async function buy(slug: string) {
    try { await api.post('/mount/buy', { slug }); toast('Mount acquired.', 'success'); await Promise.all([load(), refresh()]); } catch (e: any) { toast(e.message, 'error'); }
  }
  async function equip(invId: number) {
    try { await api.post('/mount/equip', { inventoryId: invId }); toast('Mounted.', 'success'); await load(); } catch (e: any) { toast(e.message, 'error'); }
  }
  async function unmount() {
    try { await api.post('/mount/equip', { inventoryId: 0 }); toast('Dismounted.', 'success'); await load(); } catch (e: any) { toast(e.message, 'error'); }
  }

  if (!data) return <div className="muted">Loading…</div>;

  return (
    <div className="col" style={{ gap: 22 }}>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Stables</h2>
            <div className="panel-subtitle">
              Mounts shorten action cooldowns (mechanical property — not a stat bonus) and stack real
              combat stats on top: Physical / Magical Damage and Defence. Premium currency only.
            </div>
          </div>
          <div className="flex gap-sm">
            <span className="tag" style={{ background: 'rgba(106,167,255,.15)', color: 'var(--azure-1)', fontFamily: 'var(--font-mono)' }}>💎 {data.gems}</span>
            {data.active_mount_inventory_id > 0 && (
              <button className="btn btn-sm" onClick={unmount}>Dismount</button>
            )}
          </div>
        </div>
      </div>

      <div className="grid-cards">
        {data.catalog.map((m) => {
          const ownedRow = data.owned.find((o) => o.slug === m.slug);
          const active = ownedRow && ownedRow.inv_id === data.active_mount_inventory_id;
          return (
            <div key={m.slug} className={`card rarity-border-${m.rarity} ${active ? 'rarity-border-legendary' : ''}`} style={{ padding: 16 }}>
              <div className="flex" style={{ gap: 14, alignItems: 'flex-start' }}>
                <div style={{ width: 72, height: 72, display: 'grid', placeItems: 'center', background: 'radial-gradient(circle, rgba(255,232,138,.16), transparent 65%)', borderRadius: 12 }}>
                  <Sprite name={MOUNT_SPRITE[m.slug] || 'icon-portal'} tone="weapon" size={58} />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="flex between" style={{ alignItems: 'baseline' }}>
                    <strong className={`rarity-${m.rarity}`} style={{ fontFamily: 'var(--font-display)' }}>{m.name}</strong>
                    <span className="muted text-sm">T{m.tier} · {m.rarity}</span>
                  </div>
                  <div className="muted text-sm" style={{ marginTop: 4 }}>{m.description}</div>
                </div>
              </div>

              <div className="flex gap-sm" style={{ marginTop: 12, flexWrap: 'wrap' }}>
                <StatPill label="⏱" value={m.cooldown_reduction_pct} kind="cd" />
                {m.phys_dmg_bonus > 0 && <StatPill label="P-DMG" value={m.phys_dmg_bonus} kind="physd" />}
                {m.phys_def_bonus > 0 && <StatPill label="P-DEF" value={m.phys_def_bonus} kind="physf" />}
                {m.mag_dmg_bonus  > 0 && <StatPill label="M-DMG" value={m.mag_dmg_bonus}  kind="magd" />}
                {m.mag_def_bonus  > 0 && <StatPill label="M-DEF" value={m.mag_def_bonus}  kind="magf" />}
              </div>

              <div className="flex between" style={{ marginTop: 12 }}>
                <span className="tag" style={{ background: 'rgba(106,167,255,.15)', color: 'var(--azure-1)', fontFamily: 'var(--font-mono)' }}>💎 {m.gem_cost.toLocaleString()}</span>
                {active ? (
                  <span className="tag" style={{ background: 'rgba(255,232,138,.15)', color: 'var(--gold-1)' }}>★ Active</span>
                ) : m.owned && ownedRow ? (
                  <button className="btn btn-sm btn-primary" onClick={() => equip(ownedRow.inv_id)}>Mount</button>
                ) : (
                  <button className="btn btn-sm btn-primary" disabled={data.gems < m.gem_cost} onClick={() => buy(m.slug)}>
                    {data.gems < m.gem_cost ? `Need ${m.gem_cost - data.gems}` : `Buy · 💎 ${m.gem_cost}`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
