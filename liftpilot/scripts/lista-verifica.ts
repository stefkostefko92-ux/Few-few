// Generates the verification checklist for the engineer from the registries (src/calc/norme.ts, src/shaft/norme.ts, the
// values filled in from the one form in src/lib/lift/norme.ts, the simulation's in src/sim/norme.ts):
// docs/lista-verifica-normativa.md (in the repository) and docs/lista-verifica-normativa.json (for the spreadsheet).
// Run: npm run lista
import { writeFileSync } from 'node:fs';
import { PROFILO, VOCI } from '../src/calc/index';
import type { CheckId, Gruppo, Stato } from '../src/calc/index';
import { VOCI_VANO } from '../src/shaft/index';
import type { GruppoVano, ShaftCheckId } from '../src/shaft/index';
import { VOCI_IMPIANTO } from '../src/lib/lift/norme';
import { ADEMPIMENTI, NORME_INFO, type PuntoInSito } from '../src/lib/lift/norme-collaudo';
import { NORMA_SIGLA, NORME_AGGIUNTIVE, NORME_COLLAUDO, VERIFICHE_DM236, VERIFICHE_NTC } from '../src/lib/lift/collaudo';
import { VOCI_SIM } from '../src/sim/norme';

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
  ingombri: 'Vano: ingombri tipici', sezione: 'Vano: sezione, spazi di rifugio e ammortizzatori', locale: 'Locale del macchinario',
  carichi: 'Carichi sull\'edificio e spinte sulle guide', modello_vano: 'Vano: limiti del progetto',
};
const VERIFICA_VANO: Record<ShaftCheckId, string> = {
  v_fit: 'la cabina entra nel vano', v_area: 'superficie della cabina per la portata', v_acc_car: 'cabina minima (DM 236/1989)',
  v_acc_door: 'porta minima (DM 236/1989)', v_acc_side: 'porta sul lato corto', v_door: 'ingombro della porta di piano',
  v_wall: 'parete di fronte all\'entrata', v_sill: 'gioco tra le soglie', v_cw: 'distanza cabina–contrappeso', v_cwlen: 'lunghezza del contrappeso',
  v_door2: 'ingombro della seconda porta di piano', v_land: 'disassamento della porta di piano A', v_land2: 'disassamento della porta di piano B',
  v_op: 'operatori delle porte adiacenti', v_place: 'quote fissate a mano: ingombri al loro posto',
  v_doorcar: 'quote fissate a mano: porte dentro la cabina', v_buffer: 'ammortizzatori fissati a mano: sotto cabina e contrappeso, fuori dal rifugio',
  v_niche: 'nicchie nelle pareti', v_staffa: 'staffe del catalogo per le guide del contrappeso', v_head: 'pareti in testata diverse dal piano principale', h_refuge: 'spazio di rifugio in testata',
  h_clear: 'distanze libere dal soffitto', h_top: 'parte più alta della cabina sotto ciò che pende sopra', h_parapet: 'balaustra sul tetto di cabina', h_stand: 'superficie per stare sul tetto di cabina',
  h_staffe: 'staffe Panev sopra le porte di piano: muro tra il vano della porta e la soglia del piano sopra',
  h_door: 'altezza libera degli accessi', h_car: 'altezza libera interna della cabina', h_cw: 'corsa guidata del contrappeso in testata',
  p_refuge: 'spazio di rifugio in fossa', p_screen: 'protezione del contrappeso in fossa',
  p_apron: 'grembiule sugli ammortizzatori compressi', b_runby: 'extracorsa di cabina e contrappeso', b_type: 'tipo di ammortizzatori per la velocità', b_car: 'corsa degli ammortizzatori di cabina',
  b_cw: 'corsa dell\'ammortizzatore del contrappeso', m_height: 'altezza del locale macchina', m_panel: 'superficie libera davanti al quadro',
  m_door: 'porta del locale macchina', m_beam: 'tensione nelle putrelle sotto l\'argano', m_beamf: 'freccia delle putrelle sotto l\'argano', m_rinvio: 'calata del contrappeso nel telaio con rinvio del costruttore', m_fit: 'argano dentro il locale (muri e soffitto)', m_stand: 'puleggia di rinvio sul suo supporto sotto l\'argano',
  m_free: 'superficie libera accanto all\'argano',
  m_calata: 'sostituzione: calate della nuova macchina sulle calate esistenti',
  gr_stress: 'tensioni nelle guide di cabina', gr_flange: 'flessione della suola delle guide di cabina', gr_defl: 'frecce delle guide di cabina',
  sg_type: 'tipo di paracadute per la velocità',
};
const ORDER_VANO: readonly GruppoVano[] = ['cabina', 'distanze', 'accessibilita', 'porte', 'ingombri', 'sezione', 'locale', 'carichi', 'modello_vano'];
const IMPIANTO = 'Impianto: valori calcolati dai dati inseriti una volta', SIMULAZIONE = 'Simulazione nel tempo (3D e grafici)';
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
  // the installation's one form and the simulation in time: no checks of their own
  ...[...VOCI_IMPIANTO.map((v) => ({ v, gruppo: IMPIANTO })), ...VOCI_SIM.map((v) => ({ v, gruppo: SIMULAZIONE }))].map(({ v, gruppo }) => ({
    id: v.id, gruppo, voce: v.titolo, valore: v.valore, riferimento: v.riferimento, fonte: v.fonte, stato: STATO[v.stato], verifiche: '', nota: v.nota ?? '',
  })),
  // the acceptance test: what DPR 162/1999 asks, then each standard's points checked on site (src/lib/lift/norme-collaudo.ts)
  ...[...(['nuovo', 'modifica'] as const).map((a) => ({ key: `adempimenti.${a}`, gruppo: `Collaudo: adempimenti del DPR 162/1999 (${a === 'nuovo' ? 'impianto nuovo' : 'modifica'})`, punti: ADEMPIMENTI[a], verifiche: '' })),
    ...[...NORME_COLLAUDO, ...NORME_AGGIUNTIVE.filter((n) => !NORME_COLLAUDO.some((b) => b === n))].map((n) => ({
      key: n, gruppo: `Collaudo: ${NORMA_SIGLA[n]}`, punti: NORME_INFO[n].punti,
      verifiche: (n === 'dm236' ? VERIFICHE_DM236 : n === 'ntc2018' ? VERIFICHE_NTC : []).map((c) => VERIFICA_VANO[c]).join('; '),
    }))].flatMap(({ key, gruppo, punti, verifiche }) => punti.map((p: PuntoInSito, i) => ({
    id: `collaudo.${key}.${i + 1}`, gruppo, voce: p.rif, valore: p.testo, riferimento: p.rif, fonte: 'ricerca, cap. 16 (testi ufficiali e schede UNI, 2026-10-02)',
    stato: STATO[p.stato], verifiche, nota: '',
  }))),
].map((r, j) => ({ n: j + 1, ...r }));
const ALL = [...VOCI, ...VOCI_VANO, ...VOCI_IMPIANTO, ...VOCI_SIM];
const PUNTI = rows.filter((r) => r.id.startsWith('collaudo.'));
const count = (s: Stato): number => ALL.filter((v) => v.stato === s).length;

