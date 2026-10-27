// The differences of the RT from the owner's model (round 52) for the first page, the ropes, the machine and the
// attachments: where the model contradicts the standard, is unsafe or gives a wrong number or verdict, what it does and
// what LiftPilot does (the owner's decision asks for the list). Ids as in the specs (E-DG, E-F, E-M, E-AL). The areas'
// lists are in differenze-<area>.ts. Clause numbers only, never a text of a standard. Pure.

export interface Differenza {
  id: string;
  componente: string;
  modello: string;
  correzione: string;
  norma?: string;
}

const DG = 'Dati Generali', FU = 'Funi di trazione', MA = 'Macchina', AL = 'Allegati';
const U1 = 'UNI 10411-1:2024', T20 = 'UNI EN 81-20:2020', T50 = 'UNI EN 81-50:2020';

export const DIFFERENZE_GENERALI: readonly Differenza[] = [
  { id: 'E-DG-1', componente: DG, modello: 'Il «dopo» copia il «prima»; un «prima» vuoto vale 0.', correzione: 'Il «dopo» viene dal Calcolo argano; un «prima» non documentato vale come il «dopo».' },
  { id: 'E-DG-2/17', componente: DG, modello: '«era:» stampato anche quando il valore non cambia; l’unità anche dopo «preesist.».',
    correzione: '«era:» solo quando il valore cambia, altrimenti «preesist.» senza unità.' },
  { id: 'E-DG-3/4', componente: DG, modello: 'Variazione del carico sul tiro delle funi g·(Q+P+funi)/taglia; senza la massa delle funi vecchie il «prima» è fatto con i valori «dopo» (variazione nulla o −50 %).',
    correzione: 'Variazione di T* = P + Q rispetto ai carichi documentati, con le soglie del prospetto 1 (15 %/10 %) e il prospetto 2 per il contrappeso.', norma: `${U1}, 6.1` },
  { id: 'E-DG-5', componente: DG, modello: 'L’aumento di portata (+10 %/+5 %) è solo un avviso; gli avvisi «VERIFICA …» non scelgono nessun componente.',
    correzione: 'Portata o T* oltre il prospetto 1, contrappeso oltre il prospetto 2, calo dei carichi o rapporto dei carichi variato portano nella relazione funi, guide, ammortizzatori, contrappeso e cabina; la dichiarazione di idoneità dell’edificio è proposta tra gli allegati.', norma: `${U1}, 6.1` },
  { id: 'E-DG-6/8/9', componente: DG, modello: 'Velocità: confronto con la sola velocità «prima», anche vuota (allora ogni velocità è un aumento).',
    correzione: 'Aumento oltre il 5 % rispetto alla maggiore tra la velocità del libretto e quella dopo il passaggio a 50 Hz (UNI 10411-11: ogni variazione); senza velocità documentata nessun aumento.', norma: `${U1}, 15.1 e 15.16` },
  { id: 'E-DG-12', componente: DG, modello: '«SOSTITUZIONE PARACADUTE» e «SOSTITUZIONE LIMITATORE» al variare di carico o velocità.',
    correzione: 'La cabina (paracadute) e il limitatore entrano nella relazione per essere verificati; la sostituzione solo se non adeguati.', norma: `${U1}, 6.6 e 15.13` },
  { id: 'E-DG-10/14/16/18', componente: DG, modello: '#DIV/0! con dati vuoti; data 0/1/00 con la cella vuota; testi vuoti stampati «0».',
    correzione: 'Ciò che manca è elencato e blocca l’emissione; la data vuota è quella di oggi; un testo vuoto resta «—».' },
  { id: 'E-DG-24', componente: DG, modello: 'Totale pagine = ultima pagina + 1, senza contare le pagine «solo inserimento».', correzione: 'Le pagine sono contate dal documento impaginato (copertina esclusa).' },
  { id: 'Norma 1994', componente: DG, modello: 'Si può scegliere «UNI 10411 : 1994» come norma di riferimento.', correzione: 'La norma è quella in vigore secondo il collaudo del Calcolo argano: UNI 10411-1:2024 o UNI 10411-11:2024.' },
  { id: 'Firme', componente: AL, modello: '«Elaborata da» e «Direttore Tecnico» da elenchi di nomi nel file.', correzione: '«Elaborata da» e «Verificata da» (ingegnere con Ordine, provincia e numero) dalla relazione, come da decisione del titolare.' },
  { id: 'E-AL-2', componente: AL, modello: 'Righe vuote per i documenti non scelti.', correzione: 'Elenco compatto nell’ordine del modello; i file caricati sono elencati e messi in coda al fascicolo.' },
];

