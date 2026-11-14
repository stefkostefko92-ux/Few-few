// Writes the map of the GEAT panel order form the owner of the portal sent (12 November 2026: "add this
// option to the choice of panels") — assets/moduli/geat-modulo-quadro.json. The PDF is the vendor's own
// fillable form (Acrobat, two pages), unchanged; this script reads its fields with pdf-lib and checks every
// name, every kind and every "on" state of the radio groups against the labels below (taken from the sheet,
// in Italian, in the order of the sheet). A field or a state that is not in the PDF, a state with no label
// here, or a field of the PDF with no place in the map, stops the script. The "Ripulisci i campi" button
// never reaches the printed sheet (`pulizia`).
//
//   npm run moduli:geat      (then commit the map: it pins its PDF by SHA-256)
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFCheckBox, PDFDocument, PDFRadioGroup, PDFTextField } from 'pdf-lib';

const ASSETS = join(import.meta.dirname, '..', '..', 'assets', 'moduli');
const FILE = 'geat-modulo-quadro.pdf';

const bytes = readFileSync(join(ASSETS, FILE));
const doc = await PDFDocument.load(bytes);
const campi = new Map(
  doc
    .getForm()
    .getFields()
    .map((f) => [f.getName(), f]),
);
const usati = new Set();

function prendi(acro, Tipo) {
  const f = campi.get(acro);
  if (!(f instanceof Tipo)) throw new Error(`${FILE}: «${acro}» is not a ${Tipo.name}`);
  if (usati.has(acro)) throw new Error(`${FILE}: «${acro}» used twice`);
  usati.add(acro);
  return f;
}

/** Text: the length — what fits in the box at about 6 pt, and never under 40. */
function testo(acro, key, label, extra = {}) {
  const f = prendi(acro, PDFTextField);
  const width = f.acroField.getWidgets()[0].getRectangle().width;
  // At least 40: the boxes are small, and a linked value (a long matricola) is never refused — on the
  // sheet a long text is shortened with "…" (src/ordini/pdf-testo.ts).
  const maxLength = Math.max(40, Math.min(200, Math.round(width / 3.2)));
  return { key, kind: 'text', label, acro, maxLength, ...extra };
}

function spunta(acro, key, label, extra = {}) {
  prendi(acro, PDFCheckBox);
  return { key, kind: 'check', label, acro, ...extra };
}

/** A radio group of the PDF: [state, value, label] for every button, in the order of the sheet. */
function scelta(acro, key, label, voci, extra = {}) {
  const f = prendi(acro, PDFRadioGroup);
  const presenti = f.getOptions();
  for (const [stato] of voci)
    if (!presenti.includes(stato)) throw new Error(`${FILE}: «${acro}» has no state ${stato}`);
  const mancanti = presenti.filter((s) => !voci.some(([stato]) => stato === s));
  if (mancanti.length) throw new Error(`${FILE}: «${acro}» — states without a label: ${mancanti}`);
  return {
    key,
    kind: 'radio',
    label,
    acro,
    opzioni: voci.map(([stato, valore, etichetta]) => ({ valore, label: etichetta, stato })),
    ...extra,
  };
}

const riga = (...c) => ({ campi: c });
const conTitolo = (titolo, ...c) => ({ titolo, campi: c });
const SI_NO = [
  ['Si', 'si', 'Sì'],
  ['No', 'no', 'No'],
];
const AUTO_MANUALE = [
  ['Auto', 'auto', 'Auto'],
  ['Manuale', 'manuale', 'Manuale'],
];

