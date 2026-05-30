import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CombatActor, CombatRound } from '../lib/types';
import { spriteFor } from './sprites';
import '../styles/combat.css';

interface Reward {
  xp?: number;
  gold?: number;
  itemReward?: string | null;
  ratingDelta?: number;
}

interface Props {
  hero: CombatActor;
  foe: CombatActor;
  rounds: CombatRound[];
  victory: boolean;
  reward?: Reward;
  onReplay?: () => void;
  onClose?: () => void;
  introTitle?: string;
  speedMs?: number;
  region?: string;
}

type Animation =
  | 'idle'
  | 'windup-hero' | 'windup-foe'
  | 'strike-hero' | 'strike-foe'
  | 'hurt-1' | 'hurt-2' | 'hurt-3'
  | 'dodge-hero' | 'dodge-foe'
  | 'block-hero' | 'block-foe'
  | 'defeated';

interface PopUp {
  id: number;
  side: 'hero' | 'foe';
  text: string;
  kind: 'normal' | 'big' | 'crit' | 'miss' | 'dodge' | 'block';
}

interface FxBurst {
  id: number;
  side: 'hero' | 'foe';
  kind: 'slash' | 'pierce' | 'magic' | 'arrow';
  crit: boolean;
  color: string;
}

function damageTier(damage: number, foeMaxHp: number): 1 | 2 | 3 {
  // What proportion of the target's max HP did this hit do?
  const pct = damage / Math.max(1, foeMaxHp);
  if (pct >= 0.3) return 3;
  if (pct >= 0.15) return 2;
  return 1;
}

function sparkColor(kind: FxBurst['kind']): string {
  switch (kind) {
    case 'slash': return '#ffd34d';
    case 'arrow': return '#ffe6a3';
    case 'magic': return '#c294ff';
    case 'pierce': return '#ffffff';
  }
}

