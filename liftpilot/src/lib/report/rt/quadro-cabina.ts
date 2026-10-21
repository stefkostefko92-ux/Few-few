// The controller's and the car's sections of the relazione tecnica di modifica (RT plan §4.5, §5.1): the shared
// sub-blocks (sezione.ts) — the controller's voltages and the machine room's checks round the panel, the car's area and
// loads with the existing sling under the new loads. Pure.
import type { SezioneRt } from '../../rt/types';
import type { ReportBlock } from '../model';
import type { Ctx } from './contesto';
import { sezioneBlocks } from './sezione';

export const quadroBlocks = (x: Ctx, s: SezioneRt): ReportBlock[] => sezioneBlocks(x, s);

export const cabinaBlocks = (x: Ctx, s: SezioneRt): ReportBlock[] => sezioneBlocks(x, s);
