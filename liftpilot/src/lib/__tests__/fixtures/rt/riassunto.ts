// What the golden of the relazione tecnica di modifica pins of each fixture (rt-golden.test.ts, scripts/rt-golden-export.ts):
// the SHA-256 of the canonical results (everything the document prints of the derivation) and a readable summary —
// verdict, regime, rules, sections with their reasons, each check with its status, scope, value and limits, documents,
// structures, missing data, the «before and after» rows — so that a regeneration's diff says what moved. Pure.
import { createHash } from 'node:crypto';
import { canon } from '@/calc/snapshot';
import { rtResults } from '../../../rt/snapshot';
import type { RtDerived } from '../../../rt/types';

const n = (x: number | null | undefined): string => (x === null || x === undefined ? '—' : String(Number(x.toPrecision(7))));

export const resultsSha = (d: RtDerived): string => createHash('sha256').update(JSON.stringify(canon(rtResults(d)))).digest('hex');

export function riassunto(d: RtDerived) {
  return {
    verdict: `${d.verdict} ${d.failCount}/${d.warnCount}`, regime: `${d.regime.legge ?? '—'} ${d.regime.origine ?? '—'}${d.regime.emettibile ? '' : ' !'}`,
    regole: d.regole.map((r) => `${r.regola}:${r.esito}:${r.casi.join('+')}`),
    sezioni: d.sezioni.map((s) => `${s.key}${s.automatica ? '' : '*'}:${s.motivi.map((m) => m.chiave).join('+')}`),
    checks: d.checks.map((c) => `${c.sezione}/${c.id}${c.caso ? `(${c.caso})` : ''}:${c.status}:${c.ambito}:${n(c.value)}:${c.limitMin !== undefined ? `${n(c.limitMin)}..` : ''}${n(c.limit)}${c.mancanti ? `:mancano ${c.mancanti.join(',')}` : ''}`),
    documenti: d.documenti.map((x) => `${x.id}:${x.stato}${x.allegato ? `#${x.allegato.position}` : ''}`),
    strutture: `${d.strutture.esito}:${d.strutture.domande.join('+')}`,
    mancanti: d.mancanti.map((m) => `${m.dove}/${m.campo}${m.bloccante ? '!' : ''}`),
    primaDopo: d.primaDopo.map((r) => `${r.grandezza}:${n(r.prima)}>${n(r.dopo)}:${r.variazione}`),
    punti: d.punti.map((p) => `${p.sezione}:${p.tipo}:${p.punto.rif}`),
  };
}
