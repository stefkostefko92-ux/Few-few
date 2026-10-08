// Texts of the drawing set that are not numbers of the calculation: the notes for the client on sheet 1 (our own
// wording: what the building owes the installation, with the numbers of the registry), the legend of the spaces for
// the maintenance person and of the overtravels, and the posture of each refuge type. Italian, like the drawings.
import type { SymbolName } from '@/drawing';
import { KV_VERT } from '@/shaft/norme-vert';
import type { Layout } from '@/shaft/types';
import { P_ESTIMATE_RULE } from '../lift/marks';
import type { Fmt } from '../present/tr';
import type { LiftUse, SafetyGear } from './forces';
import { railLimits, type RailCheck } from './rail-check';

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
/** `below`: the machine stands below (its room at the lowest floor or under the pit): the room over the shaft holds the
 *  diverting pulleys only. `detail`: the sentences on the pit, the sills, the counterweight's sign and the brackets'
 *  anchors (notes-vano.ts), in NOTA 1 before its references. */
export function clientNotes(L: Layout, below = false, detail = ''): Note[] {
  const K = KV_VERT, room = L.inputs.room !== null;
  const notes: Note[] = [
    {
      title: 'VANO DI CORSA', tag: 'NOTA 1',
      text: "Le strutture dell’edificio (pareti del vano, soletta superiore, pavimento della fossa) devono sopportare i carichi di questo foglio, "
        + 'che non agiscono insieme, e gli ancoraggi delle staffe delle guide: la verifica strutturale spetta al committente tramite il suo tecnico. '
        + "Il vano serve solo all’ascensore: nessun cavo, tubazione o impianto estraneo al suo servizio. Ventilazione e aperture di aerazione "
        + "del vano secondo le norme edilizie e di prevenzione incendi dell’edificio, da concordare prima dei lavori. Illuminazione fissa del vano: "
        + `almeno ${K.wellLux} lux a un metro dal tetto di cabina e dal fondo della fossa, ${K.wellLuxElse} lux nel resto del vano. Fossa asciutta, `
        + `protetta dalle infiltrazioni d’acqua, con accesso sicuro dalla porta di piano più bassa. ${detail}Riferimenti: UNI EN 81-20:2020, punto 5.2`
        + `${detail ? ' (5.2.1.5.1, 5.2.2.4, 5.2.5.3.2, 5.2.5.7.1, 5.2.5.8.1)' : ''}; DPR 162/1999.`,
    },
  ];
  if (room) notes.push({ ...roomNote(below ? 'pulleys' : 'machine'), tag: 'NOTA 2' });
  notes.push({
    title: 'ARMADIO DEL QUADRO (SE PRESENTE)', tag: room ? 'NOTA 3' : 'NOTA 2',
    text: "Il quadro di manovra fuori dal locale macchina va in un armadio chiuso a chiave, accessibile solo alle persone autorizzate, "
      + `in un luogo asciutto e pulito, protetto dalle intemperie, con temperatura interna tra +${K.tempMin} °C e +${K.tempMax} °C e uno spazio libero `
      + "davanti all’armadio aperto. Riferimenti: UNI EN 81-20:2020, punto 5.2.",
  });
  return notes;
}

/** The note on the room of the machinery: a new machine room (`machine`), the room of the diverting pulleys over the
 *  shaft of a machine below (`pulleys`), or the existing machine room of a modification (`existing`, UNI 10411-1/-11:2024,
 *  9.2): access, door, heights, free areas, light, temperature, openings, lifting point, switches. */
