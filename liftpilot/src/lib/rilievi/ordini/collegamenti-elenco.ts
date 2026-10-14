// The linked data — THE LIST: one and the same thing of the plant written in more than one place — in the sheet, in the
// panel order (Pelazza `oq` or MoviLift `om` — by the make, never both), in the argano data sheet (`pa`) and in 2SG's
// sheet (`sg`). Every place the person has not typed in is filled from the others — in every direction and while typing
// (collegati-client.ts in the browser); different values are compared (collegati.ts). The types and the start check are
// in collegamenti.ts.
//
// The order of the places is the order of the sources: first the sheet, then the panel, the argano and 2SG. The order of
// the links is the order in the list of discrepancies (and in the fingerprint of the confirmation) — new ones go last.
// Decided with the owner (October 2026): the stops, the speed and its kind, the travel, the load, the motor's and the
// brake's voltage — plus the earlier prefill from the sheet (doors, accesses, machine position, ropes). MoviLift and the
// argano sheet write the capacity and the lift's number too; MoviLift — the car's entrances too. Then (October 2026,
// "every field with the same parameters"): the address, the matricola and the make (the argano sheet), the kind of plant
// (Pelazza «Idraulico»), 2SG's doors, the operator (make, voltage) and the clear opening, the motor's current and speed.
// Ported 1:1 from rilievi (src/ordini/collegamenti-elenco.ts, commit ae6329cb6).
import type { Collegamento } from './collegamenti';

