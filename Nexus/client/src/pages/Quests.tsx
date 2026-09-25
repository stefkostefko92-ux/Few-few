import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import type { Quest } from '../lib/types';
import QuestRun from './QuestRun';

// Canonical low→high region order (matches the hunting region ladder and
// the world map). Used to sort the filter chips; unknown slugs sink to the
// end instead of interleaving randomly.
const REGION_ORDER = [
  'whispering_woods', 'mistmoor_hills', 'crystal_caverns', 'ashen_wastes', 'shadowfell',
  'emberreach', 'hammerhand_pass', 'conclave_aedric', 'saltmarsh', 'frostvale', 'black_spire',
  'stormpeaks', 'voidshade_hollow', 'mooncradle', 'worldspine', 'eternal_throne',
];
const humanizeRegion = (s: string): string => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default function Quests(): React.ReactElement {
  const { t } = useTranslation();
  const char = useStore((s) => s.character);
  const toast = useStore((s) => s.toast);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [region, setRegion] = useState<string>('all');
  const [active, setActive] = useState<Quest | null>(null);

  // Names/lore come from the shared world.regions catalogue so every seeded
  // region (all 16, not just the first five) is localised; a humanised slug
  // is the last-resort fallback so a chip never shows a raw "black_spire".
  const regionName = (r: string): string => t(`world.regions.${r}.name`, { defaultValue: humanizeRegion(r) });
  const regionLore = (r: string): string => t(`world.regions.${r}.lore`, { defaultValue: '' });

  async function load() {
    try {
      const r = await api.get('/quest');
      setQuests(r.quests);
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }
  useEffect(() => { load(); }, []);

  const regions = useMemo(
    () => Array.from(new Set(quests.map((q) => q.region))).sort((a, b) => {
      const ia = REGION_ORDER.indexOf(a); const ib = REGION_ORDER.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    }),
    [quests],
  );
  const filtered = quests.filter((q) => region === 'all' || q.region === region);

  if (active) {
    return <QuestRun quest={active} onDone={() => { setActive(null); load(); }} />;
  }

  return (
    <div className="col" style={{ gap: 24 }}>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('quests.title')}</h2>
            <div className="panel-subtitle">{t('quests.subtitle')}</div>
          </div>
          <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
            <button className={`btn btn-sm ${region === 'all' ? 'btn-primary' : ''}`} onClick={() => setRegion('all')}>{t('quests.all')}</button>
            {regions.map((r) => (
              <button key={r} className={`btn btn-sm ${region === r ? 'btn-primary' : ''}`} onClick={() => setRegion(r)}>
                {regionName(r)}
              </button>
            ))}
          </div>
        </div>
        {region !== 'all' && regionLore(region) && (
          <div className="card" style={{ marginBottom: 16, fontStyle: 'italic' }}>{regionLore(region)}</div>
        )}
        <div className="grid-cards">
          {filtered.map((q) => {
            const locked = !!char && char.level < q.level_req;
            return (
              <div key={q.id} className="card" style={{ opacity: locked ? .55 : 1 }}>
                <div className="flex between">
                  <div>
                    <strong style={{ color: 'var(--gold-1)', fontFamily: 'var(--font-display)' }}>{q.title}</strong>
                    <div className="muted text-sm" style={{ textTransform: 'uppercase', letterSpacing: '.08em' }}>
                      {regionName(q.region)} · {t('quests.lv', { n: q.level_req })}
                    </div>
                  </div>
                </div>
                <div className="muted text-sm" style={{ marginTop: 8 }}>{q.intro}</div>
                <div className="flex gap-sm" style={{ marginTop: 12 }}>
                  <span className="tag gold">{t('quests.xpTag', { n: q.xp_reward })}</span>
                  <span className="tag gold">{t('quests.goldTag', { n: q.gold_reward })}</span>
                  {q.item_reward && <span className="tag sapphire">{t('quests.dropChance')}</span>}
                </div>
                <div style={{ marginTop: 14 }}>
                  <button
                    className="btn btn-primary"
                    disabled={locked}
                    onClick={() => setActive(q)}
                  >
                    {locked ? t('quests.requiresLv', { n: q.level_req }) : t('quests.embark')}
                  </button>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="muted">{t('quests.empty')}</div>}
        </div>
      </div>
    </div>
  );
}
