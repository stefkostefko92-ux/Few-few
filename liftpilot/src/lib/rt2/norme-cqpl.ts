// The numbers of the pages «Quadro di manovra», «Cabina», «Limitatore di velocità» and «Porte» of the RT after the
// owner's model (round 52) that no other registry holds (K_CQPL), and the entries (VOCI_CQPL) of every check of these
// pages with its clause and value in our words. The numbers of the standards the engines already hold are reused by
// name and stated here as the code has them: the tolerances of prospetto 1 (KL, through ctx.carico), the car's area and
// passengers (KV, @/shaft/area), the instantaneous safety gear's speed (KV_VERT.gearInstantV), the governor's window,
// sheave and forces (KV_GOV, KR), the controller's voltages (KR), the landing doors' heights (KV_VERT, KR). Clause
// numbers and values only, never a text of a standard. Pure.
import { letto } from '@/calc/norme-fonti';
import { K } from '@/calc/norme';
import { KL } from '../lift/norme';
import { KR } from '../rt/norme';
import { KV } from '@/shaft/norme';
import { KV_VERT } from '@/shaft/norme-vert';
import type { VoceRt2 } from './norme';

export const K_CQPL = {
  // the model's limits of the new car's mass on its input screen (Cabina!O81:O82): the old loads ±10 % — its own
  // numbers, not a standard's (corrected: prospetto 1 on T* = P + Q, E-C7)
  pModelloSu: 1.1,
  pModelloGiu: 0.9,
  // the model's minimum diameter of the governor rope [mm] (Limitatore!AU4): the rule of UNI EN 81-1, not in UNI EN
  // 81-20:2020 (registry rt limitatore.fune.sicurezza) — kept as the model's own check
  funeLimDiamMin: 6,
} as const;
export type CostanteCqpl = keyof typeof K_CQPL;

const it = (x: number): string => String(x).replace('.', ',');
const pct = (x: number): string => it(Math.round(x * 1000) / 10);
const T20 = 'UNI EN 81-20:2020', U1 = 'UNI 10411-1:2024', U11 = 'UNI 10411-11:2024';
const MODELLO = 'modello Excel del titolare (RT-E MOD 10411-1)';
const G = KV_VERT;

