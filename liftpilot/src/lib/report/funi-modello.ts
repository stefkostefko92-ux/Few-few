// The ropes of a modification under UNI 10411-1 as the owner's rope sheet checks them (round 52, lift/funi-modello.ts),
// in the relazione di calcolo after D.1 and D.2 of a changed ratio: the sheet's numbers in one table — z, the two cases
// of D.1 and D.2 (with the ratio as documented: D.1 «Attenzione» when not met, D.2 deciding between z and S_f; with the
// ratio changed the tables above count), the compensation's tensioner — and whether z stands in for S_f, which the
// result then does not count (lift/sostituite.ts). None when the test does not take them. Pure.
import { deg } from '@/calc/math';
import type { FormValues } from '@/calc/types';
import type { Collaudo } from '../lift/collaudo';
import { funiModelloChecks } from '../lift/funi-modello';
import { rapportoVariato } from '../lift/rapporto';
import type { Pres } from '../present/tr';
import { soddisfa } from '../rt2/campi';
import { funiDaCalcolo } from '../rt2/funi-calc';
import { KR2 } from '../rt2/norme';
import type { BlockStatus, ReportBlock } from './model';

export function funiModelloBlocks(P: Pres, C: Collaudo, V: FormValues): ReportBlock[] {
  const checks = funiModelloChecks(C, V), m = checks.length ? funiDaCalcolo(V) : null;
  if (!m) return [];
  const { fmt } = P, o = m.out, z = checks.find((c) => c.id === 'fm_z'), rapporto = rapportoVariato(C, V), d2 = soddisfa(o.pRes, '<=', o.pLim);
  const rows: string[][] = [], status: BlockStatus[] = [];
  const row = (voce: string, valore: number, limite: string, ok: boolean, dec: number, no: 'fail' | 'warn' | 'info' = 'fail'): void => {
    const esito = ok ? 'Soddisfatta' : no === 'warn' ? 'Attenzione' : no === 'info' ? 'Non soddisfatta: vale S_f' : 'Non soddisfatta';
    rows.push([voce, Number.isFinite(valore) ? fmt(valore, dec) : '—', limite, esito]);
    status.push(ok ? 'ok' : no);
  };
  const d1 = (r: number): boolean => Number.isFinite(r) && soddisfa(r, '<=', o.efa);
  if (z) row(`Coefficiente di sicurezza z (${m.input.n} funi)`, o.z, `≥ ${fmt(o.zMin, 0)}`, z.status === 'ok', 2);
  if (!rapporto) {
    row('D.1, cabina al piano più basso con 1,25·Q: (T1/T2)·C1·C2', o.ratioLow, `≤ ${fmt(o.efa, 3)}`, d1(o.ratioLow), 3, 'warn');
    row('D.1, cabina vuota al piano più alto: (T1/T2)·C1·C2', o.ratioHigh, `≤ ${fmt(o.efa, 3)}`, d1(o.ratioHigh), 3, 'warn');
    row('D.2, pressione specifica nelle gole [N/mm²]', o.pRes, `≤ ${fmt(o.pLim, 2)}`, d2, 2, 'info');
  }
  if (o.compRatio !== null) row('D/d della puleggia tenditrice della compensazione', o.compRatio, `≥ ${fmt(KR2.compDd, 0)}`, soddisfa(o.compRatio, '>=', KR2.compDd), 1);
  if (!rows.length) return [];
  return [
    { t: 'h3', text: 'Funi come nel foglio funi della relazione tecnica (UNI 10411-1:2024, 14.1, D.1 e D.2)' },
    { t: 'grid', head: ['Verifica', 'Valore', 'Limite', 'Esito'], rows, status, statusCol: 3, widths: [0.5, 0.15, 0.17, 0.18], align: ['l', 'r', 'r', 'l'] },
    { t: 'p', style: 'note', text: `C1 = ${fmt(o.C1, 3)} con a = ${fmt(o.a, 2)} m/s², mai sotto il minimo della fascia di velocità; C2 = ${fmt(o.C2, 1)}; `
      + `f = ${fmt(o.f, 4)}; α = ${fmt(deg(o.alfaRad), 1)}°; nei tiri la compensazione e il cavo flessibile (${fmt(m.input.caviQ, 2)} kg/m su metà corsa). `
      + `${z ? 'Con la D.2 verificata z sostituisce il coefficiente S_f della UNI EN 81-50, 5.12, che l’esito non conteggia (UNI 10411-1:2024, 14.1 c) e d)).'
        : 'Con la D.2 non verificata vale il coefficiente S_f della UNI EN 81-50, 5.12 (verifiche dell’argano).'} `
      + `${rapporto ? 'Con il rapporto tra i carichi cambiato valgono la D.1 e la D.2 delle tabelle precedenti (UNI 10411-1:2024, 6.1).'
        : 'Il foglio funi calcola sempre la D.1 e la D.2: con il rapporto tra i carichi come documentato la norma non le chiede (6.1), quindi la D.1 non '
          + 'soddisfatta è un avviso e la D.2 decide solo tra z e S_f.'} Voci funi.modello.* del registro.` },
  ];
}
