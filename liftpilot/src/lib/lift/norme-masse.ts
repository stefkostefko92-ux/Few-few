// Registry of the masses the software adds to the loads on the building where nobody gives them (src/lib/lift/
// machine-mass.ts, support.ts): the parts a catalogue's mass leaves out of the machine, and the machine's support's own
// weight on the slab. Spread into VOCI_IMPIANTO at its place. Italian texts: they go to the engineer.
import type { VoceImpianto } from './norme';

export const KM = {
  // IEC asynchronous motors, 4 poles, cast-iron frame: the typical mass for the rated power [kW, kg], the next row up
  motorKg: [[1.5, 25], [2.2, 30], [3, 33], [4, 42], [5.5, 62], [7.5, 73], [11, 115], [15, 136], [18.5, 175], [22, 195], [30, 255], [37, 335], [45, 370],
    [55, 450], [75, 560], [90, 660]] as const,
  // a cast-iron sheave: mass per pitch diameter and width [kg/mm²], the width the ropes' grooves at their pitch plus the
  // rims (at least the narrowest of the catalogues) [mm], the pitch for each rope diameter up to [mm, mm]
  sheaveKgMm2: 0.00095,
  sheaveRims: 12,
  sheaveWidthMin: 80,
  groovePitch: [[12, 17], [14, 20], [16, 21]] as const,
  // the heaviest flywheel of the catalogues read [kg]
  flywheelKg: 21,
  // densities [kg/m³]: reinforced concrete, steel
  concreteKgM3: 2500,
  steelKgM3: 7850,
  // our bedframe's irons, channels as tall as the frame (the 3D's: flange 70, flange 9, web 7) [mm]; plates under the
  // mounts as drawn [mm]; our bedplate's legs, square tube 80 × 80 × 4 [kg/m]
  ironTf: 9,
  ironTw: 7,
  plateL: 180,
  plateW: 120,
  legKgM: 9.2,
} as const;

export type CostanteMasse = keyof typeof KM;

const it = (x: number): string => String(x).replace('.', ',');

export const VOCI_MASSE: readonly VoceImpianto[] = [
  {
    id: 'impianto.massa.argano', titolo: 'Massa dell’argano nei carichi sull’edificio',
    valore: 'la massa di catalogo dice cose diverse secondo il costruttore (tutto l’argano; senza volano e puleggia; il solo riduttore, senza '
      + 'motore, volano e puleggia): nei carichi sull’edificio entra l’argano completo, aggiungendo la stima di ciò che manca — il motore dalla '
      + `sua potenza (asincrono IEC a 4 poli in ghisa: ${KM.motorKg.map(([kw, kg]) => `${it(kw)} kW ${kg} kg`).join(', ')}), la puleggia `
      + `${it(KM.sheaveKgMm2)} kg per mm di diametro primitivo e per mm di larghezza (le gole al loro passo — ${KM.groovePitch.map(([d, p]) => `fino a Ø ${d} `
      + `passo ${p}`).join(', ')} mm — più ${KM.sheaveRims} mm di bordi, almeno ${KM.sheaveWidthMin} mm), il volano ${KM.flywheelKg} kg; nel tiro sugli `
      + 'ancoraggi della macchina in basso conta solo la massa di catalogo (il limite inferiore, a favore di sicurezza); la massa inserita a mano, '
      + 'diversa da quella del catalogo, è presa come argano completo. Il modello è quello proposto dal catalogo o, con l’argano inserito a mano '
      + '(anche dal calcolatore della sostituzione al progetto completo), quello che i valori del calcolo riconoscono — rapporto, carico statico, '
      + 'massa e puleggia, come la relazione lo nomina: lo stesso argano pesa lo stesso nel progetto, nel foglio 1, nella relazione e nella sostituzione',
    riferimento: 'UNI EN 81-20:2020, 5.2.1.8.1 (carichi della macchina sulla struttura)',
    fonte: 'definizioni delle masse nei documenti dei costruttori (ricerca, capitolo 17: Sassi senza volano e puleggia, LEO senza puleggia, '
      + 'Montanari massa del riduttore, PENTA e M105 con il motore); pulegge e volani dal catalogo Sassi REV 2023/01 (da 24 kg a Ø 450 × 80 a 135 kg a '
      + 'Ø 800 × 180; volani fino a 20,7 kg); motori: masse tipiche dei cataloghi dei motori asincroni in ghisa', stato: 'stima',
    costanti: ['motorKg', 'sheaveKgMm2', 'sheaveRims', 'sheaveWidthMin', 'groovePitch', 'flywheelKg'],
    nota: 'la stima si sostituisce con la massa dell’argano completo dalla scheda del costruttore; fino a LIFT 1.28.0 e ROOM 1.12.0 la massa di '
      + 'catalogo entrava come quella dell’argano completo anche dove era il solo riduttore',
  },
  {
    id: 'impianto.massa.basamento', titolo: 'Peso proprio del basamento sulla soletta',
    valore: 'sulla soletta, oltre all’argano, il peso proprio di ciò che lo porta, con la geometria dei disegni: il telaio del software sotto un '
      + `argano di catalogo (tre ferri a C alti quanto il telaio, ali di 70 mm, spessori ${KM.ironTf} e ${KM.ironTw} mm, con le traverse), il telaio di `
      + `profilati (tre profilati e le due traverse), le putrelle (fra i muri con l’appoggio), le piastre sotto gli appoggi (${KM.plateL} × ${KM.plateW} mm), `
      + `il plinto in calcestruzzo (${KM.concreteKgM3} kg/m³, i due blocchi), il telaio con rinvio del software (travi UPN 160, gambe di tubo quadro da `
      + `${it(KM.legKgM)} kg/m, la puleggia di rinvio stimata come la puleggia di frizione), la puleggia sul suo supporto; acciaio ${KM.steelKgM3} kg/m³; `
      + 'il telaio con rinvio del costruttore con la sua massa di catalogo; le putrelle HEB sui muri del vano con la loro. Nel carico statico '
      + 'del foglio 1 (P9) e della relazione, senza coefficiente dinamico; nelle verifiche delle travi il peso proprio delle travi verificate '
      + 'è già nella verifica',
    riferimento: 'UNI EN 81-20:2020, 5.2.1.8.1', fonte: 'masse dei profilati EN 10365 (catalogo del software); calcestruzzo armato 25 kN/m³; '
      + 'geometria dei disegni del software', stato: 'scelta',
    costanti: ['concreteKgM3', 'steelKgM3', 'ironTf', 'ironTw', 'plateL', 'plateW', 'legKgM'],
    nota: 'fino a LIFT 1.28.0 e ROOM 1.12.0 il totale sulla soletta (P9) e la riga «Argano e telaio» contavano solo l’argano (e il telaio con '
      + 'rinvio del costruttore): plinto, telaio, putrelle e telaio con rinvio del software ne restavano fuori',
  },
];