export default function CombatScene(props: Props): React.ReactElement {
  const {
    hero, foe, rounds, victory, reward, onReplay, onClose, introTitle,
    speedMs: propSpeed = 1100, region = 'whispering_woods',
  } = props;

  const [speedMs, setSpeedMs] = useState(propSpeed);
  const [roundIdx, setRoundIdx] = useState(-1);
  const [heroHp, setHeroHp] = useState(hero.hp);
  const [foeHp, setFoeHp] = useState(foe.hp);
  const [heroAnim, setHeroAnim] = useState<Animation>('idle');
  const [foeAnim, setFoeAnim] = useState<Animation>('idle');
  const [pops, setPops] = useState<PopUp[]>([]);
  const [fx, setFx] = useState<FxBurst[]>([]);
  const [logVisible, setLogVisible] = useState<CombatRound[]>([]);
  const [done, setDone] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [flashStrength, setFlashStrength] = useState(0);
  const [flashKey, setFlashKey] = useState(0);
  const popId = useRef(0);
  const fxId = useRef(0);
  const stageRef = useRef<HTMLDivElement>(null);

  // Intro card → start playback
  useEffect(() => {
    const t = setTimeout(() => {
      setShowIntro(false);
      setRoundIdx(0);
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  // Play each round in sequence
  useEffect(() => {
    if (roundIdx < 0 || roundIdx >= rounds.length) {
      if (roundIdx >= rounds.length && !done) {
        if (victory) setFoeAnim('defeated');
        else setHeroAnim('defeated');
        setTimeout(() => setDone(true), 1400);
      }
      return;
    }

    const r = rounds[roundIdx];
    const attackerIsHero = r.attacker === 'hero';

    // 1) Windup (small backstep)
    if (attackerIsHero) setHeroAnim('windup-hero');
    else setFoeAnim('windup-foe');

    const windupTime = Math.min(220, speedMs * 0.18);
    const strikeStart = setTimeout(() => {
      if (attackerIsHero) setHeroAnim('strike-hero');
      else setFoeAnim('strike-foe');
    }, windupTime);

    // 2) Impact (mid-strike)
    const impactDelay = windupTime + Math.min(280, speedMs * 0.22);
    const impact = setTimeout(() => {
      const targetSide: 'hero' | 'foe' = attackerIsHero ? 'foe' : 'hero';
      const targetMax = attackerIsHero ? foe.hp_max : hero.hp_max;

      // Pop labels
      const tier = damageTier(r.damage, targetMax);
      let popText = `${r.damage}`;
      let popKind: PopUp['kind'] = tier === 3 ? 'big' : 'normal';

      if (r.action === 'crit') { popText = `${r.damage}!`; popKind = 'crit'; }
      else if (r.action === 'miss') { popText = 'MISS'; popKind = 'miss'; }
      else if (r.action === 'dodge') { popText = 'DODGE!'; popKind = 'dodge'; }
      else if (r.action === 'block') { popText = `BLOCK ${r.damage}`; popKind = 'block'; }

      setPops((arr) => [...arr, { id: ++popId.current, side: targetSide, text: popText, kind: popKind }]);

      // Hit FX & target reaction
      if (r.action !== 'miss' && r.action !== 'dodge') {
        if (r.effect) {
          setFx((arr) => [
            ...arr,
            {
              id: ++fxId.current,
              side: targetSide,
              kind: r.effect as FxBurst['kind'],
              crit: r.action === 'crit',
              color: sparkColor(r.effect as FxBurst['kind']),
            },
          ]);
        }

        // Target reaction
        const reactionTier = r.action === 'crit' ? 3 : tier;
        const hurtAnim = (`hurt-${reactionTier}` as Animation);
        if (attackerIsHero) setFoeAnim(hurtAnim);
        else setHeroAnim(hurtAnim);

        // Screen shake proportional to damage
        if (stageRef.current) {
          stageRef.current.classList.remove('shake-1', 'shake-2', 'shake-3');
          void stageRef.current.offsetWidth;
          stageRef.current.classList.add(`shake-${reactionTier}`);
        }

        // Screen flash on big hits / crits
        if (reactionTier >= 2) {
          setFlashStrength(r.action === 'crit' ? 0.55 : 0.28);
          setFlashKey((k) => k + 1);
        }

        // Hit-stop on crit
        if (r.action === 'crit' && stageRef.current) {
          stageRef.current.classList.add('hit-stop');
          setTimeout(() => stageRef.current?.classList.remove('hit-stop'), 220);
        }

        // Drain HP after the strike's apex
        if (attackerIsHero) setFoeHp((hp) => Math.max(0, hp - r.damage));
        else setHeroHp((hp) => Math.max(0, hp - r.damage));
      } else {
        if (r.action === 'dodge') {
          if (attackerIsHero) setFoeAnim('dodge-foe');
          else setHeroAnim('dodge-hero');
        }
      }

      // Append to log
      setLogVisible((arr) => [...arr, r]);
    }, impactDelay);

    // 3) Reset to idle, advance round
    const next = setTimeout(() => {
      setHeroAnim('idle');
      setFoeAnim('idle');
      setPops((arr) => arr.slice(-3));
      setFx((arr) => arr.slice(-3));
      setRoundIdx((i) => i + 1);
    }, speedMs);

    return () => { clearTimeout(strikeStart); clearTimeout(impact); clearTimeout(next); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundIdx, rounds, speedMs]);

  const heroHpPct = Math.max(0, (heroHp / hero.hp_max) * 100);
  const foeHpPct = Math.max(0, (foeHp / foe.hp_max) * 100);

  // Ghost (drain trail) is the previous HP value, lagging behind
  const heroGhost = useGhostHp(heroHp, hero.hp_max);
  const foeGhost = useGhostHp(foeHp, foe.hp_max);

  const progress = roundIdx < 0 ? 0 : Math.min(100, Math.round((roundIdx / Math.max(1, rounds.length)) * 100));

  return (
    <div className="combat-stage" data-region={region} ref={stageRef}>
      <div className="combat-skybox" aria-hidden="true" />
      <CombatEnvironment region={region} />

      {showIntro && (
        <div className="intro-screen">
          <div className="title">{introTitle || `${hero.name}  vs  ${foe.name}`}</div>
        </div>
      )}

      <div className="combat-header">
        <Combatant actor={{ ...hero, hp: heroHp }} hpPct={heroHpPct} ghostPct={heroGhost} />
        <div className="combat-vs">VS</div>
        <Combatant actor={{ ...foe, hp: foeHp }} hpPct={foeHpPct} ghostPct={foeGhost} side="foe" />
      </div>

      <div className="combat-field">
        <Fighter
          side="hero"
          anim={heroAnim}
          sprite={hero.sprite}
          fx={fx.filter((f) => f.side === 'hero')}
          pops={pops.filter((p) => p.side === 'hero')}
        />
        <Fighter
          side="foe"
          anim={foeAnim}
          sprite={foe.sprite}
          fx={fx.filter((f) => f.side === 'foe')}
          pops={pops.filter((p) => p.side === 'foe')}
        />
      </div>

      <div className="combat-ground" />

      {/* Per-strike global flash */}
      {flashStrength > 0 && (
        <div
          key={flashKey}
          className="fx-flash"
          style={{ ['--flash-strength' as any]: flashStrength }}
          onAnimationEnd={() => setFlashStrength(0)}
        />
      )}

      <div className="combat-log">
        {logVisible.slice(-8).map((r, i) => (
          <div key={`${r.index}-${i}`} className={`line ${r.action}`}>
            <div className="round-num">{r.index}</div>
            <div>{r.text}</div>
          </div>
        ))}
        {logVisible.length === 0 && !showIntro && (
          <div className="line" style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>
            <div className="round-num">…</div>
            <div>The combatants size each other up.</div>
          </div>
        )}
      </div>

      {!done && (
        <>
          <div style={{ position: 'absolute', top: 8, left: 28, right: 28, height: 2, background: 'rgba(255,255,255,.06)', zIndex: 7 }}>
            <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, var(--gold-2), var(--gold-1))', transition: 'width .4s ease' }} />
          </div>
          <div style={{ position: 'absolute', top: 14, right: 28, zIndex: 8, display: 'flex', gap: 6 }}>
            <button className="btn btn-sm" onClick={() => setSpeedMs(1500)} title="Slow">½×</button>
            <button className="btn btn-sm" onClick={() => setSpeedMs(1100)} title="Normal">1×</button>
            <button className="btn btn-sm" onClick={() => setSpeedMs(600)} title="Fast">2×</button>
            <button className="btn btn-sm" onClick={() => setSpeedMs(250)} title="Skip ahead">≫</button>
          </div>
        </>
      )}

      {done && (
        <div className={`combat-result ${victory ? 'victory' : 'defeat'}`}>
          <div className="title">{victory ? 'Victory' : 'Defeat'}</div>
          <div className="muted">
            {victory
              ? 'The foe is vanquished. Your name echoes through the realm.'
              : 'The world dims. Tend your wounds and rise again.'}
          </div>
          {reward && (
            <div className="reward-row">
              {!!reward.xp && <div className="reward-pill xp">+{reward.xp} XP</div>}
              {!!reward.gold && <div className="reward-pill gold">+{reward.gold} Gold</div>}
              {!!reward.ratingDelta && (
                <div className="reward-pill">
                  Arena {reward.ratingDelta > 0 ? '+' : ''}
                  {reward.ratingDelta}
                </div>
              )}
              {reward.itemReward && (
                <div className="reward-pill item">Item: {reward.itemReward.replace(/_/g, ' ')}</div>
              )}
            </div>
          )}
          <div className="combat-controls">
            {onReplay && <button className="btn" onClick={onReplay}>Replay</button>}
            {onClose && <button className="btn btn-primary" onClick={onClose}>Continue</button>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Ghost HP that smoothly lags behind real HP — drives the white "lost-chunk" trail. */
function useGhostHp(currentHp: number, maxHp: number): number {
  const [ghost, setGhost] = useState((currentHp / maxHp) * 100);
  useEffect(() => {
    const realPct = (currentHp / maxHp) * 100;
    const t = setTimeout(() => setGhost(realPct), 800);
    return () => clearTimeout(t);
  }, [currentHp, maxHp]);
  return ghost;
}

function Combatant({
  actor, hpPct, ghostPct, side,
}: {
  actor: CombatActor; hpPct: number; ghostPct: number; side?: 'hero' | 'foe';
}) {
  return (
    <div className={`combatant-card ${side === 'foe' ? 'foe' : ''}`}>
      <div className="combatant-portrait" aria-hidden="true">
        {spriteFor(actor.sprite)}
      </div>
      <div className="combatant-info">
        <div className="name">{actor.name}</div>
        <div className="meta">
          Lv {actor.level} · ATK {actor.atk_min}-{actor.atk_max} · DEF {actor.defense}
        </div>
        <div className="hp-bar">
          <div className="hp-bar-ghost" style={{ width: `${Math.max(ghostPct, hpPct)}%` }} />
          <div className="hp-bar-fill" style={{ width: `${hpPct}%` }} />
          <div className="hp-bar-label">
            {actor.hp} / {actor.hp_max}
          </div>
        </div>
      </div>
    </div>
  );
}

function Fighter({
  side, anim, sprite, fx, pops,
}: {
  side: 'hero' | 'foe'; anim: Animation; sprite: string; fx: FxBurst[]; pops: PopUp[];
}) {
  return (
    <div className={`combat-fighter ${side}`}>
      <div className={`fighter-body ${anim}`}>{spriteFor(sprite)}</div>
      {/* Effects layer (sparks + slash/magic/arrow/pierce) */}
      {fx.map((f) => (
        <FxRender key={f.id} burst={f} />
      ))}
      {/* Floating damage pops */}
      {pops.map((p) => (
        <div key={p.id} className={`dmg-pop ${p.kind}`}>
          {p.text}
        </div>
      ))}
    </div>
  );
}

function FxRender({ burst }: { burst: FxBurst }) {
  return (
    <>
      {/* Layered effect overlay */}
      {burst.kind === 'slash' && <div className="fx-slash" />}
      {burst.kind === 'magic' && <div className="fx-magic" />}
      {burst.kind === 'arrow' && <div className="fx-arrow" />}
      {burst.kind === 'pierce' && <div className="fx-pierce" />}
      {/* Particle spray */}
      <div
        className={`fx-burst ${burst.crit ? 'crit' : ''}`}
        style={{ ['--spark-color' as any]: burst.color }}
      >
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="spark" />
        ))}
      </div>
    </>
  );
}

function CombatEnvironment({ region }: { region: string }) {
  // Simple region-specific silhouettes painted with CSS via absolute divs.
  const shapes: Record<string, React.CSSProperties[]> = {
    whispering_woods: [
      { left: '4%', width: 60, height: 130, borderRadius: '50% 50% 4% 4%' },
      { left: '14%', width: 90, height: 160, borderRadius: '50% 50% 4% 4%' },
      { right: '6%', width: 70, height: 140, borderRadius: '50% 50% 4% 4%' },
      { right: '20%', width: 90, height: 170, borderRadius: '50% 50% 4% 4%' },
    ],
    mistmoor_hills: [
      { left: '2%', width: 240, height: 100, borderRadius: '70% 60% 4% 4%' },
      { right: '0%', width: 280, height: 110, borderRadius: '60% 80% 4% 4%' },
    ],
    crystal_caverns: [
      { left: '6%', width: 30, height: 110, transform: 'skewX(-12deg)' },
      { left: '18%', width: 24, height: 90, transform: 'skewX(8deg)' },
      { right: '8%', width: 30, height: 130, transform: 'skewX(10deg)' },
      { right: '22%', width: 26, height: 100, transform: 'skewX(-10deg)' },
    ],
    ashen_wastes: [
      { left: '6%', width: 60, height: 80 },
      { left: '20%', width: 40, height: 60 },
      { right: '10%', width: 60, height: 70 },
    ],
    shadowfell: [
      { left: '10%', width: 4, height: 220, background: 'linear-gradient(180deg, rgba(180,120,255,.3), transparent)' },
      { left: '40%', width: 4, height: 180, background: 'linear-gradient(180deg, rgba(180,120,255,.25), transparent)' },
      { right: '20%', width: 4, height: 220, background: 'linear-gradient(180deg, rgba(180,120,255,.3), transparent)' },
    ],
  };
  const list = shapes[region] || shapes.whispering_woods;
  return (
    <div className="combat-environment">
      {list.map((s, i) => (
        <div key={i} className="silhouette" style={s} />
      ))}
    </div>
  );
}
