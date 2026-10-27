'use client';

// The landing doors' own frame (telaio di piano) instead of the portal round the clear opening: on, it starts as the
// standard one (src/shaft/frame.ts) and its jambs, header and depth can be typed; the same at every landing door. The
// plan, section A-A and the 3D show it; its jambs and header can also be changed on the drawing. Round 52: each field
// with its «?»; a refinement most jobs never touch, marked `esperto` (hidden in «Semplice»).
import { useTranslations } from 'next-intl';
import { testoAiuto } from '@/lib/aiuto';
import AIUTO from '../../../messages/aiuto/progetto.json';
import { FRAME_MAX } from '@/lib/shaft-input';
import { FRAME_STD, KV, withFrame, type ShaftInputs } from '@/shaft';
import Campo, { ConAiuto } from './Campo';

interface Props {
  I: ShaftInputs;
  set(patch: Partial<ShaftInputs>): void;
}

const int = (s: string): number => Math.round(Number(s.replace(',', '.')));
const AIUTI = { jamb: testoAiuto(AIUTO, 'fr_jamb'), head: testoAiuto(AIUTO, 'fr_head'), depth: testoAiuto(AIUTO, 'fr_depth') } as const;

export default function FrameOptions({ I, set }: Props) {
  const t = useTranslations('shaft'), f = I.frame;
  const field = (key: 'jamb' | 'head' | 'depth', value: number) => (
    <Campo key={key} id={`shaft-frame-${key}`} nome={`${t(`fr_${key}`)} (mm)`} aiuto={AIUTI[key]}>
      <input id={`shaft-frame-${key}`} className="input num" type="number" inputMode="numeric" min={KV.frameMin} max={FRAME_MAX} step={5} value={value}
        onChange={(e) => {
          // what is typed on the way (1 of 150) stays in the field; the form's schema marks a size out of bounds
          const v = int(e.target.value);
          if (f && Number.isFinite(v) && v >= 0) set({ frame: withFrame(I, { ...f, [key]: v }).frame });
        }} />
    </Campo>
  );
  return (
    <details className="head-options esperto" open={f ? true : undefined}>
      <summary>{t('fr_title')}</summary>
      <ConAiuto aiuto={testoAiuto(AIUTO, 'fr_on')} nome={t('fr_on')}>
        <label className="check">
          <input type="checkbox" checked={Boolean(f)} onChange={(e) => set({ frame: e.target.checked ? FRAME_STD : undefined })} />
          <span>{t('fr_on')}</span>
        </label>
      </ConAiuto>
      {f ? <div className="form-grid">{field('jamb', f.jamb)}{field('head', f.head)}{field('depth', f.depth)}</div> : null}
      <p className="note">{t('fr_hint', { jamb: FRAME_STD.jamb, head: FRAME_STD.head, depth: FRAME_STD.depth })}</p>
    </details>
  );
}
