import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import type { ArenaOpponent, ArenaResult } from '../lib/types';
import CombatScene from '../combat/CombatScene';

export default function Arena(): React.ReactElement {
  const char = useStore((s) => s.character);
  const refresh = useStore((s) => s.refreshCharacter);
  const toast = useStore((s) => s.toast);
  const showUnlocks = useStore((s) => s.showUnlocks);
  const [opps, setOpps] = useState<ArenaOpponent[]>([]);
  const [fight, setFight] = useState<ArenaResult | null>(null);

  async function load() {
    try {
      const r = await api.get('/arena/opponents');
      setOpps(r.opponents);
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }
  useEffect(() => { load(); }, []);

  async function challenge(id: number) {
    try {
      const r = (await api.post('/arena/challenge', { opponentId: id })) as ArenaResult;
      setFight(r);
      if (r.levelUp?.leveled) toast(`Level Up! → ${r.levelUp.toLevel}`, 'success');
      showUnlocks((r as any).unlocked);
      await refresh();
    } catch (e: any) {
      toast(e.message, 'error');
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
          reward={{ xp: fight.xp, ratingDelta: fight.ratingDelta }}
          onClose={() => { setFight(null); load(); }}
          introTitle={`${fight.hero.name}  VS  ${fight.foe.name}`}
        />
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Arena of Nexus Dominion</h2>
          <div className="panel-subtitle">Test your steel against other heroes. Rating: <span className="gold">{char?.arena_rating}</span></div>
        </div>
        <button className="btn" onClick={load}>Refresh</button>
      </div>
      <div className="grid-cards">
        {opps.map((o) => (
          <div key={o.id} className="card">
            <div className="flex between">
              <div>
                <strong style={{ fontFamily: 'var(--font-display)', color: 'var(--gold-1)' }}>{o.name}</strong>
                <div className="muted text-sm" style={{ textTransform: 'capitalize' }}>{o.class} · Lv {o.level}</div>
              </div>
              <div className="flex gap-sm">
                {(o as any).is_npc ? <span className="tag">Trainer</span> : null}
                <div className="tag">{o.arena_rating} ELO</div>
              </div>
            </div>
            <div className="muted text-sm" style={{ marginTop: 8 }}>
              {o.wins}W / {o.losses}L
            </div>
            <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={!char || char.energy < 5} onClick={() => challenge(o.id)}>
              Challenge (5 EN)
            </button>
          </div>
        ))}
        {opps.length === 0 && <div className="muted">No worthy opponents nearby. Grow stronger.</div>}
      </div>
    </div>
  );
}
