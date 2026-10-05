import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CombatActor, CombatRound } from '../lib/types';

// Мързеливо — самата CombatScene (и вътре в нея BoyDuelStage) тегли WebGL/
// three-подобен рендер само когато React реално я монтира. Нищо от това не
// се качва при отваряне на лендинга, само при клик на бутона по-долу (виж
// коментара на компонента).
const CombatScene = lazy(() => import('../combat/CombatScene'));

// Малка примерна хореография — същата идея като pages/CombatDemo.tsx (QA
// харнес за двигателя), но дублирана тук нарочно вместо импортирана: тази
// страница е публична/маркетингова, CombatDemo е dev/QA инструмент зад
// /demo/combat — да не ги свързваме, за да остане всяка обходима поотделно.
type Beat = [attacker: CombatRound['attacker'], action: CombatRound['action'], damage: number, text: string];
function script(beats: Beat[], heroMax: number, foeMax: number): CombatRound[] {
  let heroHp = heroMax;
  let foeHp = foeMax;
  return beats.map(([attacker, action, damage, text], i) => {
    if (attacker === 'hero') foeHp = Math.max(0, foeHp - damage);
    else heroHp = Math.max(0, heroHp - damage);
    return { index: i + 1, attacker, action, damage, heroHp, foeHp, text };
  });
}
const ROUNDS: CombatRound[] = script([
  ['hero', 'attack', 64, 'Aldric strikes.'],
  ['foe', 'block', 6, 'The Warden raises his guard.'],
  ['foe', 'attack', 38, 'A counter-blow lands.'],
  ['foe', 'dodge', 0, 'Aldric sidesteps.'],
  ['hero', 'crit', 118, 'A crushing crit!'],
  ['foe', 'miss', 0, 'The Warden overreaches.'],
  ['hero', 'attack', 72, 'Aldric presses on.'],
  ['hero', 'crit', 138, 'The final blow.'],
], 480, 392);
const HERO: CombatActor = { name: 'Ser Aldric', side: 'hero', level: 24, hp: 480, hp_max: 480, atk_min: 40, atk_max: 60, defense: 20, speed: 12, crit_chance: 0.25, dodge_chance: 0.1, sprite: 'warrior', class: 'warrior' };
const FOE: CombatActor = { name: 'The Black Warden', side: 'foe', level: 22, hp: 392, hp_max: 392, atk_min: 30, atk_max: 50, defense: 18, speed: 10, crit_chance: 0.2, dodge_chance: 0.08, sprite: 'warrior' };

/**
 * Живият двубой на лендинга — НАЙ-запомнящото се нещо в играта (новия боен
 * двигател, „Двубой в Рейвънхолд" език), вместо поредна снимка. Двигателят
 * (combat/engine/**) не се пипа тук — само се вгражда готовата CombatScene.
 *
 * Достъпност/производителност (виж motion-a11y):
 * - НИЩО тежко преди клик — постер + бутон винаги е първото, което се
 *   рендира; React.lazy отлага целия WebGL bundle до реалния import().
 * - IntersectionObserver само отключва бутона визуално (кара постера да се
 *   появи), не автостартира боя — auto-play на тежка 3D сцена без действие
 *   на потребителя би нарушило 2.2.2 (пауза/стоп) и е точно обратното на
 *   "nothing heavy before scroll".
 * - `prefers-reduced-motion` не спира нищо допълнително тук, защото боят
 *   стартира само по изричен клик (вече user-initiated, не auto-loop) —
 *   единственото по подразбиране е статичният постер.
 * - При изход от viewport по време на бой — спираме (unmount), CombatScene/
 *   BoyDuelStage вече прави чист dispose() в unmount ефекта си.
 */
export default function LandingDuel(): React.ReactElement {
  const { t } = useTranslation();
  const [inView, setInView] = useState(false);
  const [playing, setPlaying] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) { setInView(true); io.disconnect(); }
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section id="duel" className="section duel-section" ref={rootRef}>
      <div className="section-head-split" data-reveal>
        <h2 className="section-title">{t('landing.duelTitle')}</h2>
        <p className="section-lead">{t('landing.duelLead')}</p>
      </div>
      <div className="duel-embed" data-reveal>
        {playing ? (
          <Suspense fallback={<div className="duel-loading">{t('landing.setsShowcaseLoading')}</div>}>
            <CombatScene hero={HERO} foe={FOE} rounds={ROUNDS} victory reward={{ xp: 120, gold: 40 }} />
          </Suspense>
        ) : (
          <div className="duel-poster">
            <div className="duel-poster-glow" aria-hidden />
            <button type="button" className="btn btn-primary btn-hero duel-play" onClick={() => setPlaying(true)} disabled={!inView}>
              {t('landing.duelCta')}
            </button>
            <div className="duel-caption">{t('landing.duelCaption')}</div>
          </div>
        )}
      </div>
    </section>
  );
}
