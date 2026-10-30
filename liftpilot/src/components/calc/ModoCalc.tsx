'use client';

// The calculator's mode (round 52): the workspace's «Semplice»/«Esperto» (components/shell/Modalita.tsx), kept with the
// user, so that the form and a saved calculation's results open as the top bar says; outside the workspace (the
// standalone artifact) a mode of their own. The switch carries the «?» of what the simple mode hides; its explanation
// opens from the row's right edge (calc.css .calc-top), wherever the switch wraps.
import { useState } from 'react';
import { testoAiuto } from '@/lib/aiuto';
import type { Pres } from '@/lib/present/tr';
import AIUTO from '../../../messages/aiuto/calcolo.json';
import { useModalita } from '../shell/Modalita';
import { ConAiuto } from '../shaft/Campo';

export type Modo = 'simple' | 'expert';

/** The mode now and the way to change it: the workspace's, else this form's own. */
export function useModo(): [Modo, (m: Modo) => void] {
  const globale = useModalita();
  const [proprio, setProprio] = useState<Modo>('simple');
  if (!globale) return [proprio, setProprio];
  return [globale.modalita === 'esperto' ? 'expert' : 'simple', (m) => globale.set(m === 'expert' ? 'esperto' : 'semplice')];
}

/** The two radio buttons with the «?»; `id`: the prefix of their ids (`mode` in the form, `v` on a saved calculation). */
export function ModoSwitch({ P, mode, setMode, id }: { P: Pres; mode: Modo; setMode(m: Modo): void; id: string }) {
  const { t } = P;
  return (
    <div className="calc-mode">
      <div className="seg" role="radiogroup" aria-label={t('aria_mode')}>
        <input type="radio" name="mode" id={`${id}-simple`} checked={mode === 'simple'} onChange={() => setMode('simple')} />
        <label htmlFor={`${id}-simple`}>{t('mode_simple')}</label>
        <input type="radio" name="mode" id={`${id}-expert`} checked={mode === 'expert'} onChange={() => setMode('expert')} />
        <label htmlFor={`${id}-expert`}>{t('mode_expert')}</label>
      </div>
      <ConAiuto aiuto={testoAiuto(AIUTO, 'modalita')} nome={t('aria_mode')} />
    </div>
  );
}
