import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CombatActor, CombatRound } from '../lib/types';
import BoyDuelStage, { BoyDuelHandle, ImpactEvent } from './engine/BoyDuelStage';
import LootDropOverlay from '../components/LootDropOverlay';
import '../styles/combat.css';

interface Reward {
  xp?: number;
  gold?: number;
  itemReward?: string | null;
  itemDrop?: any | null;
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
  /** Извиква се ЕДНОКРАТНО, когато анимацията реално свърши (не при монтиране!) — страницата
      трябва да пази СВОЯ резултатен панел (badges, "Hunt again"...) скрит до този момент,
      иначе издава изхода преди боят да е изигран (докладван реален бъг при преглед). */
  onDone?: () => void;
  introTitle?: string;
  speedMs?: number;
  region?: string;
}

interface PopUp {
  id: number;
  side: 'hero' | 'foe';
  text: string;
  kind: 'normal' | 'big' | 'crit' | 'miss' | 'dodge' | 'block';
  scale?: number;
}

function damageTier(damage: number, targetMaxHp: number): 1 | 2 | 3 {
  const pct = damage / Math.max(1, targetMaxHp);
  if (pct >= 0.3) return 3;
  if (pct >= 0.15) return 2;
  return 1;
}

function popFor(round: CombatRound, targetMaxHp: number): { text: string; kind: PopUp['kind']; scale: number } {
  const tier = damageTier(round.damage, targetMaxHp);
  const ratio = Math.min(1, round.damage / Math.max(1, targetMaxHp));
  if (round.action === 'miss') return { text: 'MISS', kind: 'miss', scale: 22 };
  if (round.action === 'dodge') return { text: 'DODGE!', kind: 'dodge', scale: 24 };
  if (round.action === 'block') return { text: `BLOCK ${round.damage}`, kind: 'block', scale: 24 };
  if (round.action === 'crit') return { text: `${round.damage}!`, kind: 'crit', scale: Math.round(38 + ratio * 60) };
  return { text: `${round.damage}`, kind: tier === 3 ? 'big' : 'normal', scale: Math.round(26 + ratio * 46) };
}

/**
 * 4a.3 — CombatScene.tsx върху новия двигател (порт на boy/, „Двубой в Рейвънхолд“). Старият
 * конвейер (CombatScene3D/CombatCanvas/CinematicOverlay/спрайтове) е премахнат; BoyDuelStage
 * (rounds/victory) движи реалния бой, а тук само реагираме на onImpact — ТОЧНО в кадъра на
 * удара, не по отделен таймер — за да паднат HP лентите/числото на щетата синхронно с рендера.
 * Публичният интерфейс (props) е разширен само с незадължителен onDone (виж 4a.3-fix по-долу)
 * — 7-те страници продължават да работят без промяна, ако не го подадат.
 */
