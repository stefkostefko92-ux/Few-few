// The ropes' and the machine's sections of the relazione tecnica di modifica (RT plan §4.5, §5.1): the calculation's
// checks as the relazione di calcolo prints them — traction, ropes and grooves with, when the ratio of the loads changes
// under UNI 10411-1, the tables of D.1 and D.2 (cases.ts d1Blocks); drive, brake, shaft and rescue with the existing
// machine beside the new one (or the existing one alone, when it stays) — in the shared sub-blocks (sezione.ts). Pure.
import { macchinaResta } from '../../lift/intervento';
import type { SezioneRt } from '../../rt/types';
import { machineText } from '../../tavole/machine-name';
import { d1Blocks } from '../cases';
import type { ReportBlock } from '../model';
import type { Ctx } from './contesto';
import { sezioneBlocks } from './sezione';
import { DOC, fill } from './testi';

export function funiBlocks(x: Ctx, s: SezioneRt): ReportBlock[] {
  const d1 = x.d.checks.some((c) => c.id === 'tr_d1') ? d1Blocks(x.P, x.C, x.base.values) : [];
  return sezioneBlocks(x, s, { dopo: d1 });
}

/** The machine's name: the catalogue's model the calculation is (or the plant data's own name), else none. */
function nomeArgano(x: Ctx): string | null {
  const room = x.base.room;
  if (room) return machineText(x.r.plant, room.derived.made) || null;
  const v = x.d.componenti.find((c) => c.sezione === 'argano')?.dati.find((d) => d.voce === 'macchina')?.valore;
  return typeof v === 'string' ? v : null;
}

/** The existing machine beside the new one, as the calculation has them (the machine kept: the one that stays). */
function confronto(x: Ctx): ReportBlock[] {
  const A = DOC.argano, { ctx, res, old } = x.base.analysis, { N } = ctx, { fmt } = x, nome = nomeArgano(x);
  const massa = (m: number): string => (m > 0 ? `${fmt(m, 0)} kg` : A.nonInserita);
  const funi = (k: string): string => (k === x.P.t('g_ropes') || k === x.P.t('oldRopes') ? A.funi : k);
  if (macchinaResta(x.d.tipo, x.C)) {
    return [{ t: 'h3', text: A.titolo }, { t: 'grid', head: A.headResta, widths: [0.35, 0.65], align: ['l', 'l'],
      rows: [[A.costruttore, nome ?? '—'], [A.massa, massa(N.mass)], ...x.X.machineRows(N, res, true).map(([k, v]) => [funi(k), v])] }];
  }
  const rowsN = x.X.machineRows(N, res), rowsO = old ? x.X.machineRows(ctx.O, old, true) : null;
  return [
    { t: 'h3', text: A.titolo },
    { t: 'grid', head: A.head, widths: [0.3, 0.35, 0.35], align: ['l', 'l', 'l'], rows: [
      [A.costruttore, '—', nome ?? A.nonCatalogo], [A.massa, ctx.compare ? massa(ctx.O.mass) : '—', massa(N.mass)],
      ...rowsN.map(([k, v], i) => [funi(k), rowsO?.[i]?.[1] ?? '—', v]),
    ] },
    ...(ctx.compare ? [] : [{ t: 'p', style: 'note', text: A.senzaEsistente } as ReportBlock]),
    { t: 'p', style: 'note', text: fill(A.conferma, { sezione: x.titolo('allegati') }) },
  ];
}

export const arganoBlocks = (x: Ctx, s: SezioneRt): ReportBlock[] => sezioneBlocks(x, s, { prima: confronto(x) });