const md: string[] = [
  `# Lista di verifica normativa — profilo ${PROFILO.id}`,
  '',
  `${PROFILO.titolo}. Generata da \`liftpilot/src/calc/norme.ts\` con \`npm run lista\`: non modificare a mano.`,
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
  `Voci: ${ALL.length} (argano ${VOCI.length}, vano ${VOCI_VANO.length}, impianto ${VOCI_IMPIANTO.length}, simulazione ${VOCI_SIM.length}) — da verificare ${count('da_verificare')}, confermate ${count('confermato')}, scelte del software ${count('scelta')}, ` +
    `stime ${count('stima')}, derivazioni ${count('derivazione')}, prassi ${count('prassi')}. Collaudo: ${PUNTI.length} punti da verificare in sito per normativa ` +
    `(${PUNTI.filter((r) => r.stato === STATO.confermato).length} letti sul testo ufficiale), riportati nella relazione per le normative scelte.`,
  '',
];
for (const title of [...ORDER.map((g) => GRUPPO[g]), ...ORDER_VANO.map((g) => GRUPPO_VANO[g]), IMPIANTO, SIMULAZIONE, ...new Set(PUNTI.map((r) => r.gruppo))]) {
  const group = rows.filter((r) => r.gruppo === title);
  if (!group.length) continue;
  md.push(`## ${title}`, '', '| N. | Voce | Valore nel software | Dove verificare | Fonte attuale | Stato | Verifiche interessate |', '|---|---|---|---|---|---|---|');
  for (const r of group) md.push(`| ${r.n} | ${cell(r.voce)}${r.nota ? ` — ${cell(r.nota)}` : ''} | ${cell(r.valore)} | ${cell(r.riferimento)} | ${cell(r.fonte)} | ${r.stato} | ${cell(r.verifiche) || '—'} |`);
  md.push('');
}

writeFileSync(new URL('../docs/lista-verifica-normativa.md', import.meta.url), md.join('\n'));
writeFileSync(new URL('../docs/lista-verifica-normativa.json', import.meta.url), JSON.stringify({ profilo: PROFILO, righe: rows }, null, 2) + '\n');
process.stdout.write(`lista di verifica: ${rows.length} voci\n`);
