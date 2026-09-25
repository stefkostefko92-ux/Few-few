import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { CombatRound } from '../../lib/types';
import { BOY_MARKUP } from './boy/markup';
import { choreographyFromRounds } from './roundsToChoreo';
import type { BootHandle } from './boy/src/main';
import './boy/boy-hud.css';

export interface ImpactEvent {
  roundIndex?: number;
  by?: 'A' | 'B';
  against?: 'A' | 'B';
}

interface Props {
  /** Без rounds → фиксираната демо-хореография на boy (28.5s филм на Ser Aldric). */
  rounds?: CombatRound[];
  victory?: boolean;
  /** false спира на последния кадър, вместо да зацикля (реални битки). Демото зациклюва. */
  loop?: boolean;
  onEnd?: () => void;
  /** ТОЧНО в кадъра на всеки удар/roundmark (choreo-gen.js) — число на щетата, HP, лог. */
  onImpact?: (ev: ImpactEvent) => void;
  /** true в CombatScene.tsx — крие вградения chrome на boy (заглавие/лента/endcard/controls). */
  embedded?: boolean;
}

export interface BoyDuelHandle {
  togglePlay(): void;
  setSpeed(v: number): void;
  toggleSound(): void;
  skip(): void;
}

/**
 * Фасада на новия боен двигател (порт на boy/, „Двубой в Рейвънхолд“). Вика bootDuel() явно
 * (main.js експортва boot API — виж main.d.ts) с генерирана от `rounds` хореография
 * (choreo-gen.js), истинско dispose() при unmount и forward-нат handle за собствените
 * ½×/1×/2×/прескочи контроли на CombatScene.tsx (вграденият chrome на boy е скрит — виж
 * boy-hud.css `.embedded`).
 */
const BoyDuelStage = forwardRef<BoyDuelHandle, Props>(({ rounds, victory = true, loop, onEnd, onImpact, embedded }, ref) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const bootRef = useRef<BootHandle | null>(null);

  useImperativeHandle(ref, () => ({
    togglePlay: () => bootRef.current?.togglePlay?.(),
    setSpeed: (v: number) => bootRef.current?.setSpeed?.(v),
    toggleSound: () => bootRef.current?.toggleSound?.(),
    skip: () => bootRef.current?.skip?.(),
  }), []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // React 18 StrictMode (dev) монтира→размонтира→монтира СИНХРОННО. Без abort-сигнал двете
    // копия щяха да си оспорват GPU/CPU едновременно под софтуерен рендер и никое да не
    // завърши (buildWorld()/compileAsync() са скъпи) — signal кара ПЪРВОТО (изхвърляно) копие
    // да излезе РАНО, преди тежката работа, вместо да я довърши и после да я изхвърли.
    const controller = new AbortController();
    root.innerHTML = BOY_MARKUP;
    const canvas = root.querySelector<HTMLCanvasElement>('#view');
    if (!canvas) return;
    // Пречи на main.js да се самостартира срещу document.getElementById('view') — ние сме
    // отговорни за boot-ването (виж guard-а в main.js).
    (window as unknown as { __boyNoAutoboot?: boolean }).__boyNoAutoboot = true;
    const choreography = rounds && rounds.length > 0 ? choreographyFromRounds(rounds, victory) : undefined;
    // Литерален relative specifier (не динамична променлива) — нужно е Vite/Rollup да го
    // открие статично и да го изнесе в собствен lazy chunk.
    import('./boy/src/main.js').then((mod) => mod.bootDuel(canvas, { choreography, loop, onEnd, onImpact, signal: controller.signal })).then((h) => {
      if (controller.signal.aborted) { h.dispose(); return; }
      bootRef.current = h;
    });
    return () => {
      controller.abort();
      bootRef.current?.dispose();
      bootRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounds, victory, loop]);

  return <div className={`boy-duel-root${embedded ? ' embedded' : ''}`} ref={rootRef} />;
});
BoyDuelStage.displayName = 'BoyDuelStage';
export default BoyDuelStage;
