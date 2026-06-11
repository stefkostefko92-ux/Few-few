import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import CombatScene from '../combat/CombatScene';

interface DungeonDef {
  slug: string;
  name: string;
  region: string;
  level_req: number;
  energy_cost: number;
  stages: number;
  xp_bonus: number;
  gold_bonus: number;
  intro: string;
  unlocked: boolean;
}

interface ActiveRun {
  slug: string;
  stage: number;
  hp: number;
  hp_max: number;
  gold_pile: number;
  xp_pile: number;
  items: string[];
}

export default function Dungeons(): React.ReactElement {
  const toast = useStore((s) => s.toast);
  const refresh = useStore((s) => s.refreshCharacter);
  const showUnlocks = useStore((s) => s.showUnlocks);
  const char = useStore((s) => s.character);
  const [dungeons, setDungeons] = useState<DungeonDef[]>([]);
  const [active, setActive] = useState<ActiveRun | null>(null);
  const [fight, setFight] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await api.get('/dungeon');
    setDungeons(r.dungeons);
    setActive(r.active);
  }

  useEffect(() => { load(); }, []);

  async function enter(slug: string) {
    setBusy(true);
    try {
      await api.post('/dungeon/enter', { slug });
      toast('You step into the dark.', 'info');
      await Promise.all([load(), refresh()]);
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function advance() {
    setBusy(true);
    try {
      const r = await api.post('/dungeon/advance');
      setFight(r);
      showUnlocks(r.unlocked);
      await refresh();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function claim() {
    try {
      const r = await api.post('/dungeon/claim');
      toast(`Dungeon cleared! +${r.xp} XP, +${r.gold} gold`, 'success');
      if (r.levelUp) toast(`Level Up! → ${r.levelUp.toLevel}`, 'success');
      showUnlocks(r.unlocked);
      setFight(null);
      setActive(null);
      await Promise.all([load(), refresh()]);
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }

  async function abandon() {
    if (!confirm('Abandon the dungeon and lose your progress?')) return;
    await api.post('/dungeon/abandon');
    setActive(null);
    setFight(null);
    await load();
  }

  if (fight) {
    return (
      <div className="col" style={{ gap: 16 }}>
        <CombatScene
          hero={fight.hero}
          foe={fight.foe}
          rounds={fight.rounds}
          victory={fight.success}
          onClose={() => { setFight(null); load(); }}
          introTitle={`Stage ${fight.stage} of ${fight.totalStages} — ${fight.foe.name}`}
        />
        <div className="panel" style={{ padding: 16 }}>
          {fight.cleared ? (
            <div className="flex between">
              <div>The final stage is yours. Claim the spoils.</div>
              <button className="btn btn-primary" onClick={claim}>Claim Rewards</button>
            </div>
          ) : fight.finished ? (
            <div className="flex between">
              <div>The dungeon defeated you. Recover and try again later.</div>
              <button className="btn" onClick={() => { setFight(null); load(); }}>Back</button>
            </div>
          ) : (
            <div className="flex between">
              <div>{fight.success ? `Stage ${fight.stage} cleared.` : 'Continue or retreat.'}</div>
              <div className="flex gap-sm">
                <button className="btn" onClick={abandon}>Abandon</button>
                <button className="btn btn-primary" onClick={advance} disabled={busy}>Next Stage</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (active) {
    const def = dungeons.find((d) => d.slug === active.slug);
    return (
      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">{def?.name ?? active.slug}</h2>
          <div className="panel-subtitle">Stage {active.stage} of {def?.stages ?? '?'}</div>
        </div>
        <div className="card">
          <div className="muted">Carried so far</div>
          <div className="flex gap-md" style={{ marginTop: 8 }}>
            <span className="tag gold">+{active.xp_pile} XP</span>
            <span className="tag gold">+{active.gold_pile}g</span>
            {active.items.map((it, i) => <span key={i} className="tag sapphire">{it.replace(/_/g, ' ')}</span>)}
          </div>
          <div style={{ marginTop: 12 }} className="bar">
            <div className="bar-fill hp" style={{ width: `${(active.hp / active.hp_max) * 100}%` }} />
            <div className="bar-label">{active.hp} / {active.hp_max} HP</div>
          </div>
        </div>
        <div className="flex gap-sm" style={{ marginTop: 16 }}>
          {def && active.stage >= def.stages ? (
            <button className="btn btn-primary" onClick={claim}>Claim Rewards</button>
          ) : (
            <button className="btn btn-primary" onClick={advance} disabled={busy}>Press Onward</button>
          )}
          <button className="btn" onClick={abandon}>Abandon</button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Dungeons</h2>
          <div className="panel-subtitle">Multi-stage runs. Survive to the end for an item, big XP, and gold.</div>
        </div>
      </div>
      <div className="grid-cards">
        {dungeons.map((d) => (
          <div key={d.slug} className="card" style={{ opacity: d.unlocked ? 1 : 0.5 }}>
            <strong style={{ color: 'var(--gold-1)', fontFamily: 'var(--font-display)' }}>{d.name}</strong>
            <div className="muted text-sm" style={{ textTransform: 'capitalize' }}>{d.region.replace(/_/g, ' ')} · Lv {d.level_req}</div>
            <div className="muted text-sm" style={{ marginTop: 8, fontStyle: 'italic' }}>{d.intro}</div>
            <div className="flex gap-sm" style={{ marginTop: 12 }}>
              <span className="tag">{d.stages} stages</span>
              <span className="tag">{d.energy_cost} EN</span>
              <span className="tag gold">+{d.xp_bonus} XP</span>
              <span className="tag gold">+{d.gold_bonus}g</span>
            </div>
            <button
              className="btn btn-primary"
              style={{ marginTop: 12, width: '100%' }}
              disabled={!d.unlocked || !char || char.energy < d.energy_cost || busy}
              onClick={() => enter(d.slug)}
            >
              {d.unlocked ? `Enter (${d.energy_cost} EN)` : `Requires Lv ${d.level_req}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