export const COLLEGAMENTI: readonly Collegamento[] = [
  {
    // «Piani n°» of the argano sheet are the stops.
    key: 'fermate',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'fermate' },
      { luogo: 'oq', campo: 'nFermate' },
      { luogo: 'om', campo: 'fermate' },
      { luogo: 'pa', campo: 'piani' },
    ],
  },
  {
    key: 'velocita',
    tipo: 'numero',
    membri: [
      { luogo: 'oq', campo: 'velocita' },
      { luogo: 'om', campo: 'velocita' },
      { luogo: 'pa', campo: 'velocita' },
    ],
  },
  {
    // The panel's «1/2 Velocità, VVVF» ↔ the argano's motor AC1/AC2/Inverter.
    key: 'tipoVelocita',
    tipo: 'scelta',
    membri: [
      { luogo: 'oq', voci: { tq1Velocita: '1V', tq2Velocita: '2V', tqVvvfAperto: 'VVVF', tqVvvfChiuso: 'VVVF' } },
      { luogo: 'pa', voci: { motoreAc1: '1V', motoreAc2: '2V', motoreInverter: 'VVVF' } },
    ],
  },
  {
    key: 'corsa',
    tipo: 'numero',
    membri: [
      { luogo: 'oq', campo: 'corsa' },
      { luogo: 'om', campo: 'corsa' },
      { luogo: 'pa', campo: 'corsa' },
    ],
  },
  {
    key: 'portata',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'portataKg' },
      { luogo: 'om', campo: 'portata' },
      { luogo: 'pa', campo: 'portata' },
    ],
  },
  {
    key: 'capienza',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'capienzaPersone' },
      { luogo: 'om', campo: 'capienza' },
      { luogo: 'pa', campo: 'persone' },
    ],
  },
  {
    key: 'numeroImpianto',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'numeroImpianto' },
      { luogo: 'om', campo: 'nImpianto' },
      { luogo: 'pa', campo: 'nImpianto' },
    ],
  },
  {
    // MoviLift: «Tens.» in the argano's data («Fune»). Their «Freno» does not say whether it is a voltage.
    key: 'tensioneMotore',
    tipo: 'numero',
    membri: [
      { luogo: 'oq', campo: 'motVca' },
      { luogo: 'om', campo: 'tensFune' },
    ],
  },
  {
    key: 'tensioneFreno',
    tipo: 'numero',
    membri: [
      { luogo: 'oq', campo: 'circuitoFrenoVcc' },
      { luogo: 'pa', campo: 'tensioneFreno' },
    ],
  },
  {
    // The operator 2SG supplies (the car's) is for automatic or semi-automatic doors.
    key: 'porte',
    tipo: 'scelta',
    membri: [
      { luogo: 'scheda', campo: 'tipoPorte', voci: { AUTOMATICHE: 'AUTOMATICHE', SEMIAUTOMATICHE: 'SEMIAUTOMATICHE', MANUALI: 'MANUALI' } },
      { luogo: 'oq', voci: { porteAutomatiche: 'AUTOMATICHE', porteSemiautomatiche: 'SEMIAUTOMATICHE', porteManuali: 'MANUALI' } },
      { luogo: 'sg', voci: { automatico: 'AUTOMATICHE', semiautomatico: 'SEMIAUTOMATICHE' } },
    ],
  },
  {
    // «Accessi: 2» in the sheet = 2 accesses in the order.
    key: 'accessi',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'doppioAccesso', valori: { si: '2', no: '1' } },
      { luogo: 'oq', campo: 'nAccessi' },
    ],
  },
  {
    // The same for MoviLift: the radio «Operatore Unico / Doppio Ingresso (Selezionato)».
    key: 'ingressi',
    tipo: 'scelta',
    membri: [
      { luogo: 'scheda', campo: 'doppioAccesso', voci: { no: 'UNICO', si: 'DOPPIO' } },
      { luogo: 'om', campo: 'ingressi', voci: { unico: 'UNICO', doppio: 'DOPPIO', doppioSelezionato: 'DOPPIO' } },
    ],
  },
  {
    // On the argano sheet the machine's position is text («Macchina basso/alto») — filled from the survey (`prefill`),
    // not compared.
    key: 'macchina',
    tipo: 'scelta',
    membri: [
      { luogo: 'scheda', campo: 'ubicazioneMacchina', voci: { ALTO: 'ALTO', BASSO: 'BASSO' } },
      { luogo: 'om', campo: 'locMacc', voci: { alto: 'ALTO', basso: 'BASSO' } },
    ],
  },
  {
    key: 'funiNumero',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'funiNumero' },
      { luogo: 'pa', campo: 'funiN' },
    ],
  },
  {
    key: 'funiDiametro',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'funiDiametroMm' },
      { luogo: 'pa', campo: 'funiDiametro' },
    ],
  },
  {
    key: 'funiTrefoli',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'funiTrefoli' },
      { luogo: 'pa', campo: 'trefoli' },
    ],
  },
  {
    key: 'indirizzo',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'indirizzo' },
      { luogo: 'pa', campo: 'indirizzo' },
    ],
  },
  {
    key: 'matricola',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'matricola' },
      { luogo: 'pa', campo: 'matricola' },
    ],
  },
  {
    key: 'marca',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'marca' },
      { luogo: 'pa', campo: 'marca' },
    ],
  },
  {
    // «Idraulico» in Pelazza's «Tipo di Quadro»; the electric one and MRL have no tick of their own there.
    key: 'tipoImpianto',
    tipo: 'scelta',
    membri: [
      { luogo: 'scheda', campo: 'tipoImpianto', voci: { ELETTRICO: 'ELETTRICO', IDRAULICO: 'IDRAULICO', GEARLESS: 'GEARLESS' } },
      { luogo: 'oq', voci: { tqIdraulico: 'IDRAULICO' } },
    ],
  },
  {
    // Pelazza's «Modello» is often more detailed than the make («Selcom Midi Supra») — prefill only.
    key: 'operatoreMarca',
    tipo: 'numero',
    confronto: false,
    membri: [
      { luogo: 'scheda', campo: 'operatoreMarca' },
      { luogo: 'oq', campo: 'opModello' },
      { luogo: 'om', campo: 'marcaOpA' },
    ],
  },
  {
    key: 'operatoreTensione',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'operatoreTensione' },
      { luogo: 'om', campo: 'voltA' },
    ],
  },
  {
    // The sheet's «Luce porte» is free text («800 x 2000», «800») — on 2SG it is width x height of the car door. Prefill
    // only: «800» against «800 x 2000» is no difference.
    key: 'lucePorte',
    tipo: 'numero',
    confronto: false,
    membri: [
      { luogo: 'scheda', campo: 'lucePorte' },
      { luogo: 'sg', campi: ['luceCabinaL', 'luceCabinaH'] },
    ],
  },
  {
    // The motor's current: Pelazza's «In (A)», «Amp.» in MoviLift's «Fune», the argano's «Corrente (A)».
    key: 'correnteMotore',
    tipo: 'numero',
    membri: [
      { luogo: 'oq', campo: 'motIn' },
      { luogo: 'om', campo: 'amp' },
      { luogo: 'pa', campo: 'ampere' },
    ],
  },
  {
    key: 'giriMotore',
    tipo: 'numero',
    membri: [
      { luogo: 'om', campo: 'numGiri' },
      { luogo: 'pa', campo: 'giri' },
    ],
  },
];
