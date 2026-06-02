import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import CombatScene from '../combat/CombatScene';

interface Region {
  region: string;
  monster_count: number;
  min_level: number;
  max_level: number;
  gate: number;
  unlocked: boolean;
}

export default function Hunting(): React.ReactElement {
  const toast = useStore((s) => s.toast);
  const refresh = useStore((s) => s.refreshCharacter);
  const showUnlocks = useStore((s) => s.showUnlocks);
  const showLevelUp = useStore((s) => s.showLevelUp);
  const char = useStore((s) => s.character);
  const [regions, setRegions] = useState<Region[]>([]);
  const [region, setRegion] = useState<string | null>(null);
  const [fight, setFight] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await api.get('/hunting/regions');
    setRegions(r.regions);
  }
  useEffect(() => { load(); }, []);

  async function hunt(slug: string) {
    if (busy) return;
    setBusy(true);
    setRegion(slug);
    try {
      const r = await api.post('/hunting/hunt', { region: slug });
      setFight(r);
      if (r.levelUp) showLevelUp(r.levelUp);
      showUnlocks(r.unlocked);
      await refresh();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (fight) {
    return (
      <div className="col" style={{ gap: 16 }}>
        <CombatScene
          hero={fight.hero}
          foe={fight.foe}
          rounds={fight.rounds}
          victory={fight.success}
          reward={{ xp: fight.xp, gold: fight.gold, itemReward: fight.itemReward || null, itemDrop: fight.itemDrop || null }}
          onClose={() => { setFight(null); }}
          onReplay={() => hunt(region!)}
          introTitle={`Wild Encounter — ${fight.foe.name}`}
          region={region || undefined}
        />
        <div className="panel" style={{ padding: 16 }}>
          <div className="flex between">
            <div>{fight.success ? 'Foe down. The hunt continues.' : 'You stagger back, bruised.'}</div>
            <div className="flex gap-sm">
              <button className="btn" onClick={() => setFight(null)}>Stop Hunting</button>
              <button className="btn btn-primary" disabled={!char} onClick={() => hunt(region!)}>
                Hunt Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="col" style={{ gap: 24 }}>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Hunting Grounds</h2>
            <div className="panel-subtitle">Repeatable encounters — random foe. Each hunt sets a random 1-20 min cooldown (reduced by mounts).</div>
          </div>
        </div>
        <div className="grid-cards">
          {regions.map((r) => (
            <div key={r.region} className="card" style={{ opacity: r.unlocked ? 1 : 0.5 }}>
              <strong style={{ color: 'var(--gold-1)', fontFamily: 'var(--font-display)' }}>{prettyRegion(r.region)}</strong>
              <div className="muted text-sm">Lv {r.min_level}–{r.max_level} · {r.monster_count} foes</div>
              <button className="btn btn-primary" style={{ marginTop: 12, width: '100%' }} disabled={!r.unlocked || !char || busy} onClick={() => hunt(r.region)}>
                {!r.unlocked ? `Requires Lv ${r.gate}` : 'Hunt Here'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function prettyRegion(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