export function roomNote(kind: 'machine' | 'pulleys' | 'existing'): Omit<Note, 'tag'> {
  const K = KV_VERT;
  const access = 'Accesso sicuro e agevole, riservato alle persone autorizzate; ';
  const ambient = `Illuminazione fissa di almeno ${K.roomLux} lux al pavimento nelle zone di lavoro. Temperatura ambiente tra +${K.tempMin} °C e `
    + `+${K.tempMax} °C, con ventilazione che protegga motore e apparecchiature da polvere e umidità; l’aria di locali estranei all’ascensore non va `
    + 'convogliata nel locale, che contiene solo l’impianto. Aperture nella soletta sopra il vano ridotte al minimo, con manicotti o bordi che sporgono '
    + `almeno ${K.slabKerb} mm dal pavimento. `;
  const panel = `davanti al quadro una superficie libera profonda almeno ${K.panelFreeDepth} mm e larga almeno ${K.panelFreeWidth} mm; accanto alla `
    + `macchina una superficie libera di ${K.maintW} × ${K.maintD} mm per la manutenzione e la manovra di emergenza. `;
  if (kind === 'pulleys') {
    return {
      title: 'LOCALE DELLE PULEGGE DI RINVIO',
      text: `${access}porta di almeno ${K.doorMinW} × ${K.pulleyDoorH} mm con serratura a chiave, apribile dall’interno senza chiave, e un dispositivo `
        + `di arresto presso ogni accesso. Percorsi alti almeno ${K.pulleyRoomH} mm fino alle pulegge, una superficie libera di ${K.maintW} × `
        + `${K.maintD} mm dove si lavora, almeno ${K.pulleyAbove} mm liberi sopra le pulegge non protette. ${ambient}Sopra le pulegge un gancio o una `
        + 'trave di sollevamento con il carico ammesso indicato; comando della luce vicino all’accesso. Il locale della macchina, in basso, ha i '
        + `requisiti del locale del macchinario: porta di almeno ${K.doorMinW} × ${K.doorMinH} mm, altezza libera di almeno ${K.roomH} mm nelle zone di `
        + `lavoro, ${panel}interruttore generale vicino all’accesso. Riferimenti: UNI EN 81-20:2020, punti 5.2, 5.10 e 5.12.1.11.`,
    };
  }
  if (kind === 'existing') {
    return {
      title: 'LOCALE DELLA MACCHINA (ESISTENTE)',
      text: 'Attorno alla macchina nuova il locale segue la UNI EN 81-20 5.2.6.3 (UNI 10411-1:2024 e UNI 10411-11:2024, punto 9.2): '
        + `${panel}L’altezza libera esistente sulle zone di lavoro può restare sotto ${K.roomH} mm se non si riduce; con la UNI 10411-1, sotto `
        + `${K.existingRoomMin} mm zone segnalate a strisce gialle e nere o con un cartello, materiale ammortizzante al soffitto e almeno `
        + `${K.existingRoomPad} mm liberi sotto di esso (UNI EN 81-21:2022, 5.9). Porta e accesso restano quelli esistenti. ${ambient}Sopra la `
        + 'macchina un gancio o una trave di sollevamento con il carico ammesso indicato; interruttore generale e comando della luce vicino '
        + 'all’accesso. Riferimenti: UNI EN 81-20:2020, punti 5.2 e 5.10; UNI 10411-1:2024 e UNI 10411-11:2024, punto 9.2.',
    };
  }
  return {
    title: 'LOCALE DELLA MACCHINA E DEI RINVII',
    text: `${access}porta di almeno ${K.doorMinW} × ${K.doorMinH} mm con serratura a chiave, apribile dall’interno senza chiave. Altezza libera di `
      + `almeno ${K.roomH} mm nelle zone di lavoro; ${panel}${ambient}Sopra la macchina un gancio o una trave di sollevamento con il carico ammesso `
      + 'indicato; interruttore generale e comando della luce vicino all’accesso. Riferimenti: UNI EN 81-20:2020, punti 5.2 e 5.10.',
  };
}

/** The car weight was not entered: the sheet carries the software's estimate, to be replaced before the works. */
export const estimateNote = (P: string, tag: string): Note => ({
  title: 'DATI STIMATI DAL SOFTWARE', tag,
  text: `Il peso totale della cabina (${P} kg) non è stato inserito: è la stima del software (${P_ESTIMATE_RULE}). Contrappeso, aderenza, `
    + 'funi e carichi P1-P9 di questo foglio ne dipendono: prima dei lavori va sostituito con il peso reale (libretto dell’impianto, costruttore '
    + 'della cabina o prova di bilanciamento) e il calcolo va ripetuto.',
});

/** The car's safety gear not given in the data of the installation: P5 and the forces on the rails are those of a
 *  progressive one (UNI EN 81-50:2020, 5.10). */