export const VOCI_CQPL: readonly VoceRt2[] = [
  {
    id: 'rt2.cabina.carico', area: 'cabina', titolo: 'Variazione del carico statico T* = P + Q e della portata',
    valore: `T* = P + Q (cabina completa vuota e portata, escluse funi e cavi) e portata confrontati con quelli documentati: senza verifiche fino a `
      + `+${pct(KL.loadIncT[0])} % di T* e +${pct(KL.loadIncQ[0])} % della portata con portata fino a ${KL.loadSplitQ} kg, +${pct(KL.loadIncT[1])} % e `
      + `+${pct(KL.loadIncQ[1])} % oltre (con le due portate a cavallo dei ${KL.loadSplitQ} kg la riga più severa); oltre, i punti da 6.3 a 6.12 e 6.15; `
      + 'un carico diminuito porta gli ammortizzatori e il paracadute a presa progressiva, il rapporto dei carichi sospesi variato la D.1 e la D.2; '
      + `con la ${U11} ogni aumento. Il modello confrontava la tensione delle funi g·(Q + P + Pfuni)/ct con ±15 % per ogni portata`,
    riferimento: `${U1}, 6.1 (prospetto 1); ${U11}, 6.1`, fonte: `${MODELLO}, foglio «Cabina»; voce impianto.variazione.carico`, stato: 'confermato',
    verifiche: ['cabina.varT', 'cabina.varQ'],
    nota: 'righe informative: oltre la tolleranza la relazione chiede le verifiche dei componenti, non è un esito negativo; '
      + `la tensione delle funi del modello (g = ${it(K.g)} m/s²) resta stampata come informazione`,
  },
  {
    id: 'rt2.cabina.massaModello', area: 'cabina', titolo: 'Massa massima e minima della nuova cabina secondo il modello',
    valore: `il modello dava Pmax = ${it(K_CQPL.pModelloSu)}·(P + Q + Pfuni·k) − (Q + Pfuni·k) e Pmin = ${it(K_CQPL.pModelloGiu)}·(…) con le funi `
      + 'moltiplicate per un indice del locale macchina; corretto: Pmax = (1 + tolleranza di T*)·T* documentato − Q, Pmin = T* documentato − Q',
    riferimento: `${U1}, 6.1 (prospetto 1)`, fonte: `${MODELLO}, foglio «Cabina», O81:O82`, stato: 'prassi', costanti: ['pModelloSu', 'pModelloGiu'],
    nota: 'valori del solo schermo; quelli del modello restano calcolati per il confronto',
  },
  {
    id: 'rt2.cabina.superficie', area: 'cabina', titolo: 'Superficie utile e capienza della cabina',
    valore: 'cabina nuova di un ascensore per persone: superficie utile non oltre la massima del prospetto 6 per la portata e persone non oltre il '
      + `numero del prospetto 8 (portata/${KV.personMass} kg e superficie); cabina che resta con la portata cambiata: la superficie documentata `
      + 'oltre la massima è un’attenzione, mai un esito negativo',
    riferimento: `${T20}, 5.4.2.1.1 (prospetto 6) e 5.4.2.3.1 (prospetto 8)`, fonte: 'voci cabina.superficie, cabina.passeggeri e cabina.superficie.esistente',
    stato: 'confermato', verifiche: ['cabina.superficie', 'cabina.capienza', 'cabina.superficieEsistente'],
    nota: 'il modello dichiarava la conformità senza verificarla; la cabina che resta: lettura del software (la UNI 10411 non la chiede)',
  },
  {
    id: 'rt2.cabina.paracadute', area: 'cabina', titolo: 'Tipo di paracadute della cabina per la velocità nominale',
    valore: `paracadute istantaneo (a cunei o a rulli) fino a ${it(G.gearInstantV)} m/s; oltre, a presa progressiva; il tipo è un dato da scegliere `
      + '(il modello lo prendeva da un foglio nascosto e offriva anche «senza»)',
    riferimento: `${T20}, 5.6.2.1.2.1`, fonte: 'voce paracadute.tipo', stato: 'confermato', verifiche: ['cabina.paracadute'],
  },
  {
    id: 'rt2.quadro.tensioni', area: 'quadro', titolo: 'Tensione di manovra e contatti delle serrature di piano',
    valore: `circuiti di comando e di sicurezza del quadro nuovo non oltre ${KR.ctrlVoltageMax} V; con il quadro nuovo e le porte di piano esistenti, `
      + `i contatti delle serrature accessibili al dito di prova non oltre ${KR.lockContactAc} V in alternata o ${KR.lockContactDc} V in continua `
      + '(la tensione ai contatti, con la sua corrente: non quella di manovra; corrente non detta: il limite in alternata)',
    riferimento: `${T20}, 5.10.1.3.2; ${U1}, 11.1.2`, fonte: 'voce quadro.tensioni', stato: 'confermato',
    verifiche: ['quadro.tensioneManovra', 'quadro.contattiSerrature'],
    nota: 'con il quadro esistente la tensione di manovra è stampata come informazione; i contatti solo con la UNI 10411-1',
  },
  {
    id: 'rt2.limitatore.funeDiametro', area: 'limitatore', titolo: 'Diametro minimo della fune del limitatore secondo il modello',
    valore: `fune del limitatore di almeno ${K_CQPL.funeLimDiamMin} mm: sotto, «Attenzione» (verifica del modello, a favore di sicurezza)`,
    riferimento: 'UNI EN 81-1:1998, 9.9.6.3 (non nella UNI EN 81-20:2020, 5.6.2.2.1.3)', fonte: `${MODELLO}, foglio «Limitatore», AU4; ${letto('UNI EN 81-20:2020', 'p. 83')}`,
    stato: 'prassi', costanti: ['funeLimDiamMin'], verifiche: ['limitatore.funeDiametro'],
    nota: 'requisito della UNI EN 81-1 (anche 1999), non della UNI EN 81-20:2020; con la corsa estesa la UNI 10411-1:2024 16 i) ammette la UNI EN 81-1:1987 '
      + 'o la UNI EN 81-20: per questo non è una verifica non superata ma un avviso',
  },
  {
    id: 'rt2.limitatore.fune', area: 'limitatore', titolo: 'Fune del limitatore: coefficiente di sicurezza e rapporto dei diametri',
    valore: `carico di rottura della fune almeno ${KR.govRopeSf} volte la forza di trazione all’intervento (FRm/Fad); diametro della puleggia del `
      + `limitatore almeno ${G.govSheaveRatio} volte quello della fune (D/d); il modello stampava i valori senza esito e il diametro minimo `
      + `di avvolgimento ${G.govSheaveRatio}·d`,
    riferimento: `${T20}, 5.6.2.2.1.3 b) e c)`, fonte: 'voci limitatore.fune e limitatore.fune.sicurezza', stato: 'confermato',
    verifiche: ['limitatore.funeSicurezza', 'limitatore.Dd'],
  },
  {
    id: 'rt2.limitatore.forza', area: 'limitatore', titolo: 'Forza di trazione del limitatore all’intervento',
    valore: `la forza di trazione nella fune all’intervento almeno la maggiore tra ${KR.govForceGear} volte la forza che fa intervenire il paracadute `
      + `e ${KR.govForceMin} N (il modello stampava «> ${KR.govForceMin} N» senza verifica)`,
    riferimento: `${T20}, 5.6.2.2.1.1 d)`, fonte: 'voce limitatore.forza', stato: 'confermato', verifiche: ['limitatore.forza'],
    nota: 'quale colonna del catalogo del modello («Forza az.», «Forza ad.») sia la forza del limitatore è da confermare con il titolare: '
      + 'il software usa quella che il modello stampa come «Forza di trazione»',
  },
  {
    id: 'rt2.limitatore.scatto', area: 'limitatore', titolo: 'Velocità d’intervento del limitatore',
    valore: `almeno ${it(G.govTripMin)} volte la velocità nominale e sotto il limite del paracadute: ${it(G.govTripInstant)} m/s istantaneo, `
      + `${G.govTripRoller} m/s a rulli, ${it(G.govTripProgressive)} m/s progressivo fino a ${G.govTripProgressiveV} m/s di velocità nominale, `
      + `${it(G.govTripK)}·v + ${it(G.govTripC)}/v oltre (il modello: ${it(G.govTripK)}·(v + ${it(G.govTripC)}/v) e la fascia del paracadute scelta a mano)`,
    riferimento: `${T20}, 5.6.2.2.1.1 a)`, fonte: 'voci limitatore.scatto e limitatore.taratura', stato: 'confermato', verifiche: ['limitatore.scatto'],
    nota: 'la velocità d’intervento di targa è un dato nuovo della pagina (il modello non la chiedeva)',
  },
  {
    id: 'rt2.limitatore.origine', area: 'limitatore', titolo: 'Velocità d’intervento entro la regola in vigore all’installazione',
    valore: 'con la UNI 10411-1, limitatore nuovo o velocità ridotta: la velocità d’intervento di targa non oltre il limite della regola in vigore '
      + 'alla data di installazione, che il tecnico indica con la sua fonte (prima della UNI EN 81-1:1999: D.Lgt. 600/1945, DPR 1497/1963, '
      + 'DM 587/1987); accanto alla finestra della UNI EN 81-20, 5.6.2.2.1.1 a)',
    riferimento: `${U1}, 18 e 15.17 (nota 9)`, fonte: letto(U1, 'pp. 15 e 17'), stato: 'scelta', verifiche: ['limitatore.origine'],
    nota: 'i valori dei decreti d’origine non sono nel software: li dichiara il tecnico; se debbano valere entrambi i limiti lo decide il '
      + 'soggetto della verifica (la norma dice «requisiti applicabili» e «in ogni caso»)',
  },
  {
    id: 'rt2.porte.fuoco', area: 'porte', titolo: 'Porte di piano nuove: resistenza al fuoco',
    valore: 'la classe delle nuove porte di piano non inferiore a quella delle esistenti (minuti e lettera I; REI 120′ come EI 120′); classi non '
      + 'confrontabili: attenzione',
    riferimento: `${U1}, 19.2`, fonte: 'voce porte.fuoco', stato: 'scelta', verifiche: ['porte.fuoco'],
    nota: 'l’ordine fra le classi è una lettura del software (voce porte.fuoco)',
  },
  {
    id: 'rt2.porte.altezza', area: 'porte', titolo: 'Porte di piano nuove: altezza',
    valore: `alte almeno ${G.entranceH} mm; più basse solo dove l’edificio non lo consente (attenzione), mai sotto le esistenti né sotto `
      + `${KR.doorHeightMin8121} mm (sotto ${KR.doorHeightEn8121} mm anche la UNI EN 81-21:2022, 5.12)`,
    riferimento: `${U1}, 19.1; ${T20}, 5.3.2.1; UNI EN 81-21:2022, 5.12`, fonte: 'voce porte.altezza', stato: 'confermato', verifiche: ['porte.altezza'],
  },
];
