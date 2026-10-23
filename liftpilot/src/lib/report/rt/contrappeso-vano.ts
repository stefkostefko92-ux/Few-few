// The counterweight's and the shaft's sections of the relazione tecnica di modifica (RT plan §4.5, §5.1): the
// counterweight's masses and the design's checks of its place (points on site on the room path); on the shaft path the
// shaft, pit and headroom with the plan at the main floor, as the relazione di calcolo draws it (shaft.ts planBlock).
// Pure.
import type { SezioneRt } from '../../rt/types';
import type { ReportBlock } from '../model';
import { planBlock } from '../shaft';
import type { Ctx } from './contesto';
import { sezioneBlocks } from './sezione';
import { DOC } from './testi';

export const contrappesoBlocks = (x: Ctx, s: SezioneRt): ReportBlock[] => sezioneBlocks(x, s);

export function vanoBlocks(x: Ctx, s: SezioneRt): ReportBlock[] {
  const L = x.base.lift?.layout;
  return sezioneBlocks(x, s, { prima: L ? [{ t: 'h3', text: DOC.vano.pianta }, planBlock(L)] : [] });
}
