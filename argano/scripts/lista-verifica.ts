// Generates the verification checklist for the engineer from the registry (src/calc/norme.ts):
// docs/lista-verifica-normativa.md (in the repository) and docs/lista-verifica-normativa.json (for the spreadsheet).
// Run: npm run lista
import { writeFileSync } from 'node:fs';
import { PROFILO, VOCI } from '../src/calc/index';
import type { CheckId, Gruppo, Stato } from '../src/calc/index';
import { VOCI_VANO } from '../src/shaft/index';
import type { GruppoVano, ShaftCheckId } from '../src/shaft/index';

const STATO: Record<Stato, string> = {
  confermato: 'confermato', da_verificare: 'da verificare', stima: 'stima', derivazione: 'derivazione', scelta: 'scelta del software', prassi: 'prassi di cantiere',
};
const GRUPPO: Record<Gruppo, string> = {
  trazione: 'Aderenza', gole: 'Gole', funi: 'Funi', freno: 'Freno', azionamento: 'Riduttore e motore', soccorso: 'Manovra di emergenza',
  albero: 'Albero e ancoraggi', sostituzione: 'Sostituzione (Italia)', modello: 'Modello di calcolo',
};
const VERIFICA: Record<CheckId, string> = {
  tr_load: 'aderenza al caricamento', tr_dn: 'aderenza in frenatura, in discesa', tr_up: 'aderenza in frenatura, in salita',
  tr_real: 'aderenza alla decelerazione reale (avviso)', tr_stall: 'cabina bloccata', r_dd: 'D/d della puleggia', r_ddp: 'Dp/d dei rinvii',
  r_nd: 'numero e diametro delle funi', g_geom: 'geometria della gola', r_sfa: 'coefficiente di sicurezza delle funi', d_pst: 'potenza del motore',
  d_ratio: 'coppia di accelerazione', d_mp: 'coppia in uscita', s_shaft: "carico sull'albero", b_sets: 'gruppi del freno', b_all: 'freno, tutti i gruppi',
  b_one: 'freno, un gruppo in discesa', b_up: 'freno, un gruppo a vuoto in salita', b_amax: 'decelerazione massima del freno',
  s_force: 'forza al volantino', s_uplift: 'sollevamento netto',
};
const ORDER: readonly Gruppo[] = ['trazione', 'gole', 'funi', 'freno', 'azionamento', 'soccorso', 'albero', 'sostituzione', 'modello'];
// the shaft design (src/shaft/norme.ts), after the machine
const GRUPPO_VANO: Record<GruppoVano, string> = {
  cabina: 'Vano: cabina e portata', distanze: 'Vano: distanze in pianta', accessibilita: 'Vano: accessibilità (DM 236/1989)', porte: 'Vano: porte',
  ingombri: 'Vano: ingombri tipici', modello_vano: 'Vano: limiti del progetto',
};
const VERIFICA_VANO: Record<ShaftCheckId, string> = {
  v_fit: 'la cabina entra nel vano', v_area: 'superficie della cabina per la portata', v_acc_car: 'cabina minima (DM 236/1989)',
  v_acc_door: 'porta minima (DM 236/1989)', v_acc_side: 'porta sul lato corto', v_door: 'ingombro della porta di piano',
  v_wall: 'parete di fronte all\'entrata', v_sill: 'gioco tra le soglie', v_cw: 'distanza cabina–contrappeso', v_cwlen: 'lunghezza del contrappeso',
};
const ORDER_VANO: readonly GruppoVano[] = ['cabina', 'distanze', 'accessibilita', 'porte', 'ingombri', 'modello_vano'];
const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

const rows = [
  ...ORDER.flatMap((g) => VOCI.filter((v) => v.gruppo === g)).map((v) => ({
    id: v.id, gruppo: GRUPPO[v.gruppo], voce: v.titolo, valore: v.valore, riferimento: v.riferimento, fonte: v.fonte, stato: STATO[v.stato],
    verifiche: (v.verifiche ?? []).map((c) => VERIFICA[c]).join('; '), nota: v.nota ?? '',
  })),
  ...ORDER_VANO.flatMap((g) => VOCI_VANO.filter((v) => v.gruppo === g)).map((v) => ({
    id: `vano.${v.id}`, gruppo: GRUPPO_VANO[v.gruppo], voce: v.titolo, valore: v.valore, riferimento: v.riferimento, fonte: v.fonte, stato: STATO[v.stato],
    verifiche: (v.verifiche ?? []).map((c) => VERIFICA_VANO[c]).join('; '), nota: v.nota ?? '',
  })),
].map((r, j) => ({ n: j + 1, ...r }));
const ALL = [...VOCI, ...VOCI_VANO];
const count = (s: Stato): number => ALL.filter((v) => v.stato === s).length;

const md: string[] = [
  `# Lista di verifica normativa — profilo ${PROFILO.id}`,
  '',
  `${PROFILO.titolo}. Generata da \`argano/src/calc/norme.ts\` con \`npm run lista\`: non modificare a mano.`,
  '',
  'Per l\'ingegnere incaricato: per ogni voce confrontare il valore usato dal software con il testo vigente del documento',
  'indicato e segnare l\'esito (conforme, diverso con il valore corretto e la clausola esatta, non applicabile). Le voci',
  '«da verificare» vengono da fonti secondarie; «stima» e «scelta del software» sono decisioni del software da approvare',
  'o correggere; «derivazione» è meccanica elementare; «confermato» vuol dire due fonti indipendenti o un caso pubblicato',
  'riprodotto, e va comunque confrontato con il testo. Ogni correzione entra nel registro e cambia insieme motore di',
  'calcolo, lista e relazione.',
  '',
  '## Documenti del profilo',
  '',
  ...PROFILO.documenti.map((d) => `- **${d.sigla}** — ${d.ambito}`),
  '',
  `Voci: ${ALL.length} (argano ${VOCI.length}, vano ${VOCI_VANO.length}) — da verificare ${count('da_verificare')}, confermate ${count('confermato')}, scelte del software ${count('scelta')}, ` +
    `stime ${count('stima')}, derivazioni ${count('derivazione')}, prassi ${count('prassi')}.`,
  '',
];
for (const title of [...ORDER.map((g) => GRUPPO[g]), ...ORDER_VANO.map((g) => GRUPPO_VANO[g])]) {
  const group = rows.filter((r) => r.gruppo === title);
  if (!group.length) continue;
  md.push(`## ${title}`, '', '| N. | Voce | Valore nel software | Dove verificare | Fonte attuale | Stato | Verifiche interessate |', '|---|---|---|---|---|---|---|');
  for (const r of group) md.push(`| ${r.n} | ${cell(r.voce)}${r.nota ? ` — ${cell(r.nota)}` : ''} | ${cell(r.valore)} | ${cell(r.riferimento)} | ${cell(r.fonte)} | ${r.stato} | ${cell(r.verifiche) || '—'} |`);
  md.push('');
}

writeFileSync(new URL('../docs/lista-verifica-normativa.md', import.meta.url), md.join('\n'));
writeFileSync(new URL('../docs/lista-verifica-normativa.json', import.meta.url), JSON.stringify({ profilo: PROFILO, righe: rows }, null, 2) + '\n');
process.stdout.write(`lista di verifica: ${rows.length} voci\n`);
