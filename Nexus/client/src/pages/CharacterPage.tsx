import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { spriteFor } from '../combat/sprites';

interface CostInfo {
  current_value: number;
  upgrades: number;
  next_cost: number;
}

const ATTR = [
  { key: 'strength',     labelKey: 'characterPage.attr.strength',     descKey: 'characterPage.attrDesc.strength' },
  { key: 'dexterity',    labelKey: 'characterPage.attr.dexterity',    descKey: 'characterPage.attrDesc.dexterity' },
  { key: 'constitution', labelKey: 'characterPage.attr.constitution', descKey: 'characterPage.attrDesc.constitution' },
  { key: 'intelligence', labelKey: 'characterPage.attr.intelligence', descKey: 'characterPage.attrDesc.intelligence' },
  { key: 'wisdom',       labelKey: 'characterPage.attr.wisdom',       descKey: 'characterPage.attrDesc.wisdom' },
  { key: 'charisma',     labelKey: 'characterPage.attr.charisma',     descKey: 'characterPage.attrDesc.charisma' },
] as const;

const SKILLS = [
  { key: 'skill_sword',   labelKey: 'characterPage.skill.sword' },
  { key: 'skill_axe',     labelKey: 'characterPage.skill.axe' },
  { key: 'skill_bow',     labelKey: 'characterPage.skill.bow' },
  { key: 'skill_staff',   labelKey: 'characterPage.skill.staff' },
  { key: 'skill_magic',   labelKey: 'characterPage.skill.magic' },
  { key: 'skill_stealth', labelKey: 'characterPage.skill.stealth' },
] as const;

export default function CharacterPage(): React.ReactElement {
  const { t } = useTranslation();
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

  function statLabel(stat: string): string {
    const meta = [...ATTR, ...SKILLS].find((s) => s.key === stat);
    return meta ? t(meta.labelKey) : stat.replace(/_/g, ' ');
  }

  async function upgrade(stat: string, count = 1) {
    setBusy(stat);
    try {
      const r = await api.post('/character/upgrade-stat', { stat, count });
      toast(t('characterPage.upgradeToast', { gained: r.gained, stat: statLabel(stat), gold: r.gold_spent }), 'success');
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
      toast(t('characterPage.restToast'), 'success');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }

  if (!char) return <div className="muted">{t('common.loading')}</div>;

  return (
    <div className="col" style={{ gap: 24 }}>
      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">{t('characterPage.title')}</h2>
          <div className="flex gap-sm">
            <span className="tag gold" style={{ fontFamily: 'var(--font-mono)' }}>
              {t('characterPage.goldAmount', { gold: char.gold.toLocaleString() })}
            </span>
            <button className="btn" onClick={rest}>{t('characterPage.rest')}</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 24 }}>
          <div className="portrait" style={{ width: 160, height: 200 }}>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
              <div style={{ transform: 'scale(.82) translateY(-2%)' }}>{spriteFor(char.class)}</div>
            </div>
            <div className="badge-level">{t('common.lv')} {char.level}</div>
          </div>
          <div>
            <h1 style={{ color: 'var(--gold-1)' }}>
              {char.name}
              {char.current_title && <span style={{ color: 'var(--amethyst-1)', fontSize: 18, marginLeft: 8 }}>, {char.current_title}</span>}
            </h1>
            <div className="muted">{t(`common.class.${char.class}`, { defaultValue: char.class })} · {t('characterPage.record', { wins: char.wins, losses: char.losses, rating: char.arena_rating })}</div>
            <div className="card" style={{ marginTop: 14, background: 'rgba(214,161,61,.06)' }}>
              <strong style={{ color: 'var(--gold-1)' }}>{t('characterPage.howTitle')}</strong>
              <div className="muted text-sm" style={{ marginTop: 4 }}>
                {t('characterPage.howDesc')}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
        <div className="panel grow" style={{ minWidth: 280 }}>
          <div className="panel-header">
            <h3 style={{ margin: 0 }}>{t('characterPage.attributes')}</h3>
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
                        <strong>{t(s.labelKey)}</strong>
                        <span className="value" style={{ fontFamily: 'var(--font-display)', color: 'var(--gold-1)', fontSize: 18 }}>
                          {cur}
                        </span>
                        {cost && cost.upgrades > 0 && (
                          <span className="muted text-sm" style={{ fontFamily: 'var(--font-mono)' }}>
                            {t('characterPage.upgradesCount', { count: cost.upgrades })}
                          </span>
                        )}
                      </div>
                      <div className="muted text-sm">{t(s.descKey)}</div>
                    </div>
                    <div className="flex gap-sm" style={{ flexShrink: 0 }}>
                      <button
                        className="btn btn-sm"
                        disabled={!canAfford || busy === s.key}
                        onClick={() => upgrade(s.key, 1)}
                        title={t('characterPage.plusOneTitle', { stat: t(s.labelKey), cost: next })}
                      >
                        +1 · <span style={{ color: 'var(--gold-1)', fontFamily: 'var(--font-mono)', marginLeft: 4 }}>{next}g</span>
                      </button>
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={char.gold < computeBatchCost(cost?.upgrades || 0, 5) || busy === s.key}
                        onClick={() => upgrade(s.key, 5)}
                        title={t('characterPage.plusFiveTitle', { stat: t(s.labelKey), cost: computeBatchCost(cost?.upgrades || 0, 5) })}
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
            <h3 style={{ margin: 0 }}>{t('characterPage.weaponSkills')}</h3>
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
                        <strong>{t(s.labelKey)}</strong>
                        <span style={{ fontFamily: 'var(--font-display)', color: 'var(--gold-1)', fontSize: 18 }}>{cur}</span>
                        {cost && cost.upgrades > 0 && (
                          <span className="muted text-sm" style={{ fontFamily: 'var(--font-mono)' }}>
                            {t('characterPage.upgradesCount', { count: cost.upgrades })}
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

// Mirror the server curve exactly (server/src/game/upgrade.ts):
// nextUpgradeCost(count) = max(5, floor(5 * (count+1)^1.5)). The old linear
// 5*(count+1) under-quoted every "+5" — the button looked affordable, then
// the server charged more and rejected it with "Not enough gold".
function computeBatchCost(currentCount: number, n: number): number {
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += Math.max(5, Math.floor(5 * Math.pow(currentCount + i + 1, 1.5)));
  }
  return total;
}
