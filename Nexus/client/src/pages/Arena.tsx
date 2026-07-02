import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import type { ArenaOpponent, ArenaResult } from '../lib/types';
import CombatScene from '../combat/CombatScene';

export default function Arena(): React.ReactElement {
  const { t } = useTranslation();
  const char = useStore((s) => s.character);
  const refresh = useStore((s) => s.refreshCharacter);
  const toast = useStore((s) => s.toast);
  const showUnlocks = useStore((s) => s.showUnlocks);
  const showLevelUp = useStore((s) => s.showLevelUp);
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
      if (r.levelUp?.leveled) showLevelUp(r.levelUp);
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
          introTitle={t('arena.vsTitle', { hero: fight.hero.name, foe: fight.foe.name })}
        />
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">{t('arena.title')}</h2>
          <div className="panel-subtitle">{t('arena.subtitle')} <span className="gold">{char?.arena_rating}</span></div>
        </div>
        <button className="btn" onClick={load}>{t('arena.refresh')}</button>
      </div>
      <div className="grid-cards">
        {opps.map((o) => (
          <div key={o.id} className="card">
            <div className="flex between">
              <div>
                <strong style={{ fontFamily: 'var(--font-display)', color: 'var(--gold-1)' }}>{o.name}</strong>
                <div className="muted text-sm" style={{ textTransform: 'capitalize' }}>{o.class} · {t('arena.lv', { n: o.level })}</div>
              </div>
              <div className="flex gap-sm">
                {(o as any).is_npc ? <span className="tag">{t('arena.trainer')}</span> : null}
                <div className="tag">{t('arena.elo', { n: o.arena_rating })}</div>
              </div>
            </div>
            <div className="muted text-sm" style={{ marginTop: 8 }}>
              {t('arena.winsLosses', { w: o.wins, l: o.losses })}
            </div>
            <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={!char} onClick={() => challenge(o.id)}>
              {t('arena.challenge')}
            </button>
          </div>
        ))}
        {opps.length === 0 && <div className="muted">{t('arena.noOpponents')}</div>}
      </div>
    </div>
  );
}
