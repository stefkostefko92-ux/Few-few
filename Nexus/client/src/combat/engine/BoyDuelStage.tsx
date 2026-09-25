import { useEffect, useRef } from 'react';
import type { CombatRound } from '../../lib/types';
import { BOY_MARKUP } from './boy/markup';
import { choreographyFromRounds } from './roundsToChoreo';
import './boy/boy-hud.css';

interface Props {
  /** Без rounds → фиксираната демо-хореография на boy (28.5s филм на Ser Aldric). */
  rounds?: CombatRound[];
  victory?: boolean;
  /** false спира на последния кадър, вместо да зацикля (реални битки). Демото зациклюва. */
  loop?: boolean;
  onEnd?: () => void;
}

/**
 * Фасада на новия боен двигател (порт на boy/, „Двубой в Рейвънхолд“). 4a.1 монтираше boy през
 * страничен ефект на import('./boy/src/main.js'); 4a.2 вика bootDuel() явно (main.js вече
 * експортва boot API — виж main.d.ts) с генерирана от `rounds` хореография (choreo-gen.js) и
 * пази истинско dispose() при unmount — двигателят вече поддържа повторно монтиране.
 */
export default function BoyDuelStage({ rounds, victory = true, loop, onEnd }: Props): React.ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let disposed = false;
    let handle: { dispose(): void } | undefined;
    root.innerHTML = BOY_MARKUP;
    const canvas = root.querySelector<HTMLCanvasElement>('#view');
    if (!canvas) return;
    // Пречи на main.js да се самостартира срещу document.getElementById('view') — ние сме
    // отговорни за boot-ването (виж guard-а в main.js).
    (window as unknown as { __boyNoAutoboot?: boolean }).__boyNoAutoboot = true;
    const choreography = rounds && rounds.length > 0 ? choreographyFromRounds(rounds, victory) : undefined;
    // Литерален relative specifier (не динамична променлива) — нужно е Vite/Rollup да го
    // открие статично и да го изнесе в собствен lazy chunk.
    import('./boy/src/main.js').then((mod) => mod.bootDuel(canvas, { choreography, loop, onEnd })).then((h) => {
      if (disposed) { h.dispose(); return; }
      handle = h;
    });
    return () => {
      disposed = true;
      handle?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounds, victory, loop]);

  return <div className="boy-duel-root" ref={rootRef} />;
}
