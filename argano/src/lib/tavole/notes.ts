// Texts of the drawing set that are not numbers of the calculation: the notes for the client on sheet 1 (our own
// wording: what the building owes the installation, with the numbers of the registry), the legend of the spaces for
// the maintenance person and of the overtravels, and the posture of each refuge type. Italian, like the drawings.
import type { SymbolName } from '@/drawing';
import { KV_VERT } from '@/shaft/norme-vert';
import type { Layout } from '@/shaft/types';
import { P_ESTIMATE_RULE } from '../lift/marks';
import type { Fmt } from '../present/tr';

const POSTURE: Readonly<Record<1 | 2 | 3, string>> = { 1: 'IN PIEDI', 2: 'ACCUCCIATO', 3: 'DISTESO' };

/** A refuge space in words: type, plan and height. */
function refuge(type: 1 | 2 | 3): string {
  const [w, d] = KV_VERT.refugePlan[type];
  return `TIPO ${type} (${POSTURE[type]}): ${w} × ${d} mm, ALTO ${KV_VERT.refugeH[type]} mm`;
}

export interface Note {
  title: string;
  tag: string;
  text: string;
}

/** Notes for the client: the shaft always; the machine room when the design has one; the control cabinet. */
export function clientNotes(L: Layout): Note[] {
  const K = KV_VERT, room = L.inputs.room !== null;
  const notes: Note[] = [
    {
      title: 'VANO DI CORSA', tag: 'NOTA 1',
      text: "Le strutture dell'edificio (pareti del vano, soletta superiore, pavimento della fossa) devono sopportare i carichi di questo foglio, "
        + 'che non agiscono insieme, e gli ancoraggi delle staffe delle guide: la verifica strutturale spetta al committente tramite il suo tecnico. '
        + "Il vano serve solo all'ascensore: nessun cavo, tubazione o impianto estraneo al suo servizio. Ventilazione e aperture di aerazione "
        + "del vano secondo le norme edilizie e di prevenzione incendi dell'edificio, da concordare prima dei lavori. Illuminazione fissa del vano: "
        + `almeno ${K.wellLux} lux a 1 m sopra il tetto della cabina e sopra il pavimento della fossa, ${K.wellLuxElse} lux altrove. Fossa asciutta, `
        + "protetta dalle infiltrazioni d'acqua, con accesso sicuro dalla porta di piano più bassa. Riferimenti: UNI EN 81-20:2020, punto 5.2; DPR 162/1999.",
    },
  ];
  if (room) {
    notes.push({
      title: 'LOCALE DEL MACCHINARIO E DELLE PULEGGE DI RINVIO', tag: 'NOTA 2',
      text: 'Accesso sicuro e agevole, riservato alle persone autorizzate; porta di almeno '
        + `${K.doorMinW} × ${K.doorMinH} mm con serratura a chiave, apribile dall'interno senza chiave. Altezza libera di almeno ${K.roomH} mm `
        + `nelle zone di lavoro; davanti al quadro una superficie libera profonda almeno ${K.panelFreeDepth} mm e larga almeno ${K.panelFreeWidth} mm. `
        + `Illuminazione fissa di almeno ${K.roomLux} lux al pavimento nelle zone di lavoro. Temperatura ambiente tra +${K.tempMin} °C e +${K.tempMax} °C, `
        + "con ventilazione che protegga motore e apparecchiature da polvere e umidità; l'aria di locali estranei all'ascensore non va convogliata nel "
        + "locale, che contiene solo l'impianto. Sopra la macchina un gancio o una trave di sollevamento con il carico ammesso indicato; interruttore "
        + "generale e comando della luce vicino all'accesso. Riferimenti: UNI EN 81-20:2020, punti 5.2 e 5.10.",
    });
  }
  notes.push({
    title: 'ARMADIO DEL QUADRO (SE PRESENTE)', tag: room ? 'NOTA 3' : 'NOTA 2',
    text: "Il quadro di manovra fuori dal locale del macchinario va in un armadio chiuso a chiave, accessibile solo alle persone autorizzate, "
      + `in un luogo asciutto e pulito, protetto dalle intemperie, con temperatura interna tra +${K.tempMin} °C e +${K.tempMax} °C e uno spazio libero `
      + "davanti all'armadio aperto. Riferimenti: UNI EN 81-20:2020, punto 5.2.",
  });
  return notes;
}

/** The car weight was not entered: the sheet carries the software's estimate, to be replaced before the works. */
export const estimateNote = (P: string, tag: string): Note => ({
  title: 'DATI STIMATI DAL SOFTWARE', tag,
  text: `Il peso totale della cabina (${P} kg) non è stato inserito: è la stima del software (${P_ESTIMATE_RULE}). Contrappeso, aderenza, `
    + 'funi e carichi P1-P9 di questo foglio ne dipendono: prima dei lavori va sostituito con il peso reale (libretto dell\'impianto, costruttore '
    + 'della cabina o prova di bilanciamento) e il calcolo va ripetuto.',
});

export interface LegendItem {
  sym: SymbolName;
  text: string;
}

/** The spaces for the maintenance person of this design (sheet 1 and the drawings). */
export function spaceLegend(L: Layout, fmt: Fmt): { free: LegendItem; top: LegendItem; pit: LegendItem } {
  const V = L.inputs.vertical, K = KV_VERT;
  return {
    free: { sym: 'dot', text: `SUPERFICIE LIBERA SUL TETTO DI CABINA: ALMENO ${fmt(K.roofFreeArea, 2)} m², LATO MINORE ${K.roofFreeSide} mm` },
    top: { sym: 'tri', text: `SPAZIO DI RIFUGIO SUL TETTO DI CABINA, ${refuge(V.topRefuge)}` },
    pit: { sym: 'square', text: `SPAZIO DI RIFUGIO IN FOSSA, ${refuge(V.pitRefuge)}` },
  };
}

export const OVER_UP: LegendItem = { sym: 'overUp', text: 'EXTRACORSA SUPERIORE DELLA CABINA' };
export const OVER_DOWN: LegendItem = { sym: 'overDown', text: 'EXTRACORSA INFERIORE DELLA CABINA' };
