// The governor's and the doors' sections of the relazione tecnica di modifica (RT plan §4.5, §5.1): the safety gear's
// type, the governor's tripping speed, force and rope, its sheave; the new landing doors' fire class and height and the
// design's doors — in the shared sub-blocks (sezione.ts). Pure.
import type { SezioneRt } from '../../rt/types';
import type { ReportBlock } from '../model';
import type { Ctx } from './contesto';
import { sezioneBlocks } from './sezione';

export const limitatoreBlocks = (x: Ctx, s: SezioneRt): ReportBlock[] => sezioneBlocks(x, s);

export const porteBlocks = (x: Ctx, s: SezioneRt): ReportBlock[] => sezioneBlocks(x, s);
