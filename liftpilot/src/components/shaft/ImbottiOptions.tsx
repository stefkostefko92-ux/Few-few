'use client';

// The linings (imbotti) of the landing doors where a new door with a smaller clear opening goes into an old opening
// between the marbles: the side ones on the landing beside the portal and the top one over it, the same at every
// landing door. The distance between the marbles and the height under the top marble can be typed instead: the side
// linings share the first equally, the top one takes the second (src/shaft/imbotti.ts). The plan and section A-A show
// them with dimensions that can also be changed on the drawing. Round 52: each field with its «?»; a refinement most jobs
// never touch, marked `esperto` (hidden in «Semplice»).
import { useTranslations } from 'next-intl';
import { testoAiuto } from '@/lib/aiuto';
import AIUTO from '../../../messages/aiuto/progetto.json';
import { IMBOTTI_MAX } from '@/lib/shaft-input';
import { hasImbotti, imbottiOf, marbleHeight, marbleWidth, withImbotti, withMarbleHeight, withMarbleWidth, type ShaftInputs } from '@/shaft';
import Campo from './Campo';

interface Props {
  I: ShaftInputs;
  set(patch: Partial<ShaftInputs>): void;
}

const int = (s: string): number => Math.round(Number(s.replace(',', '.')));
const AIUTI = {
  left: testoAiuto(AIUTO, 'im_left'), right: testoAiuto(AIUTO, 'im_right'), top: testoAiuto(AIUTO, 'im_top'),
  marble: testoAiuto(AIUTO, 'im_marble'), height: testoAiuto(AIUTO, 'im_height'),
} as const;

export default function ImbottiOptions({ I, set }: Props) {
  const t = useTranslations('shaft'), m = imbottiOf(I), any = hasImbotti(I);
  // the linings of the inputs `next`, never below zero (an opening narrower than the new door is refused) nor longer
  // than the save accepts
  const put = (next: ShaftInputs): void => {
    const n = imbottiOf(next), ok = (x: number): boolean => x >= 0 && x <= IMBOTTI_MAX;
    if (ok(n.left) && ok(n.right) && ok(n.top)) set({ imbotti: next.imbotti });
  };
  const field = (key: 'left' | 'right' | 'top' | 'marble' | 'height', value: number, apply: (v: number) => ShaftInputs) => (
    <Campo key={key} id={`shaft-imbotti-${key}`} nome={`${t(`im_${key}`)} (mm)`} aiuto={AIUTI[key]}>
      <input id={`shaft-imbotti-${key}`} className="input num" type="number" inputMode="numeric" min={0} max={key === 'marble' || key === 'height' ? 4000 : IMBOTTI_MAX} step={5} value={value}
        onChange={(e) => { const v = int(e.target.value); if (Number.isFinite(v)) put(apply(v)); }} />
    </Campo>
  );
  return (
    <details className="head-options esperto" open={any || undefined}>
      <summary>{t('im_title')}</summary>
      <div className="form-grid">
        {field('left', m.left, (v) => withImbotti(I, { ...m, left: v }))}
        {field('right', m.right, (v) => withImbotti(I, { ...m, right: v }))}
        {field('top', m.top, (v) => withImbotti(I, { ...m, top: v }))}
        {field('marble', marbleWidth(I), (v) => withMarbleWidth(I, v))}
        {field('height', marbleHeight(I), (v) => withMarbleHeight(I, v))}
      </div>
      {any ? <button type="button" className="btn btn-sm" onClick={() => set({ imbotti: undefined })}>{t('im_reset')}</button> : null}
      <p className="note">{t('im_hint')}</p>
    </details>
  );
}
