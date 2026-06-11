import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import Sprite from '../components/Sprite';
import type { InventoryItem } from '../lib/types';

interface Recipe {
  slug: string;
  name: string;
  description: string;
  gem_name: string;
  socket_stat: string;
  socket_amount: number;
  elixir_stat: 'strength' | 'dexterity' | 'intelligence';
  elixir_active: boolean;
  trophies_owned: number;
  trophies_required: number;
  gold_cost: number;
  can_brew: boolean;
}

const GEM_SPRITE: Record<string, string> = {
  gem_might: 'gem-t3',
  gem_swiftness: 'gem-t3',
  gem_mind: 'gem-t3',
};
const STAT_LABEL: Record<string, string> = {
  str_bonus: 'STR',
  dex_bonus: 'DEX',
  int_bonus: 'INT',
};

export default function Recipes(): React.ReactElement {
  const toast = useStore((s) => s.toast);
  const refresh = useStore((s) => s.refreshCharacter);
  const [data, setData] = useState<{ gold: number; recipes: Recipe[]; tallies: Record<string, number> } | null>(null);
  const [bag, setBag] = useState<InventoryItem[]>([]);
  const [socketSel, setSocketSel] = useState<{ gemId: number | null; weaponId: number | null }>({ gemId: null, weaponId: null });

  async function load() {
    try {
      const [r, inv] = await Promise.all([api.get('/recipes'), api.get('/inventory')]);
      setData(r);
      setBag(inv.items || []);
    } catch (e: any) { toast(e.message, 'error'); }
  }
  useEffect(() => { load(); }, []);

  async function brew(slug: string) {
    try {
      const r = await api.post('/recipes/brew', { slug });
      toast(`Brewed ${r.gem}`, 'success');
      await Promise.all([load(), refresh()]);
    } catch (e: any) { toast(e.message, 'error'); }
  }

  async function socket() {
    if (!socketSel.gemId || !socketSel.weaponId) return;
    try {
      const r = await api.post('/recipes/socket', { gemInventoryId: socketSel.gemId, weaponInventoryId: socketSel.weaponId });
      toast(`Socketed: +${r.amount} ${STAT_LABEL[r.stat] || r.stat}`, 'success');
      setSocketSel({ gemId: null, weaponId: null });
      await Promise.all([load(), refresh()]);
    } catch (e: any) { toast(e.message, 'error'); }
  }

  const gems = bag.filter((b) => ['gem_might', 'gem_swiftness', 'gem_mind'].includes(b.slug));
  const weapons = bag.filter((b) => b.category === 'weapon');

  return (
    <div className="col" style={{ gap: 22 }}>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Forge Recipe Board</h2>
            <div className="panel-subtitle">
              Combine <strong>Monster Trophies</strong> (from the Bounty Board) with a <strong>Mythic Elixir</strong>
              (active buff from the Trial Cache) at the anvil to brew socketable gems. Gems permanently buff weapons.
            </div>
          </div>
          <span className="tag gold" style={{ fontFamily: 'var(--font-mono)' }}>{data?.gold.toLocaleString() || 0}g</span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title" style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '.14em', color: 'var(--text-3)', marginBottom: 12 }}>Brew Gems</div>
        {!data && <div className="muted">Loading…</div>}
        {data && (
          <div className="grid-cards">
            {data.recipes.map((r) => (
              <div key={r.slug} className="card" style={{ padding: 16, opacity: r.can_brew ? 1 : 0.7 }}>
                <div className="flex" style={{ gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ width: 64, height: 64, display: 'grid', placeItems: 'center', background: 'radial-gradient(circle, rgba(194,148,255,.18), transparent 65%)', borderRadius: 10 }}>
                    <Sprite name={GEM_SPRITE[r.slug] || 'gem-t1'} tone="gem" size={52} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <strong style={{ color: 'var(--gold-1)', fontFamily: 'var(--font-display)' }}>{r.name}</strong>
                    <div className="muted text-sm" style={{ marginTop: 4 }}>{r.description}</div>
                  </div>
                </div>

                <div className="flex gap-sm" style={{ marginTop: 12, flexWrap: 'wrap' }}>
                  <span className={`tag`} style={{ background: r.trophies_owned >= r.trophies_required ? 'rgba(106,216,164,.15)' : 'rgba(232,90,79,.15)', color: r.trophies_owned >= r.trophies_required ? 'var(--emerald-1)' : 'var(--crimson-1)' }}>
                    Trophies {r.trophies_owned}/{r.trophies_required}
                  </span>
                  <span className="tag" style={{ background: r.elixir_active ? 'rgba(106,167,255,.15)' : 'rgba(124,125,131,.12)', color: r.elixir_active ? 'var(--azure-1)' : 'var(--text-3)' }}>
                    {r.elixir_active ? `✓ ${r.elixir_stat} elixir active` : `Need ${r.elixir_stat} elixir`}
                  </span>
                  <span className="tag gold">{r.gold_cost}g</span>
                </div>

                <button
                  className="btn btn-primary"
                  disabled={!r.can_brew}
                  onClick={() => brew(r.slug)}
                  style={{ marginTop: 12, width: '100%' }}
                >
                  {r.can_brew ? `Brew · ${r.gold_cost}g` : r.trophies_owned < r.trophies_required ? 'Need trophies' : !r.elixir_active ? 'Drink an elixir first' : `Need ${r.gold_cost}g`}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-title" style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '.14em', color: 'var(--text-3)', marginBottom: 12 }}>Socket Gem into Weapon</div>
        {gems.length === 0 ? (
          <div className="muted">No gems in your bag. Brew one above.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <div>
              <div className="muted text-sm" style={{ marginBottom: 6 }}>Pick a gem</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', gap: 6 }}>
                {gems.map((g) => (
                  <div
                    key={g.inv_id}
                    onClick={() => setSocketSel((s) => ({ ...s, gemId: g.inv_id }))}
                    className={`forge-slot ${socketSel.gemId === g.inv_id ? 'selected' : ''}`}
                    style={{ aspectRatio: '1 / 1', display: 'grid', placeItems: 'center', borderRadius: 8, cursor: 'pointer', background: socketSel.gemId === g.inv_id ? 'var(--surface-2)' : 'var(--surface-1)', border: `1px solid ${socketSel.gemId === g.inv_id ? 'var(--gold-1)' : 'var(--border-1)'}` }}
                    title={g.name}
                  >
                    <Sprite name={GEM_SPRITE[g.slug] || 'gem-t1'} tone="gem" size={32} />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="muted text-sm" style={{ marginBottom: 6 }}>Pick a weapon</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', gap: 6 }}>
                {weapons.map((w) => (
                  <div
                    key={w.inv_id}
                    onClick={() => setSocketSel((s) => ({ ...s, weaponId: w.inv_id }))}
                    className={`forge-slot ${socketSel.weaponId === w.inv_id ? 'selected' : ''}`}
                    style={{ aspectRatio: '1 / 1', display: 'grid', placeItems: 'center', borderRadius: 8, cursor: 'pointer', background: socketSel.weaponId === w.inv_id ? 'var(--surface-2)' : 'var(--surface-1)', border: `1px solid ${socketSel.weaponId === w.inv_id ? 'var(--gold-1)' : 'var(--border-1)'}` }}
                    title={w.name}
                  >
                    <Sprite category={w.category} subType={w.sub_type} tier={w.tier} rarity={w.rarity as any} size={32} enchant={w.enchant_count} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        <button
          className="btn btn-primary"
          disabled={!socketSel.gemId || !socketSel.weaponId}
          onClick={socket}
          style={{ marginTop: 16, width: '100%' }}
        >
          {socketSel.gemId && socketSel.weaponId ? 'Socket' : 'Pick a gem and a weapon'}
        </button>
      </div>
    </div>
  );
}
