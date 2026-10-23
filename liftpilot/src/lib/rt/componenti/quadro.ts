// The controller and the machine room in the relazione tecnica di modifica (RT plan §4.5): with a new controller the
// voltage of its control and safety circuits (UNI EN 81-20:2020, 5.10.1.3.2) and, under UNI 10411-1 with the existing
// electrical part kept as compatible and marked, the voltage of the existing landing locks' contacts (11.1.2) — data of the
// controller with their source; the room's checks round the panel (m_panel, m_quadro, m_route) and the rest of the
// machine room's survey or design (locale). Registry quadro.tensioni. Pure.
import type { ShaftCheck, ShaftCheckId } from '@/shaft/types';
import { KR } from '../norme';
import type { RtCheck } from '../types';
import { ambito, daVano, dato, fonteDi, mancante, mancantiDi, nuova, rtCheck, type RtCtx } from './comune';
import type { Esito, EsitoSezione } from './esito';

/** rt_ctrl_voltage: the control and safety circuits at most KR.ctrlVoltageMax [V]. */
export const tensioneComando = (V: number): Esito => ({ status: V <= KR.ctrlVoltageMax + 1e-9 ? 'ok' : 'fail', value: V, limit: KR.ctrlVoltageMax });

/** rt_lock_voltage: the existing landing locks' contacts at most KR.lockContactAc (a.c.) or KR.lockContactDc (d.c.) [V]. */
export function tensioneContatti(V: number, corrente: 'ca' | 'cc'): Esito {
  const limit = corrente === 'ca' ? KR.lockContactAc : KR.lockContactDc;
  return { status: V <= limit + 1e-9 ? 'ok' : 'fail', value: V, limit };
}

/** The checks round the panel (quadro) and the rest of the machine room's (locale). */
export const ID_QUADRO: readonly ShaftCheckId[] = ['m_panel', 'm_quadro', 'm_route'];

/** The checks of the machine room the base has: the survey's on the room path, the design's m_* on the shaft path. */
export const controlliLocale = (x: Pick<RtCtx, 'base'>): readonly ShaftCheck[] =>
  x.base.room?.checks ?? (x.base.lift?.checks ?? []).filter((c) => c.id.startsWith('m_'));

export function quadro(x: RtCtx): EsitoSezione {
  const q = x.inputs.componenti?.quadro, nuovo = nuova(x, 'controller'), src = fonteDi(q?.fonte, x.allegati), checks: RtCheck[] = [];
  const o = { sezione: 'quadro' as const, ambito: ambito(nuovo), upper: true };
  checks.push(...controlliLocale(x).filter((c) => ID_QUADRO.includes(c.id)).map((c) => daVano(x, c, 'quadro')));
  // the control circuits: a requirement with a new controller; of the existing one printed only when given
  if (q?.tensioneComando !== undefined) {
    const e = tensioneComando(q.tensioneComando);
    checks.push(rtCheck(x, 'rt_ctrl_voltage', e.status === 'ok', e.value, e.limit, 0, 'V', o));
  } else if (nuovo) checks.push(mancante(x, 'rt_ctrl_voltage', ['componenti.quadro.tensioneComando'], KR.ctrlVoltageMax, 0, 'V', o));
  // the existing locks' contacts: with a new controller on the existing electrical part kept as compatible and marked —
  // a rule of UNI 10411-1 (11.1.2) only: under -11 its 11.1.2 is the list of exemptions, the check is not printed
  const uno = x.norma === '10411-1', contatti = uno && nuovo && q?.impiantoElettrico === 'compatibile_contrassegnato';
  if (uno && q?.tensioneContattiSerrature !== undefined && q.correnteContatti) {
    const e = tensioneContatti(q.tensioneContattiSerrature, q.correnteContatti);
    checks.push(rtCheck(x, 'rt_lock_voltage', e.status === 'ok', e.value, e.limit, 0, 'V', { ...o, ambito: ambito(contatti), caso: q.correnteContatti }));
  } else if (contatti && q) {
    const campi = [...(q.tensioneContattiSerrature === undefined ? ['componenti.quadro.tensioneContattiSerrature'] : []), ...(q.correnteContatti ? [] : ['componenti.quadro.correnteContatti'])];
    checks.push(mancante(x, 'rt_lock_voltage', campi, null, 0, 'V', { ...o, ambito: 'richiesta' }));
  }
  const stato = nuovo ? 'nuovo' : 'esistente';
  const dati = [
    dato('manovra', x.plant.control, '', 0, stato, 'impianto'),
    dato('costruttore', q?.costruttore, '', 0, stato, src), dato('modello', q?.modello, '', 0, stato, src),
    dato('tensioneComando', q?.tensioneComando, 'V', 0, stato, src), dato('correnteComando', q?.correnteComando, '', 0, stato, src),
    ...(uno ? [dato('tensioneContattiSerrature', q?.tensioneContattiSerrature, 'V', 0, 'esistente', src), dato('correnteContatti', q?.correnteContatti, '', 0, 'esistente', src),
      dato('impiantoElettrico', q?.impiantoElettrico, '', 0, stato, src)] : []),
  ].filter((d) => d.valore !== null);
  const altri = uno && nuovo && !q?.impiantoElettrico ? ['componenti.quadro.impiantoElettrico'] : [];
  return { componente: { sezione: 'quadro', stato, dati }, checks, punti: [], mancanti: mancantiDi('quadro', checks, altri) };
}

/** The machine room: its survey's (room path) or its design's checks (shaft path), but those round the panel. */
export function locale(x: RtCtx): EsitoSezione {
  const checks = controlliLocale(x).filter((c) => !ID_QUADRO.includes(c.id)).map((c) => daVano(x, c, 'locale'));
  const stato = nuova(x, 'room') ? 'nuovo' : nuova(x, 'machine') ? 'misto' : 'esistente';
  return { componente: { sezione: 'locale', stato, dati: [] }, checks, punti: [], mancanti: [] };
}