export default function CombatScene(props: Props): React.ReactElement {
  const {
    hero, foe, rounds, victory, reward, onReplay, onClose, onDone, introTitle,
    region = 'whispering_woods',
  } = props;

  const [heroHp, setHeroHp] = useState(hero.hp);
  const [foeHp, setFoeHp] = useState(foe.hp);
  const [pops, setPops] = useState<PopUp[]>([]);
  const [logVisible, setLogVisible] = useState<CombatRound[]>([]);
  const [done, setDone] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [speedLabel, setSpeedLabel] = useState<'0.5' | '1' | '2'>('1');
  const popId = useRef(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<BoyDuelHandle>(null);

  // Intro card (боят стартира веднага — boy има собствен loading fade-in).
  useEffect(() => {
    const t = setTimeout(() => setShowIntro(false), 1400);
    return () => clearTimeout(t);
  }, []);

  const heroHpPct = Math.max(0, (heroHp / hero.hp_max) * 100);
  const foeHpPct = Math.max(0, (foeHp / foe.hp_max) * 100);
  const heroGhost = useGhostHp(heroHp, hero.hp_max);
  const foeGhost = useGhostHp(foeHp, foe.hp_max);

  function handleImpact(ev: ImpactEvent) {
    if (ev.roundIndex === undefined || ev.roundIndex < 0 || ev.roundIndex >= rounds.length) return; // финалният удар — вече отразено от последния рунд
    const round = rounds[ev.roundIndex];
    const attackerIsHero = round.attacker === 'hero';
    const targetSide: 'hero' | 'foe' = attackerIsHero ? 'foe' : 'hero';
    const targetMax = attackerIsHero ? foe.hp_max : hero.hp_max;
    const { text, kind, scale } = popFor(round, targetMax);
    setPops((arr) => [...arr.slice(-3), { id: ++popId.current, side: targetSide, text, kind, scale }]);
    // HP пада В КАДЪРА на удара — сървърът вече дава крайните стойности за този рунд.
    setHeroHp(round.heroHp);
    setFoeHp(round.foeHp);
    setLogVisible((arr) => [...arr, round]);
    if (kind === 'crit' && stageRef.current) {
      stageRef.current.classList.remove('crit-zoom');
      void stageRef.current.offsetWidth;
      stageRef.current.classList.add('crit-zoom');
      setTimeout(() => stageRef.current?.classList.remove('crit-zoom'), 360);
    }
  }

  function handleEnd() {
    // Предпазна мрежа: "прескочи" скача направо на финала (jump=true в boy) и events.step()
    // нарочно НЕ презарежда пропуснатите roundmark-и на jump кадър (иначе звук/искри от целия
    // бой биха гръмнали наведнъж) — HP лентите иначе биха останали заседнали на последния
    // видян рунд. При край винаги показвай крайните стойности от последния рунд.
    if (rounds.length > 0) {
      const last = rounds[rounds.length - 1];
      setHeroHp(last.heroHp);
      setFoeHp(last.foeHp);
    }
    setDone(true);
    onDone?.();
  }

  function setSpeed(label: '0.5' | '1' | '2') {
    setSpeedLabel(label);
    engineRef.current?.setSpeed(label === '0.5' ? 0.5 : label === '2' ? 2 : 1);
  }

  const progress = logVisible.length === 0 ? 0 : Math.min(100, Math.round((logVisible.length / Math.max(1, rounds.length)) * 100));

  return (
    <div className="combat-stage" data-region={region} ref={stageRef}>
      <BoyDuelStage
        rounds={rounds}
        victory={victory}
        loop={false}
        embedded
        onImpact={handleImpact}
        onEnd={handleEnd}
      />

      {showIntro && (
        <div className="intro-screen">
          <div className="title">{introTitle || `${hero.name}  vs  ${foe.name}`}</div>
        </div>
      )}

      {/* Ъглови HP ленти (заменят старите плаващи над 3D глави карти — boy не изнася
          3D→екран проекция; фиксираните ъгли остават четими и на 402×874). */}
      <div className="duel-hud duel-hud-hero">
        <div className="duel-hud-name">{hero.name}</div>
        <div className="hp-bar">
          <div className="hp-bar-ghost" style={{ width: `${Math.max(heroGhost, heroHpPct)}%` }} />
          <div className="hp-bar-fill" style={{ width: `${heroHpPct}%` }} />
          <div className="hp-bar-label">{heroHp} / {hero.hp_max}</div>
        </div>
        <div className="duel-hud-pops">
          {pops.filter((p) => p.side === 'hero').map((p) => (
            <div key={p.id} className={`dmg-pop ${p.kind}`} style={p.scale ? { fontSize: `${p.scale}px` } : undefined}>{p.text}</div>
          ))}
        </div>
      </div>
      <div className="duel-hud duel-hud-foe">
        <div className="duel-hud-name">{foe.name}</div>
        <div className="hp-bar">
          <div className="hp-bar-ghost" style={{ width: `${Math.max(foeGhost, foeHpPct)}%` }} />
          <div className="hp-bar-fill" style={{ width: `${foeHpPct}%` }} />
          <div className="hp-bar-label">{foeHp} / {foe.hp_max}</div>
        </div>
        <div className="duel-hud-pops">
          {pops.filter((p) => p.side === 'foe').map((p) => (
            <div key={p.id} className={`dmg-pop ${p.kind}`} style={p.scale ? { fontSize: `${p.scale}px` } : undefined}>{p.text}</div>
          ))}
        </div>
      </div>

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
          {/* Контролите са долу-ляво (не горе-дясно) — foe-hud заема горе-дясно и бутоните
              покриваха името/HP на противника на 402×874 (реален бъг, докладван при преглед). */}
          <div className="duel-controls">
            <button className={`btn btn-sm${speedLabel === '0.5' ? ' btn-primary' : ''}`} onClick={() => setSpeed('0.5')} title="Slow">½×</button>
            <button className={`btn btn-sm${speedLabel === '1' ? ' btn-primary' : ''}`} onClick={() => setSpeed('1')} title="Normal">1×</button>
            <button className={`btn btn-sm${speedLabel === '2' ? ' btn-primary' : ''}`} onClick={() => setSpeed('2')} title="Fast">2×</button>
            <button className="btn btn-sm" onClick={() => engineRef.current?.skip()} title="Skip ahead">≫</button>
          </div>
        </>
      )}

      {done && victory && <CombatConfetti />}

      {done && victory && reward?.itemDrop && (
        <LootDropOverlay item={reward.itemDrop} />
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

function CombatConfetti(): React.ReactElement {
  const bits = useMemo(() => {
    const colors = ['#f5d28a', '#d6a13d', '#ffe88a', '#6ad8a4', '#e85a4f', '#c294ff', '#7eb6ff'];
    return Array.from({ length: 36 }, (_, i) => {
      const angle = (i / 36) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 160 + Math.random() * 320;
      return {
        tx: Math.cos(angle) * dist,
        ty: Math.sin(angle) * dist - 80,
        rot: (Math.random() - 0.5) * 720,
        color: colors[Math.floor(Math.random() * colors.length)],
        delay: Math.random() * 0.3,
      };
    });
  }, []);
  return (
    <div className="combat-confetti">
      {bits.map((b, i) => (
        <div
          key={i}
          className="confetti-bit"
          style={{
            ['--tx' as any]: `${b.tx}px`,
            ['--ty' as any]: `${b.ty}px`,
            ['--rot' as any]: `${b.rot}deg`,
            ['--bit-color' as any]: b.color,
            animationDelay: `${b.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
