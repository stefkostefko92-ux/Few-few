import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import type { Quest } from '../lib/types';
import QuestRun from './QuestRun';

const REGION_LORE: Record<string, { name: string; lore: string }> = {
  whispering_woods: { name: 'Whispering Woods', lore: 'Moss-clad oaks, scampering creatures, the road from Oaken Hollow.' },
  mistmoor_hills: { name: 'Mistmoor Hills', lore: 'Heather and fog. Orcs ride the high passes.' },
  crystal_caverns: { name: 'Crystal Caverns', lore: 'A labyrinth of glittering ore and ancient stone.' },
  ashen_wastes: { name: 'Ashen Wastes', lore: 'Burned plains where revenants drift, and drakes wheel above.' },
  shadowfell: { name: 'The Shadowfell', lore: 'The Shadow Lord\'s domain. The realm\'s final test.' },
};

export default function Quests(): React.ReactElement {
  const char = useStore((s) => s.character);
  const toast = useStore((s) => s.toast);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [region, setRegion] = useState<string>('all');
  const [active, setActive] = useState<Quest | null>(null);

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
      const order = ['whispering_woods', 'mistmoor_hills', 'crystal_caverns', 'ashen_wastes', 'shadowfell'];
      return order.indexOf(a) - order.indexOf(b);
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
            <h2 className="panel-title">Quest Board</h2>
            <div className="panel-subtitle">Choose your path. Earn coin, gear, and glory.</div>
          </div>
          <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
            <button className={`btn btn-sm ${region === 'all' ? 'btn-primary' : ''}`} onClick={() => setRegion('all')}>All</button>
            {regions.map((r) => (
              <button key={r} className={`btn btn-sm ${region === r ? 'btn-primary' : ''}`} onClick={() => setRegion(r)}>
                {REGION_LORE[r]?.name || r}
              </button>
            ))}
          </div>
        </div>
        {region !== 'all' && REGION_LORE[region] && (
          <div className="card" style={{ marginBottom: 16, fontStyle: 'italic' }}>{REGION_LORE[region].lore}</div>
        )}
        <div className="grid-cards">
          {filtered.map((q) => {
            const locked = !!char && char.level < q.level_req;
            const tooTired = !!char && char.energy < q.energy_cost;
            return (
              <div key={q.id} className="card" style={{ opacity: locked ? .55 : 1 }}>
                <div className="flex between">
                  <div>
                    <strong style={{ color: 'var(--gold-1)', fontFamily: 'var(--font-display)' }}>{q.title}</strong>
                    <div className="muted text-sm" style={{ textTransform: 'uppercase', letterSpacing: '.08em' }}>
                      {REGION_LORE[q.region]?.name || q.region} · Lv {q.level_req}
                    </div>
                  </div>
                  <div className="tag">{q.energy_cost} EN</div>
                </div>
                <div className="muted text-sm" style={{ marginTop: 8 }}>{q.intro}</div>
                <div className="flex gap-sm" style={{ marginTop: 12 }}>
                  <span className="tag gold">+{q.xp_reward} XP</span>
                  <span className="tag gold">+{q.gold_reward}g</span>
                  {q.item_reward && <span className="tag sapphire">drop chance</span>}
                </div>
                <div style={{ marginTop: 14 }}>
                  <button
                    className="btn btn-primary"
                    disabled={locked || tooTired}
                    onClick={() => setActive(q)}
                  >
                    {locked ? `Requires Lv ${q.level_req}` : tooTired ? 'Too Tired' : 'Embark'}
                  </button>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="muted">No quests here right now.</div>}
        </div>
      </div>
    </div>
  );
}
