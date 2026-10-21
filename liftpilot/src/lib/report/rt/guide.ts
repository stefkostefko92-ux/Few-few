// The guide rails' sections of the relazione tecnica di modifica (RT plan §4.5, §4.6, §5.1): the car's and the
// counterweight's rails to UNI EN 81-50 5.10 in the shared sub-blocks (sezione.ts), with the checks' own notes (computed
// with options that differ from sheet 1, sliding shoes, a long travel) and, on the room path, the software's assumptions
// where the engineer gave no datum (the steel's Rm, its elongation, the car centred on the rails' axis) — printed, never
// silent. Pure.
import { KR } from '../../rt/norme';
import type { SezioneRt } from '../../rt/types';
import type { ReportBlock } from '../model';
import type { Ctx } from './contesto';
import { sezioneBlocks } from './sezione';
import { DOC, elenco, fill } from './testi';

const G = DOC.guide;

/** The assumptions of the room path's rails check where the data are not given. */
function ipotesi(x: Ctx, cw: boolean): ReportBlock[] {
  if (x.base.path !== 'locale') return [];
  const c = x.r.inputs.componenti, g = cw ? c?.guideContrappeso : c?.guideCabina, car = c?.guideCabina;
  const list = [
    ...(g?.Rm === undefined ? [fill(G.rm, { rm: KR.railRmMin })] : []),
    ...(g?.allungamento === undefined ? [G.allungamento] : []),
    ...(!cw && car?.arcata !== 'zaino' && car?.xS === undefined && car?.yS === undefined ? [G.sospensione] : []),
  ];
  return list.length ? [{ t: 'p', style: 'note', text: fill(G.ipotesi, { ipotesi: elenco(list) }) }] : [];
}

export const guideCabinaBlocks = (x: Ctx, s: SezioneRt): ReportBlock[] => sezioneBlocks(x, s, { dopo: ipotesi(x, false) });

export const guideContrappesoBlocks = (x: Ctx, s: SezioneRt): ReportBlock[] => sezioneBlocks(x, s, { dopo: ipotesi(x, true) });
