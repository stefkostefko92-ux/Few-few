// Section 5 of the relazione tecnica di modifica (RT plan §5.1): the rules of the standard the calculation's test
// already applies — the CE marking that picks the part of UNI 10411, the change of the loads, of the rated speed and
// of the travel against the documents — with the data each compares, whether it applies (with its clause) and what it
// brings (each case with the sections it puts in the RT, or only points); then every section the RT can have on this
// path, whether it is in (by the rule, added by the engineer, or not) and why, with the clauses. Pure.
import { CASI_TESTO, SEZIONI, contestoOf, disponibile } from '../../rt/sezioni';
import type { RegolaRt, SezioneKey } from '../../rt/types';
import type { ReportBlock } from '../model';
import type { Ctx } from './contesto';
import { marcaturaText } from './impianto';
import { motivoText } from './sezione';
import { DOC, fill } from './testi';

const R = DOC.regole;
/** The quantities of the rules, short. */
const SIMBOLI: Readonly<Record<string, string>> = { Q: 'Q', Tstar: 'T*', Mcw: 'M_cw', velocita: 'v', velocita50: 'v (50 Hz)', corsa: 'H' };
const titolo = (k: SezioneKey): string => SEZIONI.find((s) => s.key === k)?.titolo ?? k;

function datiText(x: Ctx, g: RegolaRt): string {
  if (g.regola === 'marcatura') return marcaturaText(x);
  if (!g.valori.length) return R.nessunDato;
  const v = (n: number | null, dec: number): string => (n === null ? '—' : x.fmt(n, dec));
  return g.valori.map((r) => `${SIMBOLI[r.grandezza] ?? r.grandezza}: ${v(r.prima, r.dec)} → ${v(r.dopo, r.dec)}${r.unit ? ` ${r.unit}` : ''}`).join('; ');
}

function esitoText(x: Ctx, g: RegolaRt): string {
  if (g.regola === 'marcatura') return `${R.marcaturaEsiti[g.esito]}: ${x.sigla}`;
  return `${R.esiti[g.esito]}\n${g.clausola}`;
}

/** What a rule brings: each case with the sections it puts in the RT, or its points only. */
function conseguenza(x: Ctx, g: RegolaRt): string {
  if (g.regola === 'marcatura') return fill(R.marcaturaConseguenza, { norma: x.sigla });
  if (!g.casi.length) return R.nessunCaso;
  return g.casi.map((c) => {
    const sez = x.d.sezioni.filter((s) => s.motivi.some((m) => m.tipo === 'caso' && m.chiave === c)).map((s) => titolo(s.key));
    const testo = CASI_TESTO[x.d.norma][c] ?? c;
    return `${testo}: ${sez.length ? sez.join(', ') : fill(R.soloPunti, { sezione: x.titolo('adempimenti') })}`;
  }).join('; ');
}

export function regoleBlocks(x: Ctx): ReportBlock[] {
  const ctx = contestoOf(x.base);
  const tutte = SEZIONI.filter((s) => disponibile(s.key, ctx));
  return [
    x.h2(x.titolo('regole')),
    { t: 'grid', head: R.head, widths: [0.2, 0.26, 0.2, 0.34], align: ['l', 'l', 'l', 'l'],
      rows: x.d.regole.map((g) => [R.nomi[g.regola], datiText(x, g), esitoText(x, g), conseguenza(x, g)]) },
    { t: 'grid', head: R.sezioniHead, widths: [0.26, 0.2, 0.54], align: ['l', 'l', 'l'],
      rows: tutte.map((s) => {
        const in_ = x.d.sezioni.find((z) => z.key === s.key);
        return [s.titolo, !in_ ? R.assente : in_.automatica ? R.automatica : R.manuale, in_ ? in_.motivi.map(motivoText).join('; ') : '—'];
      }) },
    { t: 'p', style: 'note', text: R.sezioniNota },
  ];
}
