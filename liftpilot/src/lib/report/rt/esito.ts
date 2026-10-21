// «Esito delle verifiche» and «Adeguamenti e adempimenti» of the relazione tecnica di modifica (RT plan §5.1): every
// computed check of the RT section by section with its mark (✓ ✗ ! — ◻), its outcome and its clause; the verdict over
// the checks this modification requires (D.1 and D.2 among them when asked) — not the outcome of the extraordinary
// inspection —; the data the RT misses; then what the standard asks of the replaced machine (collaudo.ts adaptSection,
// without its list of the other parts, which the sections print), the obligations of the cases and of the parts with no
// section of their own, and what DPR 162/1999 asks with each standard's points on site (adempimentiBlocks, D.1 at the
// brake test included). Pure.
import { NORMA_SIGLA } from '../../lift/collaudo';
import { macchinaResta } from '../../lift/intervento';
import { CAMPI } from '../../rt/componenti/punti';
import { titoloSezione } from '../../rt/sezioni';
import { adaptSection, adempimentiBlocks } from '../collaudo';
import type { ReportBlock } from '../model';
import type { Ctx } from './contesto';
import { esitoDi, esitoKey, etichetta } from './righe';
import { DOC, campo, elenco, fill, punto } from './testi';

const E = DOC.esito, SEGNI: Readonly<Record<string, string>> = DOC.segni;

/** The verdict in words: all met, or the counts. */
export const verdettoText = (x: Ctx): string => (x.d.failCount || x.d.warnCount
  ? fill(E.conteggio, { fail: x.d.failCount, warn: x.d.warnCount }) : E.tutte);

export function esitoBlocks(x: Ctx): ReportBlock[] {
  const checks = x.d.checks, B: ReportBlock[] = [x.h2(x.titolo('esito')), { t: 'p', text: E.intro }];
  if (checks.length) {
    B.push({ t: 'grid', head: E.head, widths: [0.2, 0.42, 0.16, 0.22], align: ['l', 'l', 'l', 'l'], statusCol: 2,
      rows: checks.map((c) => [titoloSezione(c.sezione), etichetta(x, c), `${SEGNI[esitoKey(c)] ?? ''} ${esitoDi(c).text.split('\n')[0] ?? ''}`.trim(), c.ref]),
      status: checks.map((c) => esitoDi(c).status) });
  } else B.push({ t: 'p', style: 'note', text: E.nessunaVerifica });
  B.push({ t: 'verdict', text: fill(E.verdetto, { testo: verdettoText(x) }), status: x.d.verdict === 'FAIL' ? 'fail' : x.d.verdict === 'WARN' ? 'warn' : 'ok' });
  B.push({ t: 'p', style: 'note', text: E.nota });
  if (x.C.aggiuntive?.length) B.push({ t: 'p', style: 'note', text: fill(E.aggiuntive, { norme: x.C.aggiuntive.map((n) => NORMA_SIGLA[n]).join('; ') }) });
  // the data the RT misses (the issue's confirmation lists them): by section, each field once
  const non = x.d.mancanti.filter((m) => !m.bloccante);
  if (non.length) {
    const per = new Map<string, string[]>();
    for (const m of non) {
      const k = m.dove === 'strutture' ? x.titolo('strutture') : m.dove === 'anagrafica' || m.dove === 'firme' || m.dove === 'doc' || m.dove === 'regime' ? x.titolo('impianto') : titoloSezione(m.dove);
      const l = per.get(k) ?? [];
      const c = campo(m.campo, CAMPI);
      if (!l.includes(c)) l.push(c);
      per.set(k, l);
    }
    B.push({ t: 'h3', text: E.mancanti }, { t: 'p', style: 'note', text: E.mancantiIntro }, { t: 'list', items: [...per].map(([k, l]) => `${k}: ${elenco(l)}`) });
  }
  return B;
}

export function adempimentiSezione(x: Ctx): ReportBlock[] {
  const resta = macchinaResta(x.d.tipo, x.C), V = x.base.values, adapt = adaptSection(x.C, true, x.P.t, V);
  // the replaced machine's adaptations without the list of the other parts (each section prints its own obligations)
  const altre = adapt.blocks.findIndex((b) => b.t === 'h3');
  const head = altre < 0 ? adapt.blocks : adapt.blocks.slice(0, altre);
  const casi = x.d.punti.filter((p) => p.sezione === 'adeguamenti').map((p) => punto(p.punto));
  return [
    x.h2(x.titolo('adempimenti')),
    { t: 'h3', text: fill(x.C.parti.includes('machine') ? DOC.adempimenti.titoloMacchina : DOC.adempimenti.titoloAltre, { norma: x.sigla }) }, ...head,
    ...(casi.length ? [{ t: 'h3', text: DOC.adempimenti.casi } as ReportBlock, { t: 'list', items: casi } as ReportBlock] : []),
    ...adempimentiBlocks(x.C, true, resta, V),
  ];
}
