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
  speedMs?: number; // ms per round; default 1100
}

type Animation = 'idle' | 'attack-hero' | 'attack-foe' | 'hurt' | 'dodge' | 'defeated';

interface PopUp {
  id: number;
  side: 'hero' | 'foe';
  text: string;
  kind: 'damage' | 'crit' | 'miss' | 'dodge' | 'block' | 'heal';
}

interface FxBurst {
  id: number;
  side: 'hero' | 'foe';
  kind: 'slash' | 'pierce' | 'magic' | 'arrow';
}

export default function CombatScene(props: Props): React.ReactElement {
  const { hero, foe, rounds, victory, reward, onReplay, onClose, introTitle, speedMs = 1100 } = props;
  const [roundIdx, setRoundIdx] = useState(-1); // -1 means intro
  const [heroHp, setHeroHp] = useState(hero.hp);
  const [foeHp, setFoeHp] = useState(foe.hp);
  const [heroAnim, setHeroAnim] = useState<Animation>('idle');
  const [foeAnim, setFoeAnim] = useState<Animation>('idle');
  const [pops, setPops] = useState<PopUp[]>([]);
  const [fx, setFx] = useState<FxBurst[]>([]);
  const [logVisible, setLogVisible] = useState<CombatRound[]>([]);
  const [done, setDone] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const popId = useRef(0);
  const fxId = useRef(0);
  const stageRef = useRef<HTMLDivElement>(null);

  // After intro, start playing
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
        // Final result animation
        if (victory) setFoeAnim('defeated');
        else setHeroAnim('defeated');
        setTimeout(() => setDone(true), 800);
      }
      return;
    }

    const r = rounds[roundIdx];
    const attackerIsHero = r.attacker === 'hero';

    // Attack animation
    if (attackerIsHero) setHeroAnim('attack-hero');
    else setFoeAnim('attack-foe');

    // Slight delay before impact
    const impactDelay = speedMs * 0.36;
    const hitT = setTimeout(() => {
      const popText = r.action === 'miss' ? 'MISS' : r.action === 'dodge' ? 'DODGE' : r.action === 'block' ? `BLOCK ${r.damage}` : r.action === 'crit' ? `${r.damage}!` : `${r.damage}`;
      const popKind: PopUp['kind'] = r.action === 'crit' ? 'crit' : r.action === 'miss' ? 'miss' : r.action === 'dodge' ? 'dodge' : r.action === 'block' ? 'block' : 'damage';

      const targetSide: 'hero' | 'foe' = attackerIsHero ? 'foe' : 'hero';

      if (r.action !== 'miss' && r.action !== 'dodge') {
        setPops((arr) => [...arr, { id: ++popId.current, side: targetSide, text: popText, kind: popKind }]);
        // FX burst on the target
        if (r.effect) {
          setFx((arr) => [
            ...arr,
            { id: ++fxId.current, side: targetSide, kind: r.effect as FxBurst['kind'] },
          ]);
        }
        // Target hurt animation
        if (attackerIsHero) setFoeAnim('hurt');
        else setHeroAnim('hurt');

        // Camera shake on crit
        if (r.action === 'crit' && stageRef.current) {
          stageRef.current.classList.remove('fx-shake');
          // force reflow
          void stageRef.current.offsetWidth;
          stageRef.current.classList.add('fx-shake');
        }

        // Apply HP
        if (attackerIsHero) setFoeHp((hp) => Math.max(0, hp - r.damage));
        else setHeroHp((hp) => Math.max(0, hp - r.damage));
      } else {
        // Dodge animation on target
        if (r.action === 'dodge') {
          if (attackerIsHero) setFoeAnim('dodge');
          else setHeroAnim('dodge');
        }
        setPops((arr) => [...arr, { id: ++popId.current, side: targetSide, text: popText, kind: popKind }]);
      }

      // Append log
      setLogVisible((arr) => [...arr, r]);
    }, impactDelay);

    // Reset animation states & advance round
    const nextT = setTimeout(() => {
      setHeroAnim('idle');
      setFoeAnim('idle');
      // Clean expired pops
      setPops((arr) => arr.slice(-4));
      setFx((arr) => arr.slice(-4));
      setRoundIdx((i) => i + 1);
    }, speedMs);

    return () => {
      clearTimeout(hitT);
      clearTimeout(nextT);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundIdx, rounds, speedMs]);

  const heroHpPct = Math.max(0, (heroHp / hero.hp_max) * 100);
  const foeHpPct = Math.max(0, (foeHp / foe.hp_max) * 100);

  const totalRounds = rounds.length;
  const progress = roundIdx < 0 ? 0 : Math.min(100, Math.round(((roundIdx) / Math.max(1, totalRounds)) * 100));

  return (
    <div className="combat-stage" ref={stageRef}>
      <div className="combat-skybox" aria-hidden="true" />

      {/* Intro flash */}
      {showIntro && (
        <div className="intro-screen">
          <div className="title">{introTitle || `${hero.name}  VS  ${foe.name}`}</div>
        </div>
      )}

      <div className="combat-header">
        <Combatant actor={{ ...hero, hp: heroHp }} hpPct={heroHpPct} />
        <div className="combat-vs">— VS —</div>
        <Combatant actor={{ ...foe, hp: foeHp }} hpPct={foeHpPct} side="foe" />
      </div>

      <div className="combat-field">
        <Fighter side="hero" anim={heroAnim} sprite={hero.sprite} fx={fx.filter((f) => f.side === 'hero')} pops={pops.filter((p) => p.side === 'hero')} />
        <Fighter side="foe" anim={foeAnim} sprite={foe.sprite} fx={fx.filter((f) => f.side === 'foe')} pops={pops.filter((p) => p.side === 'foe')} />
      </div>

      <div className="combat-ground" />

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

      {/* Progress */}
      {!done && (
        <div style={{ position: 'absolute', top: 8, left: 28, right: 28, height: 2, background: 'rgba(255,255,255,.05)', zIndex: 6 }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, var(--gold-2), var(--gold-1))', transition: 'width .4s ease' }} />
        </div>
      )}

      {done && (
        <div className={`combat-result ${victory ? 'victory' : 'defeat'}`}>
          <div className="title">{victory ? 'Victory' : 'Defeat'}</div>
          <div className="muted">{victory ? 'The foe is vanquished. Tanoth sings your name.' : 'The world dims. Tend your wounds and return.'}</div>
          {reward && (
            <div className="reward-row">
              {!!reward.xp && <div className="reward-pill xp">+{reward.xp} XP</div>}
              {!!reward.gold && <div className="reward-pill gold">+{reward.gold} Gold</div>}
              {!!reward.ratingDelta && (
                <div className="reward-pill">
                  Arena {reward.ratingDelta > 0 ? '+' : ''}{reward.ratingDelta}
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

function Combatant({
  actor,
  hpPct,
  side,
}: {
  actor: CombatActor;
  hpPct: number;
  side?: 'hero' | 'foe';
}) {
  return (
    <div className={`combatant-card ${side === 'foe' ? 'foe' : ''}`}>
      <div className="combatant-portrait" aria-hidden="true">
        {emojiFor(actor.sprite)}
      </div>
      <div className="combatant-info">
        <div className="name">{actor.name}</div>
        <div className="meta">Lv {actor.level} · ATK {actor.atk_min}-{actor.atk_max} · DEF {actor.defense}</div>
        <div className="hp-bar-wrap">
          <div className="bar">
            <div className="bar-fill hp" style={{ width: `${hpPct}%` }} />
            <div className="bar-label">{actor.hp} / {actor.hp_max}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Fighter({
  side,
  anim,
  sprite,
  fx,
  pops,
}: {
  side: 'hero' | 'foe';
  anim: Animation;
  sprite: string;
  fx: FxBurst[];
  pops: PopUp[];
}) {
  return (
    <div className={`combat-fighter ${side}`}>
      <div className={`fighter-body ${anim}`}>
        {spriteFor(sprite)}
      </div>
      <div className="fx-layer">
        {fx.map((f) => (
          <FxRender key={f.id} kind={f.kind} />
        ))}
        {pops.map((p) => (
          <div key={p.id} className={`damage-pop ${p.kind}`}>{p.text}</div>
        ))}
      </div>
    </div>
  );
}

function FxRender({ kind }: { kind: FxBurst['kind'] }) {
  if (kind === 'slash') return <div className="fx-slash" />;
  if (kind === 'magic') return <div className="fx-magic" />;
  if (kind === 'arrow') return <div className="fx-arrow" />;
  if (kind === 'pierce') return <div className="fx-pierce" />;
  return null;
}

function emojiFor(sprite: string): string {
  switch (sprite) {
    case 'warrior': return '⚔️';
    case 'ranger': return '🏹';
    case 'mage': return '✨';
    case 'rogue': return '🗡';
    case 'goblin': return '👺';
    case 'rat': return '🐀';
    case 'boar': return '🐗';
    case 'wolf': return '🐺';
    case 'bandit': return '🥷';
    case 'troll': return '👹';
    case 'orc': return '🧌';
    case 'witch': return '🧙';
    case 'spider': return '🕷';
    case 'golem': return '🗿';
    case 'serpent': return '🐍';
    case 'wraith': return '👻';
    case 'drake':
    case 'dragon': return '🐉';
    case 'titan': return '⛰';
    case 'shadowlord':
    case 'overlord': return '☠️';
    default: return '👤';
  }
}
