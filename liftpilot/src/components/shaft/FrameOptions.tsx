'use client';

// The landing doors' own frame (telaio di piano) instead of the portal round the clear opening: on, it starts as the
// standard one (src/shaft/frame.ts) and its jambs, header and depth can be typed; the same at every landing door. The
// plan, section A-A and the 3D show it; its jambs and header can also be changed on the drawing.
import { useTranslations } from 'next-intl';
import { FRAME_MAX } from '@/lib/shaft-input';
import { FRAME_STD, KV, withFrame, type ShaftInputs } from '@/shaft';

interface Props {
  I: ShaftInputs;
  set(patch: Partial<ShaftInputs>): void;
}

const int = (s: string): number => Math.round(Number(s.replace(',', '.')));

export default function FrameOptions({ I, set }: Props) {
  const t = useTranslations('shaft'), f = I.frame;
  const field = (key: 'jamb' | 'head' | 'depth', value: number) => (
    <label className="field" key={key}>
      <span>{t(`fr_${key}`)} (mm)</span>
      <input className="input num" type="number" inputMode="numeric" min={KV.frameMin} max={FRAME_MAX} step={5} value={value}
        onChange={(e) => {
          // what is typed on the way (1 of 150) stays in the field; the form's schema marks a size out of bounds
          const v = int(e.target.value);
          if (f && Number.isFinite(v) && v >= 0) set({ frame: withFrame(I, { ...f, [key]: v }).frame });
        }} />
    </label>
  );
  return (
    <details className="head-options" open={f ? true : undefined}>
      <summary>{t('fr_title')}</summary>
      <label className="check">
        <input type="checkbox" checked={Boolean(f)} onChange={(e) => set({ frame: e.target.checked ? FRAME_STD : undefined })} />
        <span>{t('fr_on')}</span>
      </label>
      {f ? <div className="form-grid">{field('jamb', f.jamb)}{field('head', f.head)}{field('depth', f.depth)}</div> : null}
      <p className="note">{t('fr_hint', { jamb: FRAME_STD.jamb, head: FRAME_STD.head, depth: FRAME_STD.depth })}</p>
    </details>
  );
}