export const DIFFERENZE_FUNI: readonly Differenza[] = [
  { id: 'E-F1/E-F2', componente: FU, modello: 'Catalogo Donati: indice 8 ripetuto (la 11-152 dà i dati della 12-152); le funi a 114 fili senza dati valgono 0 (z = 0, peso 0).',
    correzione: 'Ogni fune ha il suo codice; le righe senza dati non sono offerte.' },
  { id: 'E-F3/E-F4', componente: FU, modello: 'Fune «altro»: la massa lineica inserita è ignorata; con due cataloghi scelti si sommano le masse.',
    correzione: 'Diametro, carico di rottura e massa sono quelli del Calcolo argano (una fune sola).' },
  { id: 'E-F6', componente: FU, modello: 'z > 12 (o > 16) stretto, anche con la pressione specifica non verificata.',
    correzione: 'z ≥ 12 (≥ 16 con due funi); con la D.2 non verificata vale il coefficiente S_f della UNI EN 81-50 calcolato nel Calcolo argano.', norma: `${T20}, 5.5.2.2; ${U1}, 14.1 c) e d); ${T50}, 5.12` },
  { id: 'E-F8', componente: FU, modello: 'Solo la stabilità allo scorrimento statica della D.1.',
    correzione: 'Con l’argano sostituito sono stampate anche le verifiche di aderenza nelle tre condizioni della UNI EN 81-50 5.11 del Calcolo argano.', norma: `${U1}, 14.1 a); ${T50}, 5.11` },
  { id: 'E-F10', componente: FU, modello: 'Con la «X» (o oltre 2,5 m/s) a = 0,5 m/s² e C1 = 1,107, sotto il minimo della fascia.', correzione: 'C1 mai sotto il minimo della fascia di velocità.', norma: `${U1}, D.1` },
  { id: 'E-F11/12/13', componente: FU, modello: 'Gole semicircolari: f con β fisso a 1,83 rad (aderenza sovrastimata ≈ 1,9 volte) o f = 0; f = 0 con «-».',
    correzione: 'f della D.1 per la gola: 4μ(1 − sin(β/2))/(π − β − sin β), β = 0 senza intaglio; μ/sin(γ/2) a cuneo.', norma: `${U1}, D.1` },
  { id: 'E-F14', componente: FU, modello: 'Angolo di avvolgimento vuoto = 0 (verifica sempre negativa).', correzione: 'L’angolo è quello del Calcolo argano (geometria o inserito).' },
  { id: 'E-F15', componente: FU, modello: 'Cavo flessibile 0,8 × corsa/2 sommato in N senza g.', correzione: 'Massa 0,8 kg/m × corsa/2 × g.' },
  { id: 'Rapporto', componente: FU, modello: 'T1/T2 come lato cabina su lato contrappeso anche quando il contrappeso è il più pesante.', correzione: 'Tiro maggiore sul minore in ogni caso.', norma: `${U1}, D.1` },
  { id: 'E-F17', componente: FU, modello: 'Limite della pressione × 0,981, non scritto nella formula stampata.', correzione: 'Fattore mantenuto (a favore di sicurezza) e scritto nella formula.', norma: `${U1}, D.2` },
  { id: 'E-F20', componente: FU, modello: 'Sempre «Le funi installate sono conformi…», anche con le funi esistenti.', correzione: 'Con le funi esistenti la pagina lo dice.' },
  { id: 'Gole', componente: FU, modello: 'Limiti dell’angolo di gola solo in un commento (106° per β).', correzione: 'Verificati γ ≥ 35° e β ≤ 105°.', norma: `${T50}, 5.11.2.3.1` },
];

export const DIFFERENZE_MACCHINA: readonly Differenza[] = [
  { id: 'E-M1', componente: MA, modello: 'La nota sull’inverter non si stampa mai con dati reali.', correzione: 'Stampata con VVVF quando il motore a 50 Hz cambierebbe la velocità oltre il 5 % e la velocità nominale resta entro il 5 %.' },
  { id: 'E-M2', componente: MA, modello: '±5 % sulla velocità «prima» (anche le riduzioni), con il bordo del 5 % contraddittorio tra schermo e pagina.',
    correzione: 'Regola della 15.1 (aumento oltre il 5 % rispetto alla maggiore tra libretto e 50 Hz); UNI 10411-11: ogni variazione.', norma: `${U1}, 15.1 e 15.16` },
  { id: 'E-M3/E-M4', componente: MA, modello: '«preesistente» mai stampato per puleggia e funi; tipo di gola inserito due volte.', correzione: 'Dati della macchina dal Calcolo argano, una volta sola; «preesistente» con la macchina che resta.' },
  { id: 'E-M5', componente: MA, modello: 'Descrizione fissa dell’argano, nessun dato del freno.', correzione: 'Con l’argano nuovo: modello e verifiche del freno del Calcolo argano.', norma: `${T20}, 5.9.2` },
  { id: 'E-M9', componente: MA, modello: 'Frequenza VVVF dai «giri per VF» 1000/1500.', correzione: 'Frequenza dai poli del motore del Calcolo argano.' },
  { id: 'E-M10', componente: MA, modello: 'Dichiarazione sulle strutture portanti sempre stampata.', correzione: 'Con i carichi oltre il prospetto 1 la pagina rimanda alla dichiarazione di idoneità dell’edificio allegata.', norma: `${U1}, 6.1` },
];
