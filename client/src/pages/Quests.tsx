import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import type { Quest } from '../lib/types';
import QuestRun from './QuestRun';
import { REGIONS, regionName, regionLore } from '../lib/regions';

export default function Quests(): React.ReactElement {
  const char = useStore((s) => s.character);
  const toast = useStore((s) => s.toast);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  // The world-map pins deep-link here as /app/quests?region=<slug>, so the
  // chosen region survives the click. Falls back to "all".
  const [region, setRegion] = useState<string>(searchParams.get('region') || 'all');
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

  // Keep the region filter in sync with the URL (back/forward + map links).
  useEffect(() => {
    const q = searchParams.get('region');
    if (q && q !== region) setRegion(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function pickRegion(slug: string) {
    setRegion(slug);
    if (slug === 'all') setSearchParams({});
    else setSearchParams({ region: slug });
  }

  // Order the region filter buttons by the canonical map order (level band),
  // keeping any unknown slugs at the end rather than randomly interleaved.
  const regions = useMemo(() => {
    const order = REGIONS.map((r) => r.slug);
    return Array.from(new Set(quests.map((q) => q.region))).sort((a, b) => {
      const ia = order.indexOf(a); const ib = order.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  }, [quests]);

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
            <button className={`btn btn-sm ${region === 'all' ? 'btn-primary' : ''}`} onClick={() => pickRegion('all')}>All</button>
            {regions.map((r) => (
              <button key={r} className={`btn btn-sm ${region === r ? 'btn-primary' : ''}`} onClick={() => pickRegion(r)}>
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
                      {regionName(q.region)} · Lv {q.level_req}
                    </div>
                  </div>
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
                    disabled={locked}
                    onClick={() => setActive(q)}
                  >
                    {locked ? `Requires Lv ${q.level_req}` : 'Embark'}
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
