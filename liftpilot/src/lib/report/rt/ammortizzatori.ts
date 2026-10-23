// The buffers' section of the relazione tecnica di modifica (RT plan §4.5, §5.1): one section with the car's and the
// counterweight's sides — type for the speed, strokes, the springs' force at full compression on the static load, a
// certified buffer's masses and impact speed — in the shared sub-blocks (sezione.ts). Pure.
import type { SezioneRt } from '../../rt/types';
import type { ReportBlock } from '../model';
import type { Ctx } from './contesto';
import { sezioneBlocks } from './sezione';

export const ammortizzatoriBlocks = (x: Ctx, s: SezioneRt): ReportBlock[] => sezioneBlocks(x, s);