export const safetyGearNote = (tag: string): Note => ({
  title: 'PARACADUTE DI CABINA', tag,
  text: `Il tipo di paracadute della cabina non è indicato nei dati dell’impianto: il carico P5 e le forze sulle guide di questo foglio sono `
    + `calcolati con il paracadute progressivo (coefficiente d’urto ${KV_VERT.k1Progressive}; a presa istantanea a rullo ${KV_VERT.k1Roller}, istantanea `
    + `${KV_VERT.k1Instant}: UNI EN 81-50:2020, 5.10). Con un paracadute diverso va indicato nei dati e le tavole vanno emesse di nuovo.`,
});

const GEAR: Readonly<Record<SafetyGear, string>> = { progressive: 'progressivo', roller: 'a presa istantanea a rullo', instantaneous: 'a presa istantanea' };
const USE: Readonly<Record<LiftUse, string>> = {
  passengers: 'ascensore per persone', goods: 'per merci accompagnate', goodsHeavy: 'per merci accompagnate con mezzi di carico pesanti',
};

/** The check of the car rails in numbers, with what it assumes and what it leaves out (registry guide.verifica). */
export function railNote(R: RailCheck, rail: string, gear: SafetyGear, use: LiftUse | undefined, tag: string, fmt: Fmt): Note {
  const K = KV_VERT, s = (x: number | null): string => (x === null ? '—' : fmt(x, 0)), lim = railLimits();
  // the factor as the standard writes it (0,4, 0,6, 0,85) and what it follows: the lift's use, or the rated load
  const sill = `${fmt(R.load.sill, Math.round(R.load.sill * 100) % 10 ? 2 : 1)}·g·Q alla soglia, ${use ? USE[use] : 'secondo la portata'}`;
  return {
    title: 'VERIFICA DELLE GUIDE DI CABINA', tag,
    text: `Guide ${rail} in acciaio con Rm ${K.railRm} N/mm² (ipotesi del software), staffe al più ogni ${fmt(R.l, 0)} mm: λ = ${fmt(R.lambda, 0)}, `
      + `ω = ${R.omega === null ? 'oltre la tabella (λ > 250)' : fmt(R.omega, 2)}. Paracadute ${GEAR[gear]}: σm ${s(R.gear.sm)}, σ ${s(R.gear.s)}, σc `
      + `${s(R.gear.sc)} N/mm² (ammissibile Rm/${fmt(K.railStGear, 1)} = ${fmt(lim.gear, 1)}); marcia: σ ${s(R.run.s)}; carico al piano (${sill}): `
      + `σ ${s(R.load.s)} N/mm² (ammissibile Rm/${fmt(K.railStRun, 2)} = ${fmt(lim.use, 1)}); suola σF ${s(R.flange.gear)} N/mm² col paracadute, `
      + `${s(R.flange.use)} in uso; frecce δx ${fmt(R.dx, 1)} mm, δy ${fmt(R.dy, 1)} mm (al più ${K.railDeflection}). Non contate: la spinta di `
      + 'scorrimento delle staffe, le apparecchiature appese alle guide, le frecce di staffe ed edificio e le guide del contrappeso. '
      + 'Riferimenti: UNI EN 81-50:2020, 5.10; UNI EN 81-20:2020, 5.7.',
  };
}

export interface LegendItem {
  sym: SymbolName;
  text: string;
}

/** The spaces for the maintenance person of this design (sheet 1 and the drawings). */
export function spaceLegend(L: Layout, fmt: Fmt): { free: LegendItem; top: LegendItem; pit: LegendItem } {
  const V = L.inputs.vertical, K = KV_VERT;
  return {
    free: { sym: 'dot', text: `POSTO IN PIEDI SUL TETTO DI CABINA: AREA DA ${fmt(K.roofFreeArea, 2)} m² CON LATO MINORE OLTRE ${K.roofFreeSide} mm, SOPRA L’ALTEZZA DEL RIFUGIO` },
    top: { sym: 'tri', text: `SPAZIO DI RIFUGIO SUL TETTO DI CABINA, ${refuge(V.topRefuge)}` },
    pit: { sym: 'square', text: `SPAZIO DI RIFUGIO IN FOSSA, ${refuge(V.pitRefuge)}` },
  };
}

export const OVER_UP: LegendItem = { sym: 'overUp', text: 'EXTRACORSA SUPERIORE DELLA CABINA' };
export const OVER_DOWN: LegendItem = { sym: 'overDown', text: 'EXTRACORSA INFERIORE DELLA CABINA' };
