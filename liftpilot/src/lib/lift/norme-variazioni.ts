// Registry of the changes of the rated speed and of the travel a modification makes against what the logbook (libretto)
// or a later verbale documents (round 46; modifica.ts variazioneVelocita, variazioneCorsa), of the speed regulation of
// the existing controller under a new machine (B6) and of the optional parts of a modernisation (B7): entries of
// VOCI_IMPIANTO, kept apart for the size of norme.ts and spread there after the change of the loads; the constants go
// into KL. Italian texts, clause numbers and values only, in our words. Pure.
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
  // UNI 10411-1:2024, 13.1.3 b) and UNI 10411-11:2024, 13.1.2 b): the car doors made sliding, the free vertical space
  // over the new parts on the car roof ≥ slidingClear + slidingClearV2·v² [m] (printed as information: the check
  // h_clear stays to UNI EN 81-20, owner's decision Q5)
  slidingClear: 0.3,
  slidingClearV2: 0.035,
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
      + 'entro il 5 % non porta i punti 15.2–15.15: se sia comunque un cambio della velocità ai sensi del DPR 162/1999 lo valuta il tecnico; una '
      + 'diminuzione oltre il 5 % porta nell’esito tutte le verifiche che riguardano la velocità, più dei punti 15.2 e 15.17 (dalla parte della sicurezza)',
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
  {
    id: 'impianto.quadro.regolazione', titolo: 'Modifica: macchina nuova sul quadro esistente — regolazione della velocità',
    valore: 'con la macchina sostituita e il quadro che resta si chiede se il quadro esistente ha la regolazione della velocità (inverter, due '
      + 'velocità o una velocità): il software dimensiona ogni macchina che propone per la regolazione con inverter (voce impianto.catalogo), e '
      + 'la UNI 10411-1:2024 (11.2.1) e la UNI 10411-11:2024 (11.2) non ammettono di aggiungere la regolazione a un quadro che non l’ha; con '
      + 'una o due velocità il calcolo non si salva come «Solo argano» né come ammodernamento con il quadro che resta (si sostituisce il quadro); '
      + 'con l’inverter la regolazione resta, e sostituendo il suo dispositivo vale anche l’11.1.4 (-11: 11.1.3)',
    riferimento: 'UNI 10411-1:2024, 11.2.1 e 11.1.4; UNI 10411-11:2024, 11.2 e 11.1.3',
    fonte: `${letto('UNI 10411-1:2024', 'p. 11')}; ${letto('UNI 10411-11:2024', 'p. 10')}`, stato: 'confermato',
    nota: 'una macchina senza inverter (una o due velocità alla frequenza di rete) non è modellata; i calcoli salvati prima, senza la risposta, '
      + 'si aggiornano e la relazione lo segnala con ⚠ (fino a LIFT 1.32.0 la domanda non c’era)',
  },
  {
    id: 'impianto.parti.facoltative', titolo: 'Ammodernamento: altre parti (facoltative)',
    valore: 'un gruppo a parte, «No» finché non si risponde «Sì», fuori dall’elenco di ciò che manca e non indicato dal rifacimento con '
      + 'l’arcata esistente: paracadute (le verifiche del tipo di paracadute e delle guide), protezioni ACOP e UCM e allarme di emergenza (solo gli '
      + 'adempimenti), locale del macchinario (le verifiche del locale: altezze, porta, quadro, zone libere e percorsi), porte di cabina da '
      + 'battente a scorrevoli, solo con le porte di cabina sostituite (superficie della cabina, rifugio sul tetto e grembiule; lo spazio libero '
      + `sopra le parti nuove sul tetto di almeno ${String(KL_VARIAZIONI.slidingClear).replace('.', ',')} + ${String(KL_VARIAZIONI.slidingClearV2).replace('.', ',')}·v² m `
      + 'si stampa tra gli adempimenti come informazione, la verifica resta secondo la UNI EN 81-20)',
    riferimento: 'UNI 10411-1:2024, 6.6, 6.7, 6.12, 8, 13, 14.4 c)–d), 15.3, 15.4, 23; UNI 10411-11:2024, 6.6, 6.7, 6.10, 8, 13, 14.3 a), 15 c), 15 i), 23',
    fonte: `${letto('UNI 10411-1:2024', 'pp. 8–9, 12–14, 20')}; ${letto('UNI 10411-11:2024', 'pp. 8–9, 11–12, 15')}`, stato: 'scelta',
    costanti: ['slidingClear', 'slidingClearV2'],
    nota: '«No» per difetto dà il risultato di prima, perché fino a LIFT 1.31.0 queste parti non c’erano e nessuna entrava nell’esito; quali '
      + 'verifiche riguarda ciascuna è una lettura del software, da confermare dall’ingegnere; il paracadute sostituito senza variazione del carico '
      + '(UNI 10411-1, 6.7 nel punto dei carichi) è da verificare sul testo vigente',
  },
];
