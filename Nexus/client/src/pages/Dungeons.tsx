import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      toast(t('dungeons.stepIntoDark'), 'info');
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
      toast(t('dungeons.clearedToast', { xp: r.xp, gold: r.gold }), 'success');
      if (r.levelUp) toast(t('dungeons.levelUpToast', { level: r.levelUp.toLevel }), 'success');
      showUnlocks(r.unlocked);
      setFight(null);
      setActive(null);
      await Promise.all([load(), refresh()]);
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }

  async function abandon() {
    if (!confirm(t('dungeons.abandonConfirm'))) return;
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
          introTitle={t('dungeons.stageIntro', { stage: fight.stage, total: fight.totalStages, name: fight.foe.name })}
        />
        <div className="panel" style={{ padding: 16 }}>
          {fight.cleared ? (
            <div className="flex between">
              <div>{t('dungeons.finalStageYours')}</div>
              <button className="btn btn-primary" onClick={claim}>{t('dungeons.claimRewards')}</button>
            </div>
          ) : fight.finished ? (
            <div className="flex between">
              <div>{t('dungeons.defeatedText')}</div>
              <button className="btn" onClick={() => { setFight(null); load(); }}>{t('dungeons.back')}</button>
            </div>
          ) : (
            <div className="flex between">
              <div>{fight.success ? t('dungeons.stageCleared', { n: fight.stage }) : t('dungeons.continueOrRetreat')}</div>
              <div className="flex gap-sm">
                <button className="btn" onClick={abandon}>{t('dungeons.abandon')}</button>
                <button className="btn btn-primary" onClick={advance} disabled={busy}>{t('dungeons.nextStage')}</button>
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
          <div className="panel-subtitle">{t('dungeons.stageOf', { stage: active.stage, total: def?.stages ?? '?' })}</div>
        </div>
        <div className="card">
          <div className="muted">{t('dungeons.carriedSoFar')}</div>
          <div className="flex gap-md" style={{ marginTop: 8 }}>
            <span className="tag gold">{t('dungeons.xpTag', { n: active.xp_pile })}</span>
            <span className="tag gold">{t('dungeons.goldTag', { n: active.gold_pile })}</span>
            {active.items.map((it, i) => <span key={i} className="tag sapphire">{it.replace(/_/g, ' ')}</span>)}
          </div>
          <div style={{ marginTop: 12 }} className="bar">
            <div className="bar-fill hp" style={{ width: `${(active.hp / active.hp_max) * 100}%` }} />
            <div className="bar-label">{t('dungeons.hpLabel', { hp: active.hp, max: active.hp_max })}</div>
          </div>
        </div>
        <div className="flex gap-sm" style={{ marginTop: 16 }}>
          {def && active.stage >= def.stages ? (
            <button className="btn btn-primary" onClick={claim}>{t('dungeons.claimRewards')}</button>
          ) : (
            <button className="btn btn-primary" onClick={advance} disabled={busy}>{t('dungeons.pressOnward')}</button>
          )}
          <button className="btn" onClick={abandon}>{t('dungeons.abandon')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">{t('dungeons.title')}</h2>
          <div className="panel-subtitle">{t('dungeons.subtitle')}</div>
        </div>
      </div>
      <div className="grid-cards">
        {dungeons.map((d) => (
          <div key={d.slug} className="card" style={{ opacity: d.unlocked ? 1 : 0.5 }}>
            <strong style={{ color: 'var(--gold-1)', fontFamily: 'var(--font-display)' }}>{d.name}</strong>
            <div className="muted text-sm" style={{ textTransform: 'capitalize' }}>{d.region.replace(/_/g, ' ')} · {t('dungeons.lv', { n: d.level_req })}</div>
            <div className="muted text-sm" style={{ marginTop: 8, fontStyle: 'italic' }}>{d.intro}</div>
            <div className="flex gap-sm" style={{ marginTop: 12 }}>
              <span className="tag">{t('dungeons.stagesTag', { n: d.stages })}</span>
              <span className="tag">{t('dungeons.energyTag', { n: d.energy_cost })}</span>
              <span className="tag gold">{t('dungeons.xpTag', { n: d.xp_bonus })}</span>
              <span className="tag gold">{t('dungeons.goldTag', { n: d.gold_bonus })}</span>
            </div>
            <button
              className="btn btn-primary"
              style={{ marginTop: 12, width: '100%' }}
              disabled={!d.unlocked || !char || char.energy < d.energy_cost || busy}
              onClick={() => enter(d.slug)}
            >
              {d.unlocked ? t('dungeons.enter', { n: d.energy_cost }) : t('dungeons.requiresLv', { n: d.level_req })}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
