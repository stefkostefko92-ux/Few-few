// The document of the differences of the relazione tecnica from the owner's model (round 52): the lists of every area
// (differenze*.ts) in one Markdown file, by component (its title on the fascicolo), with the clause where the correction
// rests on one. Clause numbers only, never a text of a standard. Pure.
import { DIFFERENZE_AMM } from './differenze-amm';
import { DIFFERENZE_CQPL } from './differenze-cqpl';
import { DIFFERENZE_GUIDE } from './differenze-guide';
import { DIFFERENZE_FUNI, DIFFERENZE_GENERALI, DIFFERENZE_MACCHINA, type Differenza } from './differenze';
import { titoloComponente } from './titoli';

/** Every difference, in the order of the fascicolo's pages. */
export const DIFFERENZE_TUTTE: readonly Differenza[] = [
  ...DIFFERENZE_GENERALI, ...DIFFERENZE_CQPL, ...DIFFERENZE_FUNI, ...DIFFERENZE_GUIDE, ...DIFFERENZE_AMM, ...DIFFERENZE_MACCHINA,
];

// a table cell: one line, its pipes escaped
const cella = (s: string): string => s.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();

export function differenzeMarkdown(): string {
  const gruppi = new Map<string, Differenza[]>();
  for (const d of DIFFERENZE_TUTTE) { const g = titoloComponente(d.componente); gruppi.set(g, [...(gruppi.get(g) ?? []), d]); }
  const out = [
    '# Relazione tecnica di modifica — differenze dal modello Excel del titolare',
    '',
    'Generato da `npx tsx scripts/rt2-differenze.ts` dai registri del codice (`src/lib/rt2/differenze*.ts`): non modificare a mano.',
    '',
    'Per ogni punto: che cosa fa il file «RT-E MOD - 10411-1» e che cosa fa LiftPilot. Le correzioni sono dove il file contraddice la norma, '
      + 'non è a favore di sicurezza o dà un numero o un esito sbagliato; altrove la relazione segue il file. Solo numeri di punto delle norme, mai il loro testo.',
    '',
    `Totale: ${DIFFERENZE_TUTTE.length} punti.`,
  ];
  for (const [componente, righe] of gruppi) {
    out.push('', `## ${componente}`, '', '| Id | Nel file | In LiftPilot | Norma |', '|---|---|---|---|');
    for (const d of righe) out.push(`| ${cella(d.id)} | ${cella(d.modello)} | ${cella(d.correzione)} | ${cella(d.norma ?? '—')} |`);
  }
  return `${out.join('\n')}\n`;
}
