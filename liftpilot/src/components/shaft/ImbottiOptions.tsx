'use client';

// The linings (imbotti) of the landing doors where a new door with a smaller clear opening goes into an old opening
// between the marbles: the side ones on the landing beside the portal and the top one over it, the same at every
// landing door. The distance between the marbles and the height under the top marble can be typed instead: the side
// linings share the first equally, the top one takes the second (src/shaft/imbotti.ts). The plan and section A-A show
// them with dimensions that can also be changed on the drawing.
import { useTranslations } from 'next-intl';
import { hasImbotti, imbottiOf, marbleHeight, marbleWidth, withImbotti, withMarbleHeight, withMarbleWidth, type ShaftInputs } from '@/shaft';

interface Props {
  I: ShaftInputs;
  set(patch: Partial<ShaftInputs>): void;
}

const int = (s: string): number => Math.round(Number(s.replace(',', '.')));

export default function ImbottiOptions({ I, set }: Props) {
  const t = useTranslations('shaft'), m = imbottiOf(I), any = hasImbotti(I);
  // the linings of the inputs `next`, never below zero (an opening narrower than the new door is refused)
  const put = (next: ShaftInputs): void => {
    const n = imbottiOf(next);
    if (n.left >= 0 && n.right >= 0 && n.top >= 0) set({ imbotti: next.imbotti });
  };
  const field = (key: 'left' | 'right' | 'top' | 'marble' | 'height', value: number, apply: (v: number) => ShaftInputs) => (
    <label className="field" key={key}>
      <span>{t(`im_${key}`)} (mm)</span>
      <input className="input num" type="number" inputMode="numeric" min={0} max={key === 'marble' || key === 'height' ? 4000 : 1500} step={5} value={value}
        onChange={(e) => { const v = int(e.target.value); if (Number.isFinite(v)) put(apply(v)); }} />
    </label>
  );
  return (
    <details className="head-options" open={any || undefined}>
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
