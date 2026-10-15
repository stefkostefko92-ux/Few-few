// Registry of the changes of the rated speed and of the travel a modification makes against what the logbook (libretto)
// or a later verbale documents (round 46; modifica.ts variazioneVelocita, variazioneCorsa): entries of VOCI_IMPIANTO,
// kept apart for the size of norme.ts and spread there after the change of the loads; the constants go into KL.
// Italian texts, clause numbers and values only, in our words. Pure.
import { letto } from '@/calc/norme-fonti';
import type { VoceImpianto } from './norme';

export const KL_VARIAZIONI = {
  // UNI 10411-1:2024, 15.1: an increase of the rated speed over this share of the higher of the logbook's speed and the
  // one after the passage to 50 Hz brings 15.2–15.15; 15.16: a decrease over this share of the initial (or documented)
  // speed brings 15.2 and 15.17 (fractions)
  speedInc1: 0.05,
  speedDec1: 0.05,
  // UNI 10411-11:2024, 15 i): a change of the rated speed over this share needs the UCM protection of UNI EN 81-20
  // 5.6.7 (fraction)
  ucmSpeed11: 0.05,
  // UNI 10411-1:2024, 16: the travel lengthened by up to this much from the first acceptance test is still a
  // modification; more counts as a new installation [m]
  travelInc1: 8,
} as const;

const pct = (x: number): string => String(Math.round(x * 1000) / 10).replace('.', ',');
const it = (x: number): string => String(x).replace('.', ',');
const K = KL_VARIAZIONI;

export const VOCI_VARIAZIONI: readonly VoceImpianto[] = [
  {
    id: 'impianto.variazione.velocita', titolo: 'Modifica: variazione della velocità nominale rispetto a quella documentata',
    valore: `con la UNI 10411-1 la velocità entra tra le parti modificate se il progetto la porta oltre il ${pct(K.speedInc1)} % sopra la maggiore tra `
      + 'la velocità nominale iniziale del libretto (o quella accertata in seguito con verbale di verifica straordinaria, dopo un aumento oltre il '
      + `5 %) e quella che deriva dal passaggio della rete a 50 Hz (15.1, con i punti da 15.2 a 15.15), oppure oltre il ${pct(K.speedDec1)} % sotto `
      + 'quella iniziale o documentata (15.16, con i punti 15.2 e 15.17); con la UNI 10411-11 a ogni variazione della velocità documentata, in più o in '
      + `meno (15, lettere a)–k), con la valutazione 4.3), e oltre il ${pct(K.ucmSpeed11)} % serve anche la protezione UCM della UNI EN 81-20, 5.6.7 `
      + '(15 i)). I valori del libretto li inserisce l’utente nei dati del collaudo; il software non verifica i documenti',
    riferimento: 'UNI 10411-1:2024, 15.1 e 15.16; UNI 10411-11:2024, 15 e 15 i)',
    fonte: `${letto('UNI 10411-1:2024', 'pp. 14–15')}; ${letto('UNI 10411-11:2024', 'pp. 12–13')}`, stato: 'confermato',
    costanti: ['speedInc1', 'speedDec1', 'ucmSpeed11'],
    nota: 'una differenza entro 0,005 m/s è l’arrotondamento dei dati (scelta del software, non un valore della norma); con la -1 una variazione '
      + 'entro il 5 % non porta i punti 15.2–15.15: se sia comunque un cambio della velocità ai sensi del DPR 162/1999 lo valuta il tecnico',
  },
  {
    id: 'impianto.variazione.corsa', titolo: 'Modifica: variazione della corsa rispetto a quella documentata',
    valore: 'con la UNI 10411-1 la corsa del progetto si confronta con quella del primo collaudo: allungata fino a '
      + `${it(K.travelInc1)} m resta una modifica (16, condizioni a)–l)); oltre ${it(K.travelInc1)} m l’intervento conta come nuova installazione `
      + '(avviso, da confermare con il soggetto della verifica); con la UNI 10411-11 con la corsa documentata, senza un limite (16, condizioni '
      + 'a)–i), con la valutazione 4.3). Ogni variazione, anche un accorciamento, porta la corsa tra le parti modificate (DPR 162/1999, art. 2 c.1 '
      + 'lett. cc)); il punto 16 tratta solo l’allungamento: per l’accorciamento la valutazione del punto 4 o 4.3',
    riferimento: 'UNI 10411-1:2024, 16; UNI 10411-11:2024, 16; DPR 162/1999, art. 2 c.1 lett. cc)',
    fonte: `${letto('UNI 10411-1:2024', 'p. 16')}; ${letto('UNI 10411-11:2024', 'p. 13')}; DPR 162/1999 (testo su Normattiva)`, stato: 'confermato',
    costanti: ['travelInc1'],
    nota: 'una differenza entro 0,05 m è l’arrotondamento dei dati (scelta del software, non un valore della norma)',
  },
];
