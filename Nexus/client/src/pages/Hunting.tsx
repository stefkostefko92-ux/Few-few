import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
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
  const { t } = useTranslation();
  const toast = useStore((s) => s.toast);
  const refresh = useStore((s) => s.refreshCharacter);
  const showUnlocks = useStore((s) => s.showUnlocks);
  const showLevelUp = useStore((s) => s.showLevelUp);
  const char = useStore((s) => s.character);
  const [regions, setRegions] = useState<Region[]>([]);
  const [region, setRegion] = useState<string | null>(null);
  const [fight, setFight] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [searchParams] = useSearchParams();
  // „Влез в региона" от картата на света (?region=...): стартираме лов там
  // веднага (веднъж) — това Е влизането в гората, не празен списък.
  const autoEntered = useRef(false);

  async function load() {
    try {
      const r = await api.get('/hunting/regions');
      setRegions(r.regions);
      const want = searchParams.get('region');
      if (want && !autoEntered.current) {
        autoEntered.current = true;
        const target = (r.regions as Region[]).find((x) => x.region === want);
        if (target?.unlocked) hunt(want);
      }
    } catch (e: any) {
      toast(e.message, 'error');
    }
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
          introTitle={t('hunting.wildEncounter', { name: fight.foe.name })}
          region={region || undefined}
        />
        <div className="panel" style={{ padding: 16 }}>
          <div className="flex between">
            <div>{fight.success ? t('hunting.victoryText') : t('hunting.defeatText')}</div>
            <div className="flex gap-sm">
              <button className="btn" onClick={() => setFight(null)}>{t('hunting.stopHunting')}</button>
              <button className="btn btn-primary" disabled={!char} onClick={() => hunt(region!)}>
                {t('hunting.huntAgain')}
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
            <h2 className="panel-title">{t('hunting.title')}</h2>
            <div className="panel-subtitle">{t('hunting.subtitle')}</div>
          </div>
        </div>
        <div className="grid-cards">
          {regions.map((r) => (
            <div key={r.region} className="card" style={{ opacity: r.unlocked ? 1 : 0.5 }}>
              <strong style={{ color: 'var(--gold-1)', fontFamily: 'var(--font-display)' }}>{prettyRegion(r.region)}</strong>
              <div className="muted text-sm">{t('hunting.regionInfo', { min: r.min_level, max: r.max_level, count: r.monster_count })}</div>
              <button className="btn btn-primary" style={{ marginTop: 12, width: '100%' }} disabled={!r.unlocked || !char || busy} onClick={() => hunt(r.region)}>
                {!r.unlocked ? t('hunting.requiresLv', { n: r.gate }) : t('hunting.huntHere')}
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
