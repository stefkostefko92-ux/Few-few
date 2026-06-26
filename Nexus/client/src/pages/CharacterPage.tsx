import React, { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { spriteFor } from '../combat/sprites';

interface CostInfo {
  current_value: number;
  upgrades: number;
  next_cost: number;
}

const ATTR = [
  { key: 'strength',     label: 'Strength',     desc: 'Raw melee damage.' },
  { key: 'dexterity',    label: 'Dexterity',    desc: 'Crit, dodge, ranged.' },
  { key: 'constitution', label: 'Constitution', desc: 'Health pool.' },
  { key: 'intelligence', label: 'Intelligence', desc: 'Spell power, mana.' },
  { key: 'wisdom',       label: 'Wisdom',       desc: 'Mana, resistance.' },
  { key: 'charisma',     label: 'Charisma',     desc: 'Quest reward bonuses.' },
] as const;

const SKILLS = [
  { key: 'skill_sword',   label: 'Sword' },
  { key: 'skill_axe',     label: 'Axe' },
  { key: 'skill_bow',     label: 'Bow' },
  { key: 'skill_staff',   label: 'Staff' },
  { key: 'skill_magic',   label: 'Magic' },
  { key: 'skill_stealth', label: 'Stealth' },
] as const;

export default function CharacterPage(): React.ReactElement {
  const char = useStore((s) => s.character);
  const refresh = useStore((s) => s.refreshCharacter);
  const toast = useStore((s) => s.toast);
  const [costs, setCosts] = useState<Record<string, CostInfo>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      const r = await api.get('/character/upgrade-costs');
      setCosts(r.costs);
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }
  useEffect(() => { load(); }, [char?.id]);

  async function upgrade(stat: string, count = 1) {
    setBusy(stat);
    try {
      const r = await api.post('/character/upgrade-stat', { stat, count });
      toast(`+${r.gained} ${stat.replace(/_/g, ' ')} for ${r.gold_spent}g`, 'success');
      await Promise.all([refresh(), load()]);
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function rest() {
    try {
      await api.post('/character/rest', {});
      await refresh();
      toast('Wounds tended.', 'success');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }

  if (!char) return <div className="muted">Loading…</div>;

  return (
    <div className="col" style={{ gap: 24 }}>
      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Character</h2>
          <div className="flex gap-sm">
            <span className="tag gold" style={{ fontFamily: 'var(--font-mono)' }}>
              {char.gold.toLocaleString()} gold
            </span>
            <button className="btn" onClick={rest}>Rest (10 EN)</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 24 }}>
          <div className="portrait" style={{ width: 160, height: 200 }}>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
              <div style={{ transform: 'scale(.82) translateY(-2%)' }}>{spriteFor(char.class)}</div>
            </div>
            <div className="badge-level">Lv {char.level}</div>
          </div>
          <div>
            <h1 style={{ color: 'var(--gold-1)' }}>
              {char.name}
              {char.current_title && <span style={{ color: 'var(--amethyst-1)', fontSize: 18, marginLeft: 8 }}>, {char.current_title}</span>}
            </h1>
            <div className="muted">{cap(char.class)} · {char.wins}W / {char.losses}L · Rating {char.arena_rating}</div>
            <div className="card" style={{ marginTop: 14, background: 'rgba(214,161,61,.06)' }}>
              <strong style={{ color: 'var(--gold-1)' }}>How upgrades work now</strong>
              <div className="muted text-sm" style={{ marginTop: 4 }}>
                Stats and skills are no longer granted on level-up. Each stat is upgraded with
                gold — the first costs 5g, the second 10g, the third 15g, etc. Per-stat counter
                scales independently.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
        <div className="panel grow" style={{ minWidth: 280 }}>
          <div className="panel-header">
            <h3 style={{ margin: 0 }}>Attributes</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ATTR.map((s) => {
              const cur = (char as any)[s.key] as number;
              const cost = costs[s.key];
              const next = cost?.next_cost ?? 5;
              const canAfford = char.gold >= next;
              return (
                <div key={s.key} className="card" style={{ padding: 12 }}>
                  <div className="flex between" style={{ alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div className="flex" style={{ gap: 10, alignItems: 'baseline' }}>
                        <strong>{s.label}</strong>
                        <span className="value" style={{ fontFamily: 'var(--font-display)', color: 'var(--gold-1)', fontSize: 18 }}>
                          {cur}
                        </span>
                        {cost && cost.upgrades > 0 && (
                          <span className="muted text-sm" style={{ fontFamily: 'var(--font-mono)' }}>
                            ({cost.upgrades} upgrades)
                          </span>
                        )}
                      </div>
                      <div className="muted text-sm">{s.desc}</div>
                    </div>
                    <div className="flex gap-sm" style={{ flexShrink: 0 }}>
                      <button
                        className="btn btn-sm"
                        disabled={!canAfford || busy === s.key}
                        onClick={() => upgrade(s.key, 1)}
                        title={`+1 ${s.label} for ${next}g`}
                      >
                        +1 · <span style={{ color: 'var(--gold-1)', fontFamily: 'var(--font-mono)', marginLeft: 4 }}>{next}g</span>
                      </button>
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={char.gold < computeBatchCost(cost?.upgrades || 0, 5) || busy === s.key}
                        onClick={() => upgrade(s.key, 5)}
                        title={`+5 ${s.label} for ${computeBatchCost(cost?.upgrades || 0, 5)}g`}
                      >
                        +5 · <span style={{ fontFamily: 'var(--font-mono)', marginLeft: 4 }}>{computeBatchCost(cost?.upgrades || 0, 5)}g</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel grow" style={{ minWidth: 280 }}>
          <div className="panel-header">
            <h3 style={{ margin: 0 }}>Weapon Skills</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {SKILLS.map((s) => {
              const cur = (char as any)[s.key] as number;
              const cost = costs[s.key];
              const next = cost?.next_cost ?? 5;
              const canAfford = char.gold >= next;
              return (
                <div key={s.key} className="card" style={{ padding: 12 }}>
                  <div className="flex between" style={{ alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div className="flex" style={{ gap: 10, alignItems: 'baseline' }}>
                        <strong>{s.label}</strong>
                        <span style={{ fontFamily: 'var(--font-display)', color: 'var(--gold-1)', fontSize: 18 }}>{cur}</span>
                        {cost && cost.upgrades > 0 && (
                          <span className="muted text-sm" style={{ fontFamily: 'var(--font-mono)' }}>
                            ({cost.upgrades} upgrades)
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-sm" style={{ flexShrink: 0 }}>
                      <button
                        className="btn btn-sm"
                        disabled={!canAfford || busy === s.key}
                        onClick={() => upgrade(s.key, 1)}
                      >
                        +1 · <span style={{ color: 'var(--gold-1)', fontFamily: 'var(--font-mono)', marginLeft: 4 }}>{next}g</span>
                      </button>
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={char.gold < computeBatchCost(cost?.upgrades || 0, 5) || busy === s.key}
                        onClick={() => upgrade(s.key, 5)}
                      >
                        +5 · <span style={{ fontFamily: 'var(--font-mono)', marginLeft: 4 }}>{computeBatchCost(cost?.upgrades || 0, 5)}g</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function cap(s: string) { return s[0].toUpperCase() + s.slice(1); }

function computeBatchCost(currentCount: number, n: number): number {
  let total = 0;
  for (let i = 0; i < n; i++) total += 5 * (currentCount + i + 1);
  return total;
}