const gruppi = [
  {
    titolo: 'Modulo',
    righe: [
      riga(
        scelta(
          'Tipo Modulo',
          'tipoModulo',
          'Modulo',
          [
            ['Preventivo', 'preventivo', 'Preventivo'],
            ['Ordine', 'ordine', 'Ordine'],
          ],
          { predefinito: 'ordine' },
        ),
      ),
    ],
  },
  {
    titolo: 'Cliente',
    righe: [
      riga(testo('Cliente', 'cliente', 'Cliente', { prefill: 'societaNome' })),
      riga(testo('RiferimentoCliente', 'rifCliente', 'Rif. cliente', { prefill: 'rif' })),
      riga(testo('Quantita', 'quantita', 'Quantità')),
      riga(
        testo('Data', 'data', 'Data', { prefill: 'data' }),
        testo('Consegna', 'consegna', 'Consegna'),
      ),
      riga(testo('RiferimentoGeat', 'rifGeat', 'Rif. GEAT')),
      riga(
        testo('Matricola', 'matricola', 'Matricola'),
        testo('Impianto', 'nImpianto', 'Impianto'),
      ),
      riga(testo('Portata', 'portata', 'Portata'), testo('Capienza', 'capienza', 'Capienza')),
    ],
  },
  {
    titolo: 'Manovra',
    righe: [
      riga(
        spunta('Universale', 'universale', 'Universale'),
        spunta('UomoPresente', 'uomoPresente', 'Uomo presente'),
        spunta('PrenotazioneDiscesa', 'prenotazioneDiscesa', 'Prenotazione discesa'),
        spunta('PrenotazioneCompleta', 'prenotazioneCompleta', 'Prenotazione completa'),
      ),
      riga(
        spunta('Duplex', 'duplex', 'Duplex'),
        spunta('Triplex', 'triplex', 'Triplex'),
        spunta('Quadruplex', 'quadruplex', 'Quadruplex'),
        spunta('Pompieri', 'pompieri', 'Pompieri'),
      ),
    ],
  },
  {
    titolo: 'Impianto',
    righe: [
      riga(
        scelta('Gruppo Impianto', 'tipoImpianto', 'Impianto', [
          ['Funi', 'funi', 'Funi'],
          ['Idraulico', 'idraulico', 'Idraulico'],
          ['Gearless', 'gearless', 'Gearless'],
          ['Geared', 'geared', 'Geared'],
          ['Piattaforma', 'piattaforma', 'Piattaforma'],
        ]),
      ),
      riga(testo('SalaMacchinaAlPiano', 'salaMacchinaPiano', 'Sala macchina al piano')),
      riga(
        scelta('Gruppo sala macchina', 'salaMacchina', 'Sala macchina', [
          ['Alto', 'alto', 'Alto'],
          ['Basso', 'basso', 'Basso'],
          ['MRL', 'mrl', 'MRL'],
        ]),
      ),
    ],
  },
  {
    titolo: 'Sistema di riporto al piano',
    righe: [
      riga(
        scelta('Gruppo Sistema di riporto al piano', 'riporto', 'Sistema di riporto al piano', [
          ['Sbilanciamento', 'sbilanciamento', 'Per sbilanciamento (gearless)'],
          ['Batterie96vdc', 'batterie96', 'Con gruppo batterie a 96 VDC'],
          ['EmergenzaDedicata', 'emergenzaDedicata', 'Con emergenza dedicata della SMS'],
          ['UPS', 'ups', 'Con UPS (per VVVF Alex200Lift)'],
          ['SenzaAperturaPorte', 'senzaAperturaPorte', 'Senza apertura porte'],
          ['ConAperturaPorte', 'conAperturaPorte', 'Con apertura porte'],
        ]),
      ),
      riga(testo('Predisposizione', 'predisposizione', 'Predisposizione')),
    ],
  },
  {
    titolo: 'Normative',
    righe: [
      riga(
        spunta('EN81_1', 'en811', 'EN 81.1'),
        spunta('EN81_2', 'en812', 'EN 81.2'),
        spunta('EN81_21-41', 'en8121', 'EN 81.21/41'),
        spunta('EN81_21-50', 'en8120', 'EN 81.20/50'),
      ),
      riga(
        spunta('EN81_70', 'en8170', 'EN 81.70'),
        spunta('EN81_72', 'en8172', 'EN 81.72'),
        spunta('EN81_73', 'en8173', 'EN 81.73'),
        spunta('EM_A3', 'emA3', 'Em. A3'),
      ),
      riga(testo('TipoEmendamentoA3', 'tipoEmendamentoA3', 'Tipo emendamento A3')),
    ],
  },
  {
    titolo: 'Avviamento',
    righe: [
      riga(
        scelta('Gruppo Avviamento', 'avviamento', 'Avviamento', [
          ['Diretto', 'diretto', 'Diretto'],
          ['StellaTriangolo', 'stellaTriangolo', 'Stella triangolo'],
          ['SoftStart', 'softStart', 'Soft/Start'],
          ['ValvolaElettrica', 'valvolaElettronica', 'Valvola elettronica'],
          ['DueVelocita', 'dueVelocita', '2 velocità'],
          ['VVVFAlex', 'vvvfAlex', 'VVVF Alex 200 Lift'],
          ['VVVFToshiba', 'vvvfToshiba', 'VVVF Toshiba'],
          ['VVVFFuji', 'vvvfFuji', 'VVVF Fuji Frenic Lift'],
        ]),
      ),
      riga(
        spunta('TastierinoFuji', 'tastierinoFuji', 'Tastierino Fuji'),
        testo('TipoAvviamento', 'tipoAvviamento', 'Tipo'),
      ),
    ],
  },
  {
    titolo: 'Motore',
    righe: [
      riga(
        scelta('GruppoMotore', 'tensioneMotore', 'Tensione', [
          ['Motore230Vac', 'v230', '230 VAC'],
          ['Motore400Vac', 'v400', '400 VAC'],
        ]),
        scelta('GruppoFase', 'fase', 'Fase', [
          ['MotoreMonofase', 'monofase', 'Monofase'],
          ['MotoreTrifase', 'trifase', 'Trifase'],
        ]),
      ),
      riga(
        testo('MotoreKW', 'motoreKw', 'kW'),
        testo('MotoreHP', 'motoreHp', 'HP'),
        testo('MotoreCorrenteNominale', 'correnteNominale', 'Corrente nominale'),
        testo('MotoreTensioneFreno', 'tensioneFreno', 'Tensione freno'),
      ),
      riga(
        testo('MotoreVelocita', 'velocita', 'Vel. m/s'),
        testo('MotoreMarca', 'motoreMarca', 'Marca'),
        testo('MotoreModello', 'motoreModello', 'Modello'),
      ),
      riga(
        testo('MotoreNumeroValvole', 'nValvole', 'N. valvole'),
        testo('MotoreTensioneValvole', 'tensioneValvole', 'Tensione valvole'),
      ),
      riga(
        spunta('Encoder', 'encoder', 'Encoder'),
        testo('MotoreEncoder', 'encoderTipo', 'Encoder: tipo'),
      ),
    ],
  },
  {
    titolo: 'Servizi',
    righe: [
      riga(
        testo('ServiziNumeroFermate', 'nFermate', 'N° fermate'),
        testo('ServiziNumeroServizi', 'nServizi', 'N° servizi'),
        testo('ServiziNumeroAccessi', 'nAccessi', 'N° accessi'),
        testo('ServiziPianoPrincipale', 'pianoPrincipale', 'Piano principale'),
      ),
    ],
  },
  {
    titolo: 'Operatore porte',
    righe: [
      riga(
        spunta('OperatoreA', 'operatoreA', 'Operatore A'),
        spunta('OperatoreB', 'operatoreB', 'Operatore B'),
        spunta('OperatoreC', 'operatoreC', 'Operatore C'),
      ),
      riga(
        testo('OperatoreMarca', 'operatoreMarca', 'Marca'),
        testo('OperatoreTensione', 'operatoreTensione', 'Tensione'),
      ),
      riga(
        scelta('GruppoOperatorePortaTipo', 'operatoreTipo', 'Operatore', [
          ['Meccanico', 'meccanico', 'Meccanico'],
          ['Elettronico', 'elettronico', 'Elettronico'],
        ]),
        testo('OperatoreNote', 'operatoreNote', 'Note'),
      ),
      riga(
        scelta('GruppoOperatorePorteCabina', 'porteCabina', 'Porte di cabina', AUTO_MANUALE),
        scelta('GruppoOperatorePortePiano', 'portePiano', 'Porte di piano', AUTO_MANUALE),
      ),
      riga(
        scelta('GruppoOperatorePorteStazionamento', 'stazionamento', 'Stazionamento porte', [
          ['Aperto', 'aperto', 'Aperto'],
          ['Chiuso', 'chiuso', 'Chiuso'],
        ]),
        scelta(
          'GruppoOperatorePorteAlimentato',
          'alimentatoMarcia',
          'Operatore alimentato in marcia',
          SI_NO,
        ),
      ),
      riga(
        scelta('GruppoOperatorePortePattino', 'pattino', 'Pattino', SI_NO),
        testo('PattinoTensione', 'pattinoTensione', 'Pattino: tensione'),
      ),
      riga(
        scelta('GruppoOperatorePorteRallentamento', 'rallentamento', 'Rallentamento porte', SI_NO),
        testo('RallentamentoPorteTensione', 'rallentamentoTensione', 'Rallentamento: tensione'),
      ),
      riga(scelta('GruppoOperatorePorteFineCorsa', 'fineCorsa', 'Fine corsa chiusura', SI_NO)),
      riga(
        scelta('GruppoCellulaBarriera', 'cellula', 'Fotocellula o barriera', [
          ['FotoCellula', 'fotocellula', 'Fotocellula'],
          ['Barriera', 'barriera', 'Barriera'],
        ]),
        testo('BarrieraTensione', 'barrieraTensione', 'Fotocellula o barriera: tensione'),
      ),
    ],
  },
  {
    titolo: 'Sbarchi',
    pagina: 2,
    righe: [
      riga(testo('DenominazionePiani', 'denominazionePiani', 'Denominazione piani')),
      ...Array.from({ length: 12 }, (_, i) => {
        const n = i + 1;
        return conTitolo(
          `Piano ${n}`,
          spunta(`OperatoreA-${n}`, `operatoreA${n}`, 'Operatore A'),
          spunta(`OperatoreB-${n}`, `operatoreB${n}`, 'Operatore B'),
          spunta(`OperatoreC-${n}`, `operatoreC${n}`, 'Operatore C'),
          testo(`Interpiani-${n}`, `interpiano${n}`, 'Interpiano'),
        );
      }),
    ],
  },
  {
    titolo: 'Armadio',
    pagina: 2,
    righe: [
      riga(
        scelta('GruppoAnta', 'anta', 'Anta', [
          ['AntaDx', 'cernieraDx', 'Anta cerniera DX'],
          ['AntaSx', 'cernieraSx', 'Anta cerniera SX'],
        ]),
        scelta('GruppoIP', 'ip', 'Grado IP', [
          ['IP54', 'ip54', 'IP 54 stagno'],
          ['IP65', 'ip65', 'IP 65 stagno'],
        ]),
      ),
      riga(
        testo('Finitura', 'finituraMrl', 'Finitura MRL'),
        testo('ColoreRal', 'coloreRal', 'Colore RAL MRL'),
      ),
    ],
  },
  {
    titolo: 'Display',
    pagina: 2,
    righe: [
      riga(
        testo('DisplayTensione', 'displayTensione', 'Tensione'),
        scelta('GruppoCom', 'displayCom', 'COM', [
          ['ComPiu', 'comPiu', 'COM +'],
          ['ComMeno', 'comMeno', 'COM −'],
        ]),
      ),
      riga(testo('DisplayCollegamento', 'displayCollegamento', 'Collegamento')),
    ],
  },
  {
    titolo: 'Segnalazioni e servizi',
    pagina: 2,
    righe: [
      riga(
        scelta('GruppoPresente', 'presente', 'Presente', [
          ['DaSerratura', 'daSerratura', 'Da serratura'],
          ['DaQuadro', 'daQuadro', 'Da quadro'],
        ]),
      ),
      conTitolo(
        'Allarme',
        spunta('AllarmeRicevuto', 'allarmeRicevuto', 'Ricevuto'),
        spunta('AllarmeAttivato', 'allarmeAttivato', 'Attivato'),
      ),
      riga(
        spunta('AllarmeOccupato', 'occupato', 'Occupato'),
        spunta('AllarmePrenotato', 'prenotato', 'Prenotato'),
      ),
      riga(testo('AltreSegnalazioni', 'altreSegnalazioni', 'Altre segnalazioni')),
    ],
  },
  {
    titolo: 'Sistema di comunicazione',
    pagina: 2,
    righe: [
      riga(
        spunta(
          'ComunicazioneCombinatore',
          'combinatore',
          'Combinatore + terminale cabina + telefono sala macchina',
        ),
      ),
      riga(
        spunta(
          'ComunicazioneTerminaleFossa',
          'terminaleFossa',
          'Terminale fossa con pulsante allarme',
        ),
        spunta(
          'ComunicazioneTerminaleTetto',
          'terminaleTetto',
          'Terminale tetto cabina con pulsante allarme',
        ),
      ),
      riga(
        scelta('GruppoSchedaLinea', 'linea', 'Linea', [
          ['LineaUrbana', 'lineaUrbana', 'Scheda linea urbana'],
          ['Interfaccia', 'interfacciaGsm', 'Interfaccia GSM'],
        ]),
      ),
    ],
  },
  {
    titolo: 'Optional',
    pagina: 2,
    righe: [
      riga(
        spunta('OptionalPrecablato', 'precablato', 'Precablato parte elettrica'),
        spunta('OptionalCloud', 'cloud', 'Cloud - monitoraggio remoto'),
      ),
      riga(
        spunta('OptionalSintesiVocale', 'sintesiVocale', 'Sintesi vocale'),
        spunta('OptionalCitofono', 'citofono', 'Citofono quadro'),
      ),
      riga(
        spunta('OptionalTeleRuttore', 'teleruttore', 'Teleruttore ventola'),
        spunta('OptionalQuadroElettrico', 'quadro3708', 'Quadro elettrico 37/08'),
      ),
      riga(
        spunta('OptionalKitIlluminazione', 'kitIlluminazione', 'Kit illuminazione vano'),
        spunta('OptionalElettroserratura', 'elettroserratura', 'Gestione elettroserratura 24 V'),
      ),
      riga(
        scelta('GruppoTrolley', 'trolley', 'Trolley o contatto', [
          ['Trolley', 'trolley', 'Trolley'],
          ['ContattoStriscio', 'contattoStriscio', 'Contatto a striscio'],
        ]),
      ),
      riga(
        spunta('OptionalScivolo', 'scivolo', 'Scivolo per ogni piano'),
        spunta('OptionalStaffa', 'staffa', 'Staffa su guida per scivolo (per ogni piano)'),
      ),
    ],
  },
  {
    titolo: 'Cabina',
    pagina: 2,
    righe: [
      riga(
        scelta('GruppoCabinaSeriale', 'cabina', 'Cabina', [
          ['Seriale', 'seriale', 'Seriale'],
          ['Tradizionale', 'tradizionale', 'Tradizionale'],
        ]),
      ),
      riga(
        scelta('GruppoColonna', 'colonna', 'Pulsantiera di cabina', [
          ['ColonnaGeat', 'colonnaGeat', 'Colonna fornitura GEAT'],
          ['CablaggioColonna', 'cablaggioColonna', 'Cablaggio colonna'],
          ['PiastraPiana', 'piastraPiana', 'Piastra piana'],
          ['PiastraSovrapposta', 'piastraSovrapposta', 'Piastra sovrapposta'],
        ]),
      ),
      riga(testo('CabineMisure', 'cabinaMisure', 'Specifica misure')),
      riga(
        spunta('SegnalazioniContattoChiave', 'contattoChiave', 'Contatto a chiave'),
        testo('TipoContattoChiave', 'tipoContattoChiave', 'Tipo contatto a chiave'),
      ),
      riga(
        scelta('GruppoDisplay', 'displayCabina', 'Display', [
          ['LcdIcaro', 'lcdIcaro', 'LCD Icaro'],
          ['LcdTricolor', 'lcdTricolor', 'LCD Tricolor'],
          ['TftIris', 'tftIris', 'TFT 7" Iris'],
        ]),
        scelta('GruppoLampada', 'lampada', 'Lampada emergenza', [
          ['EL01Icaro', 'el01Icaro', 'EL01 Icaro'],
          ['LemTricolor', 'lem00Tricolor', 'LEM00 Tricolor'],
        ]),
      ),
      conTitolo(
        'Servizi',
        spunta('ServiziAllarme', 'servAllarme', 'Allarme'),
        spunta('ServiziApriporta', 'servApriporta', 'Apriporta'),
        spunta('ServiziChiudiPorta', 'servChiudiporta', 'Chiudiporta'),
        spunta('ServiziStop', 'servStop', 'Stop'),
        spunta('ServiziStopFungo', 'servStopFungo', 'Stop a fungo'),
      ),
      conTitolo(
        'Segnalazioni cabina',
        spunta('SegnalazioniVietatoFumare', 'segnVietatoFumare', 'Vietato fumare'),
        spunta('SegnalazioniAllarme', 'segnAllarmeAttivato', 'Allarme attivato'),
        spunta('SegnalazioniImpianto', 'segnEmergenza', 'Impianto in emergenza'),
        spunta('SegnalazioniSovraccarico', 'segnSovraccarico', 'Sovraccarico'),
        spunta('SegnalazioniVentilatore', 'segnVentilatore', 'Ventilatore'),
        spunta('SegnalazioniParla', 'segnParla', 'Parla/ascolta'),
      ),
    ],
  },
  {
    titolo: 'Misure (distanza da quadro, mm)',
    pagina: 2,
    righe: [
      riga(
        testo('MisureAMotore', 'misuraMotore', 'A motore'),
        testo('MisureAQuadro', 'misuraQuadro3708', 'A quadro 37/08'),
        testo('MisureAPrimaPulsantiera', 'misuraPulsantiera', 'A prima pulsantiera'),
      ),
      riga(
        testo(
          'MisureDistanza',
          'misuraMontante',
          'Distanza dalla montante vano alla pulsantiera piano',
        ),
      ),
      riga(
        testo('MisureTestata', 'misuraTestata', 'Testata'),
        testo('MisureCorsa', 'misuraCorsa', 'Corsa'),
        testo('MisureFossa', 'misuraFossa', 'Fossa'),
      ),
    ],
  },
  {
    titolo: 'Piani',
    pagina: 2,
    righe: [
      riga(
        scelta('GruppoPianiSeriale', 'pianiSistema', 'Piani', [
          ['Seriale', 'seriale', 'Seriale'],
          ['Tradizionale', 'tradizionale', 'Tradizionale'],
        ]),
        scelta('GruppoPianiPiastra', 'pianiPiastra', 'Piastra', [
          ['PiastraPiana', 'piastraPiana', 'Piastra piana'],
          ['PiastraSovrapposta', 'piastraSovrapposta', 'Piastra sovrapposta'],
        ]),
      ),
      riga(
        spunta('PianiScatola', 'scatola', 'Scatola'),
        spunta('PianiLogo', 'logo', 'Logo su piastre'),
      ),
      riga(testo('PianiMisure', 'pianiMisure', 'Specifica misure')),
      riga(testo('PianiTipoContatto', 'pianiTipoContatto', 'Tipo contatto a chiave')),
      ...[
        ['PianiDisplayIcaro', 'displayIcaro', 'Display LCD Icaro'],
        ['PianiDisplayArchitrave', 'displayArchitrave', 'Display LCD su architrave'],
        ['PianiPresente', 'presentePiani', 'Presente'],
        ['PianiAllarme', 'allarmeCampana', 'Allarme campana'],
        ['PianiInArrivo', 'inArrivo', 'In arrivo'],
        ['PianiFuoriServizio', 'fuoriServizio', 'Fuori servizio'],
        ['PianiContattoChiave', 'contattoChiavePiani', 'Contatto a chiave'],
      ].map(([acro, key, label], i) =>
        conTitolo(
          label,
          spunta(acro, key, 'Sì'),
          spunta(`PianoPrincipale-${i + 1}`, `${key}Principale`, 'Piano principale'),
          spunta(`AltriPiani-${i + 1}`, `${key}Altri`, 'Altri piani'),
        ),
      ),
    ],
  },
];

// Every field that holds data is in the map; what is left — the "Ripulisci i campi" button.
const resto = [...campi.keys()].filter((n) => !usati.has(n) && n !== 'BtnSvuota');
if (resto.length) throw new Error(`${FILE}: fields with no place in the map: ${resto}`);

const mappa = {
  id: 'geat-modulo-quadro',
  fornitore: 'GEAT Elevators',
  titolo: 'Modulo quadro (preventivo o ordine)',
  fonte:
    'GEAT_modulo_quadro.pdf caricato dal proprietario del portale il 12/11/2026 ' +
    '(modulo compilabile GEAT, invariato; mappa da scripts/moduli/geat.mjs)',
  file: FILE,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  tipo: 'acroform',
  pulizia: { nonStampare: ['^BtnSvuota$'] },
  gruppi,
};
const out = join(ASSETS, FILE.replace(/\.pdf$/, '.json'));
writeFileSync(out, `${JSON.stringify(mappa, null, 2)}\n`);
console.log(
  `${FILE.replace(/\.pdf$/, '.json')}: ${gruppi.flatMap((g) => g.righe.flatMap((r) => r.campi)).length} campi`,
);
