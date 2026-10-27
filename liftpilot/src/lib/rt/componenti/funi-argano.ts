// The ropes and the machine in the relazione tecnica di modifica (RT plan §4.5): the calculation's checks as the
// relazione di calcolo prints them — traction, ropes and grooves in «Funi di trazione» with D.1 and D.2 when the ratio
// of the loads changes (rapporto.ts; inventory gap 3 closed in the RT), drive, brake, shaft and rescue in «Argano» —,
// each with its clauses and its scope by the base's test. Pure.
import type { Check } from '@/calc/types';
import { ropesKept } from '../../lift/collaudo';
import { verificheModifica } from '../../lift/funi-modello';
import { senzaSostituite } from '../../lift/sostituite';
import { calcMachine } from '../../order/machine';
import { daCalcolo, daVano, dato, mancantiDi, nuova, type RtCtx } from './comune';
import type { EsitoSezione } from './esito';

/** The calculation's checks of the ropes: traction, ropes, grooves, compensation. */
export const diFuni = (c: Pick<Check, 'id'>): boolean => c.id.startsWith('tr_') || c.id.startsWith('r_') || c.id.startsWith('g_') || c.id === 'v_comp';

export function funi(x: RtCtx): EsitoSezione {
  const { res } = x.base.analysis, { I, N } = x.base.analysis.ctx;
  // D.1 and D.2 of a changed ratio and the rope sheet's checks (round 52), S_f out where z of the sheet stands in for it
  const extra = verificheModifica(x.base.collaudo, x.base.values);
  const checks = [...senzaSostituite(res.checks.filter(diFuni), extra).map((c) => daCalcolo(x, c, 'funi')), ...extra.map((c) => daVano(x, c, 'funi'))];
  const stato = ropesKept(x.base.collaudo, x.base.values) ? 'esistente' : 'nuovo';
  const dati = [dato('numeroFuni', N.n, '', 0, stato, 'calcolo'), dato('diametroFuni', N.d, 'mm', 1, stato, 'calcolo'), dato('tiro', I.r, '', 0, stato, 'calcolo')];
  return { componente: { sezione: 'funi', stato, dati }, checks, punti: [], mancanti: mancantiDi('funi', checks) };
}

export function argano(x: RtCtx): EsitoSezione {
  const { res } = x.base.analysis, { N } = x.base.analysis.ctx, nuovo = nuova(x, 'machine');
  const checks = res.checks.filter((c) => !diFuni(c)).map((c) => daCalcolo(x, c, 'argano'));
  const m = calcMachine(x.base.values), stato = nuovo ? 'nuovo' : 'esistente';
  const dati = [
    dato('macchina', m ? `${m.brand} ${m.model}` : null, '', 0, stato, m ? 'catalogo' : 'calcolo'),
    dato('pulegga', N.D, 'mm', 0, stato, 'calcolo'), dato('rapporto', N.i, '', 2, stato, 'calcolo'), dato('potenza', N.Pn, 'kW', 1, stato, 'calcolo'),
  ].filter((d) => d.valore !== null);
  return { componente: { sezione: 'argano', stato, dati }, checks, punti: [], mancanti: mancantiDi('argano', checks) };
}
