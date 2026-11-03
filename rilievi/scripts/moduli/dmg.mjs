// Writes the maps of the two DMG order forms the owner of the portal sent (2 November 2026): the controller
// (QF_Pitagora-4.0 v1.9) and the fixtures (QF_Fixtures v1.3) — assets/moduli/dmg-pitagora-4-0.json and
// dmg-fixtures.json. The PDFs are the vendor's own forms, unchanged; this script reads their fields with
// pdf-lib and checks every name, every "on" state of the tick boxes and every option of the lists against
// the labels below (taken from the sheets, in Italian, in the order of the sheet). A field or state that
// is not in the PDF, or a state of a choice that has no label here, stops the script.
//
// The DMG forms write a choice as a group of tick boxes with one name (not as radio buttons): a choice
// points to its box by the name of its "on" state (`stato`). The model of the fixtures is chosen on the
// cover of the form (JavaScript): here it is a choice with no field, which shows the pictures and the
// widths of that model on the printed sheet (`mostra`). The JavaScript, the action buttons and the grey
// patches ("-TOPPA") never reach the sheet (`pulizia`, src/ordini/pdf-form-pulizia.ts).
//
//   npm run moduli:dmg      (then commit the maps: each map pins its PDF by SHA-256)
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFCheckBox, PDFDocument, PDFDropdown, PDFTextField } from 'pdf-lib';

const ASSETS = join(import.meta.dirname, '..', '..', 'assets', 'moduli');
const MULTILINE = 1 << 12;

async function leggi(file) {
  const bytes = readFileSync(join(ASSETS, file));
  const doc = await PDFDocument.load(bytes);
  const campi = new Map(
    doc
      .getForm()
      .getFields()
      .map((f) => [f.getName(), f]),
  );
  return { sha256: createHash('sha256').update(bytes).digest('hex'), campi };
}

/** The helpers that turn a field of the sheet into a field of the map — checked against the PDF. */
function costruttore(campi, file) {
  const usati = new Set();
  const prendi = (acro, Tipo) => {
    const f = campi.get(acro);
    if (!(f instanceof Tipo)) throw new Error(`${file}: «${acro}» is not a ${Tipo.name}`);
    if (usati.has(acro)) throw new Error(`${file}: «${acro}» used twice`);
    usati.add(acro);
    return f;
  };
  const stati = (f) =>
    f.acroField
      .getWidgets()
      .map((w) => w.getOnValue()?.decodeText())
      .filter(Boolean);
  return {
    /** Text: multiline in the PDF → textarea; the length — what fits in the box at about 6 pt. */
    testo(acro, key, label, { linea = false, ...extra } = {}) {
      const f = prendi(acro, PDFTextField);
      const flags = f.acroField.getFlags();
      if (flags & MULTILINE && !linea)
        return { key, kind: 'textarea', label, acro, maxLength: 600, ...extra };
      const width = f.acroField.getWidgets()[0].getRectangle().width;
      const maxLength = Math.max(2, Math.min(200, Math.round(width / 3.2)));
      return { key, kind: 'text', label, acro, maxLength, ...extra };
    },
    /** One tick box with one "on" state. */
    spunta(acro, key, label) {
      const f = prendi(acro, PDFCheckBox);
      if (stati(f).length !== 1) throw new Error(`${file}: «${acro}» has ${stati(f).length} boxes`);
      return { key, kind: 'check', label, acro };
    },
    /**
     * A choice: [state, value, label] for every box of the group (`salta` — states of the group that
     * are not offered, with the reason in the caller).
     */
    scelta(acro, key, label, voci, { salta = [] } = {}) {
      const f = prendi(acro, PDFCheckBox);
      const presenti = stati(f);
      const offerti = voci.map(([stato]) => stato);
      for (const stato of offerti)
        if (!presenti.includes(stato)) throw new Error(`${file}: «${acro}» has no state ${stato}`);
      const mancanti = presenti.filter((s) => !offerti.includes(s) && !salta.includes(s));
      if (mancanti.length)
        throw new Error(`${file}: «${acro}» — states without a label: ${mancanti}`);
      return {
        key,
        kind: 'radio',
        label,
        acro,
        opzioni: voci.map(([stato, valore, etichetta]) => ({ valore, label: etichetta, stato })),
      };
    },
    /** A drop-down list of the PDF; "-" is its "nothing chosen". */
    elenco(acro, key, label, extra = {}) {
      const f = prendi(acro, PDFDropdown);
      const opzioni = f.getOptions().filter((o) => o !== '-');
      return { key, kind: 'select', label, acro, opzioni, vuoto: '-', ...extra };
    },
    usati,
  };
}

const riga = (...campi) => ({ campi });
const conTitolo = (titolo, ...campi) => ({ titolo, campi });
const piano = (n) => String(n).padStart(2, '0');
const FERMATE = Array.from({ length: 14 }, (_, i) => 14 - i);
/** "Greta_0916" → height 900, width 160 (the cabin panels: hhww in cm / tens of mm). */
const misura = (stato) => {
  const [, h, w] = stato.match(/_(\d\d)(\d\d)$/);
  return { h: Number(h) * 100, w: Number(w) * 10 };
};

async function pitagora() {
  const file = 'dmg-pitagora-4-0.pdf';
  const { sha256, campi } = await leggi(file);
  const { testo, spunta, scelta, usati } = costruttore(campi, file);
  const SI = [['Si', 'si', 'Sì']];
  const acdc = (acro, key) =>
    scelta(acro, key, 'AC / DC', [
      ['AC', 'ac', 'AC'],
      ['DC', 'dc', 'DC'],
    ]);
  const fermate = (acro, key, label) =>
    scelta(
      acro,
      key,
      label,
      FERMATE.slice()
        .reverse()
        .map((n) => [String(n), `f${n}`, `Fermata ${n}`]),
    );
  const tasti = (n, prefix) => [
    scelta(`10_CarPanels_Key-Type${n}`, `${prefix}Tipo`, `Chiave ${n}`, [
      ['Kaba', 'kaba', 'Kaba'],
      ['Viro', 'viro', 'Viro'],
      ['Euro', 'euro', 'Euro'],
    ]),
    scelta(`10_CarPanels_Key-Type${n}-PE`, `${prefix}Pe`, `Chiave ${n}: posizioni`, [
      ['21', 'p2e1', '2P-1E'],
      ['RM', 'p2e1rm', '2P-1E R.M.'],
      ['22', 'p2e2', '2P-2E'],
    ]),
    testo(`10_CarPanels_Key-Type${n}-Decor`, `${prefix}Incisione`, `Chiave ${n}: incisione`),
  ];
  const marcaCop = (prefisso) =>
    ({ Greta: 'Greta', Luna: 'Luna', Cut: 'Cut', Silver: 'Silverlight' })[prefisso];
  const DIM_CABINA = [
    ...['Greta_0916', 'Greta_0920', 'Greta_1016', 'Greta_1020', 'Greta_1116', 'Greta_1120']
      .concat(['Greta_1216', 'Greta_1220', 'Luna_0916', 'Luna_0920', 'Luna_1016', 'Luna_1020'])
      .concat(['Luna_1220', 'Cut_0916', 'Cut_0920', 'Cut_1016', 'Cut_1020', 'Cut_1220'])
      .concat(['Silver_0920', 'Silver_1020', 'Silver_1120', 'Silver_1220'])
      .map((stato) => {
        const { h, w } = misura(stato);
        const nome = marcaCop(stato.split('_')[0]);
        return [stato, `${stato.split('_')[0].toLowerCase()}${h}x${w}`, `${nome} ${w} × ${h}`];
      }),
    ['Column_0020', 'venus200', 'Colonna Venus 200'],
    ['Column_0021', 'venus210', 'Colonna Venus 210'],
  ];
  const FLUSH_CABINA = ['0915', '0918', '0922', '1015', '1018', '1022']
    .concat(['1115', '1118', '1122', '1215', '1218', '1222'])
    .map((c) => {
      const { h, w } = misura(`Flush_${c}`);
      return [`Flush_${c}`, `piana${h}x${w}`, `Piastre piane ${w} × ${h}`];
    });
  const FLUSH_PIANO = ['1560', '1580', '2060', '2080', '2090', '2560', '2580', '2590'].map((c) => {
    const [h, w] = [Number(c.slice(0, 2)) * 10, Number(c.slice(2))];
    return [`Flush_${c}`, `piana${h}x${w}`, `Piastre piane ${w} × ${h}`];
  });
  const DIM_PIANO = [
    ['Greta', [1665, 2265, 2465, 65, 1685, 2285, 2485, 85]],
    ['Cut', [2290, 2490, 90]],
    ['Silver', [2210, 2410, 10]],
    ['Luna', [1670, 2270, 2470, 70, 1690, 2290, 2490, 90]],
  ].flatMap(([m, codici]) =>
    codici.map((codice) => {
      // The code is abbreviated: height 16/22/24 = 160/225/245 (00 = «Altra altezza»), width 10 = 100.
      const c = String(codice).padStart(4, '0');
      const h = { '00': null, 16: 160, 22: 225, 24: 245 }[c.slice(0, 2)];
      const w = c.slice(2) === '10' ? 100 : Number(c.slice(2));
      if (h === undefined) throw new Error(`unknown height: ${m}_${c}`);
      const valore = `${m.toLowerCase()}${h ?? 'altra'}x${w}`;
      return [`${m}_${c}`, valore, `${marcaCop(m)} ${w} × ${h ?? 'altra altezza'}`];
    }),
  );
  const RIGHE_PIANO = [
    ['TOP', 'alto', 'Piano ALTO'],
    ['MIDDLE', 'intermedi', 'Piani INTERMEDI'],
    ['MAIN', 'principale', 'Piano PRINCIPALE'],
    ['BOTTOM', 'basso', 'Piano BASSO'],
  ].map(([sigla, k, titolo]) => {
    const a = (nome) => `11_FloorPanels_Button-config.${sigla}-${nome}`;
    return conTitolo(
      titolo,
      scelta(a('Key'), `${k}Chiave`, 'Chiave', [
        ['1', 'chiave', 'Chiave'],
        ['2', 'smartKey', 'Smart Key plus'],
      ]),
      scelta(a('Display'), `${k}Display`, 'Display', [
        ['3', 'banksy', 'Banksy'],
        ['4', 'raffaello', 'Raffaello'],
        ['5', 'giotto', 'Giotto'],
      ]),
      spunta(a('Gong'), `${k}Gong`, 'Gong'),
      spunta(a('Segn1'), `${k}Presente`, 'Segnalazione «Presente»'),
      spunta(a('Segn2'), `${k}Allarme`, 'Segnalazione allarme'),
      spunta(a('Segn3'), `${k}FuoriServizio`, 'Segnalazione fuori servizio'),
      spunta(a('Piano'), `${k}NomePiano`, 'Nome piano'),
    );
  });

  const gruppi = [
    {
      titolo: 'Intestazione',
      righe: [
        riga(testo('00_Header-Azienda', 'azienda', 'Azienda', { prefill: 'azienda' })),
        riga(
          testo('00_Header-Referente', 'referente', 'Referente / Telefono / Mail', {
            prefill: 'utente',
          }),
        ),
        riga(
          testo('00_Header-Rif.Progetto', 'riferimentoProgetto', 'Riferimento progetto', {
            prefill: 'rif',
          }),
        ),
        riga(
          testo('00_Header-DataConsegna', 'dataConsegna', 'Data consegna richiesta'),
          testo('00_Header-Paese-Dest', 'paeseDestinazione', 'Paese di destinazione', {
            predefinito: 'Italia',
          }),
        ),
      ],
    },
    {
      titolo: '1 · Normative',
      righe: [
        riga(
          scelta('01_Normative', 'normativa', 'Normativa', [
            ['81-1-2', 'en8112', 'Direttiva ascensori 95/16/CE - EN81-1/2'],
            ['81-20', 'en8120', 'Direttiva ascensori 2014/33/EU - EN81-20/50'],
            ['81-21', 'en8121', 'Norma EN81-21'],
            ['81-72', 'en8172', 'Norma EN81-72'],
          ]),
        ),
        riga(
          scelta('01_Normative-IT-FR', 'normaNazionale', 'Norma nazionale (EN81-1/2)', [
            ['ITA', 'italia', 'Norma UNI 10411:2021 1/2 (Italia)'],
            ['FRA', 'francia', 'Norma NF82-230 (Francia)'],
          ]),
        ),
        riga(
          spunta('01_Normative-DM.2005', 'dm2005', 'D.M. 15/09/2005'),
          scelta('01_Normative-DM.2005-scelta', 'dm2005Tipo', 'D.M. 15/09/2005', [
            ['Asc.Antincendio', 'antincendio', 'Ascensore antincendio'],
            ['Asc.Soccorso', 'soccorso', 'Ascensore di soccorso'],
          ]),
        ),
      ],
    },
    {
      titolo: '2 · Dati impianto',
      righe: [
        riga(
          scelta('02_Dati.Imp_Tens.Impianto', 'tensioneImpianto', 'Tensione impianto', [
            ['220', 'v220', '220 V'],
            ['400', 'v400', '400 V'],
          ]),
          scelta('02_Dati.Imp_Tens.Sicurezze', 'tensioneSicurezze', 'Tensione sicurezze', [
            ['48', 'vdc48', '48 VDC'],
            ['230', 'vac230', '230 VAC'],
          ]),
        ),
        riga(
          scelta('02_Dati.Imp_Tipo.Cablaggio', 'cablaggio', 'Tipo cablaggio', [
            ['Precablato', 'precablato', 'Precablato DMG'],
            ['Morsetti', 'morsetti', 'Con morsetti a vite'],
          ]),
          scelta('02_Dati.Imp_Taglia', 'taglia', 'Fattore di taglia', [
            ['1:1', 'taglia11', '1:1 (diretto)'],
            ['2:1', 'taglia21', '2:1 (indiretto)'],
          ]),
        ),
        riga(
          testo('02_Dati.Imp_Portata', 'portata', 'Portata (kg/pers.)'),
          testo('02_Dati.Imp_N.Piani', 'nPiani', 'N. Piani'),
          testo('02_Dati.Imp_Velocità', 'velocita', 'Velocità (m/s)'),
        ),
        riga(
          scelta('02_Dati.Imp_Meccanica', 'meccanica', 'Meccanica', [
            ['Anello', 'anello', 'Anello'],
            ['Seggiola', 'seggiola', 'Seggiola'],
          ]),
          scelta('02_Dati.Imp_Manovra', 'manovra', 'Manovra', [
            ['Universale', 'universale', 'Universale'],
            ['C.Discesa', 'collettivoDiscesa', 'Collettivo discesa'],
            ['C.Completo', 'collettivoCompleto', 'Collettivo completo'],
          ]),
        ),
        riga(
          scelta('02_Dati.Imp_Funzionamento', 'funzionamento', 'Funzionamento', [
            ['Simplex', 'simplex', 'Simplex'],
            ['Multiplex', 'multiplex', 'Multiplex'],
          ]),
          testo('02_Dati.Imp_Funz.Multiplex', 'multiplexNr', 'Multiplex: Nr.'),
        ),
      ],
    },
    {
      titolo: '3 · Dati sala macchine',
      righe: [
        riga(
          scelta('03_Dati.SM_Posizione', 'posizioneSala', 'Posizione sala macchine', [
            ['Alto', 'alto', 'In alto'],
            ['Basso', 'basso', 'In basso'],
          ]),
        ),
        riga(
          spunta(
            '03_Dati.SM_Neutro-DTU',
            'neutroDtu',
            'Presenza del neutro sul quadro di alimentazione generale (DTU) esistente',
          ),
        ),
        conTitolo(
          'Lunghezze (B: cavo alimentazione e C: cavo motore — fisse, 8 metri)',
          testo('03_Dati.SM_Lunghezza-A-Lop', 'cavoA', 'A · Cavo quadro -> pulsantiera più vicina'),
          testo('03_Dati.SM_Lunghezza-D-Limitatore', 'cavoD', 'D · Cavo limitatore'),
        ),
      ],
    },
    {
      titolo: '4 · Dati vano',
      righe: [
        riga(
          testo('03_Dati.Vano_Testata', 'testata', 'Testata'),
          spunta('03_Dati.Vano_Testata-Ridotta', 'testataRidotta', 'Testata ridotta (EN81-21)'),
        ),
        riga(testo('03_Dati.Vano_Corsa', 'corsa', 'Corsa')),
        riga(
          testo('03_Dati.Vano_Fossa', 'fossa', 'Fossa'),
          spunta('03_Dati.Vano_Fossa-Ridotta', 'fossaRidotta', 'Fossa ridotta (EN81-21)'),
        ),
        riga(
          fermate(
            '04_Dati.Vano_MRL',
            'pianoMrl',
            'MRL: piano di installazione del quadro di manovra (in assenza di sala macchine)',
          ),
        ),
        riga(
          fermate('04_Dati.Vano_Ritorno-Aut', 'ritornoAutomatico', 'Ritorno automatico al piano'),
        ),
        riga(fermate('04_Dati.Vano_PP.Pompieri', 'pianoPompieri', 'Piano principale pompieri')),
        ...FERMATE.map((n) =>
          conTitolo(
            `Fermata ${n}`,
            spunta(`04_Dati.Vano_Acc.Passante-${piano(n)}`, `passante${n}`, 'Accesso passante'),
            spunta(`04_Dati.Vano_Accesso1-${piano(n)}`, `accesso1F${n}`, 'Accesso 1'),
            testo(`03_Dati.Vano_ID1-Piano-${piano(n)}`, `nome1F${n}`, 'Accesso 1: piano'),
            ...(n < 14
              ? [testo(`03_Dati.Vano_Interpiano-${piano(n)}`, `interpiano${n}`, 'Interpiano')]
              : []),
            spunta(`04_Dati.Vano_Accesso2-${piano(n)}`, `accesso2F${n}`, 'Accesso 2'),
            testo(`03_Dati.Vano_ID2-Piano-${piano(n)}`, `nome2F${n}`, 'Accesso 2: piano'),
          ),
        ),
      ],
    },
    {
      titolo: '5 · Motori e centraline — VVVF',
      righe: [
        riga(
          scelta('05_VVVF-Tipo', 'vvvfTipo', 'Tipo', [
            ['Geared', 'geared', 'Geared (asincrono)'],
            ['Gearless', 'gearless', 'Gearless (sincrono)'],
          ]),
        ),
        riga(testo('05_VVVF-Motore-Marca', 'motoreMarca', 'Marca e modello motore')),
        riga(
          testo('05_VVVF-Motore-V', 'motoreV', 'V'),
          testo('05_VVVF-Motore-A', 'motoreA', 'A'),
          testo('05_VVVF-Motore-KW', 'motoreKw', 'kW'),
        ),
        riga(
          testo('05_VVVF-Motore-Poli', 'motorePoli', 'N° poli'),
          testo('05_VVVF-Motore-Hz', 'motoreHz', 'Frequenza'),
          testo('05_VVVF-Motore-Giri', 'motoreGiri', 'Giri (RPM)'),
        ),
        riga(
          scelta('05_VVVF-AnelloChiuso', 'anelloChiuso', 'Anello chiuso', [
            ['No', 'no', 'No'],
            ['Si', 'si', 'Si'],
          ]),
          scelta('05_VVVF-AnelloAperto', 'encoder', 'Encoder (anello chiuso)', [
            ['RS485', 'rs422', 'Encoder 5V RS422'],
            ['12/15/24V', 'v121524', 'Encoder 12/15/24V'],
            ['Sin Cos', 'sinCos', 'Encoder Sin Cos'],
            ['En Dat', 'enDat', 'Encoder En Dat'],
          ]),
        ),
        riga(
          scelta('05_VVVF-Freno', 'freno', 'Freno', [
            ['Singolo', 'singolo', 'Singolo'],
            ['Singolo+Albero', 'singoloAlbero', 'Singolo + freno albero lento'],
            ['Doppio', 'doppio', 'Doppio'],
            ['Trifase', 'trifase', 'Trifase 400 Vac'],
          ]),
        ),
        riga(
          testo('05_VVVF-Freno-Tensione', 'frenoTensione', 'Freno: tensione (V)'),
          acdc('05_VVVF-Freno-Tens.AC-DC', 'frenoAcDc'),
          spunta('05_VVVF-Freno+Sovraeccitazione', 'frenoSovraeccitazione', '+ Sovraeccitazione'),
          spunta('05_VVVF-Freno-Potenza', 'frenoPotenza', 'Potenza > 300W'),
        ),
      ],
    },
    {
      titolo: '5 · Motori e centraline — HYDRO',
      righe: [
        riga(
          scelta('05_HYDRO-Avviamento', 'avviamento', 'Avviamento', [
            ['Diretto', 'diretto', 'Diretto'],
            ['Soft-Starter', 'softStarter', 'Soft Starter'],
            ['Stella-Tr.', 'stellaTriangolo', 'Stella / Triangolo'],
          ]),
          scelta('05_HYDRO-Colleg.Motore', 'collegamentoMotore', 'Collegamento motore', [
            ['3 fili', 'fili3', '3 fili'],
            ['6 fili', 'fili6', '6 fili'],
          ]),
        ),
        riga(spunta('05_HYDRO-Em.A3', 'emendamentoA3', 'Gestione emendamento A3')),
        riga(
          testo(
            '05_HYDRO-Centralina-Marca',
            'centralinaMarca',
            'Centralina idraulica: marca e modello',
            { linea: true },
          ),
        ),
        riga(
          testo('05_HYDRO-Centralina-V', 'centralinaV', 'V'),
          testo('05_HYDRO-Centralina-A', 'centralinaA', 'A'),
          testo('05_HYDRO-Centralina-KW', 'centralinaKw', 'kW'),
        ),
        riga(
          testo('05_HYDRO-Centralina-V2', 'centralinaV2', 'V'),
          testo('05_HYDRO-Centralina-A2', 'centralinaA2', 'A'),
          testo('05_HYDRO-Centralina-KW2', 'centralinaKw2', 'kW'),
        ),
        conTitolo(
          'Gruppo valvole',
          testo('05_HYDRO-Valvole-N°', 'valvoleN', 'N° valvole'),
          testo('05_HYDRO-Valvole-Tens.gruppo', 'valvoleTensione', 'Tensione (V)'),
          acdc('05_HYDRO-Valvole-Tens.gruppo-AC-DC', 'valvoleAcDc'),
        ),
        riga(testo('05_HYDRO-Valvole-Marca', 'valvoleMarca', 'Gruppo valvole: marca e modello')),
        riga(
          testo('05_HYDRO-Valvole-V', 'valvoleV', 'V'),
          testo('05_HYDRO-Valvole-A', 'valvoleA', 'A'),
          testo('05_HYDRO-Valvole-KW', 'valvoleKw', 'kW'),
        ),
      ],
    },
    {
      titolo: '6 · Porte',
      righe: [
        riga(
          scelta('06_Porte-Piano', 'portePiano', 'Porte di piano', [
            ['Automatiche', 'automatiche', 'Automatiche'],
            ['Manuali', 'manuali', 'Manuali'],
          ]),
          spunta('06_Porte-Piano-Pattino', 'pattino', 'Con pattino elettronico'),
          testo('06_Porte-Piano-Patt.V', 'pattinoV', 'Pattino: tensione (V)'),
          testo('06_Porte-Piano-Patt.A', 'pattinoA', 'Pattino: assorbimento (A)'),
        ),
        riga(
          scelta('06_Porte-Cabina', 'porteCabina', 'Porte di cabina', [
            ['Manuali', 'manuali', 'Manuali'],
            ['Autonome', 'autonome', 'Autonome'],
            ['Regolate', 'regolate', 'Regolate'],
            ['Trifase', 'trifase', 'Trifase'],
          ]),
        ),
        riga(
          spunta(
            '06_Porte-Cabina-P.Aliment.In.Marcia',
            'alimentateMarcia',
            'Porte alimentate in marcia',
          ),
          spunta(
            '06_Porte-Cabina-Apertura-Anticipata',
            'aperturaAnticipata',
            'Apertura porte anticipata',
          ),
          spunta('06_Porte-Cabina-Rilivellamento', 'rilivellamento', 'Rilivellamento'),
        ),
        riga(
          spunta('06_Porte-Cabina-Frenatura', 'frenatura', 'Frenatura porte'),
          testo('06_Porte-Cabina-Frenatura-V', 'frenaturaV', 'Frenatura: tensione (V)'),
          acdc('06_Porte-Cabina-Frenatura-AC-DC', 'frenaturaAcDc'),
        ),
        riga(
          testo('06_Porte-Cabina-Marca', 'motorePorteMarca', 'Motore porte: marca e modello', {
            linea: true,
          }),
        ),
        riga(
          testo('06_Porte-Cabina-Marca-V', 'motorePorteV', 'V'),
          testo('06_Porte-Cabina-Marca-A', 'motorePorteA', 'A'),
          testo('06_Porte-Cabina-Marca-KW', 'motorePorteKw', 'kW'),
          acdc('06_Porte-Cabina-Motore-Tens.AC-DC', 'motorePorteAcDc'),
        ),
      ],
    },
    {
      titolo: '7 · Sistema di conteggio',
      righe: [
        riga(
          scelta('07_Conteggio', 'conteggio', 'Sistema di conteggio', [
            ['FAI/FAS', 'faiFas', 'Lettori magnetici FAI/FAS'],
            ['Incrementale', 'incrementale', 'Encoder incrementale DMG'],
            ['Elgo', 'elgo', 'Encoder assoluto ELGO Safe'],
          ]),
        ),
      ],
    },
    {
      titolo: '8 · Opzioni quadro',
      righe: [
        riga(
          spunta(
            '08_Opzioni-Kit-Sovratensione',
            'kitSovratensione',
            'Kit protezione sovratensione',
          ),
        ),
        riga(
          spunta(
            '08_Opzioni-Eme-Automatica',
            'emergenzaAutomatica',
            'Emergenza automatica con apertura porte al piano più vicino',
          ),
        ),
        riga(
          spunta('08_Opzioni-Segn.DM236', 'segnalazioneDm236', 'Segnalazione DM 236 (Legge 13)'),
        ),
        riga(
          spunta('08_Opzioni-Vent.Motore', 'ventilazioneMotore', 'Ventilazione motore'),
          scelta('08_Opzioni-Vent.Motore-V', 'ventilazioneMotoreV', 'Ventilazione motore', [
            ['Mono-230', 'mono230', 'Monofase 230V'],
            ['Mono-400', 'mono400', 'Monofase 400V'],
            ['Trifase-400', 'trifase400', 'Trifase 400V'],
          ]),
        ),
        riga(spunta('08_Opzioni-Vent.Cabina', 'ventilazioneCabina', 'Ventilazione in cabina')),
        riga(spunta('08_Opzioni-Sonda-Temp', 'sondaTemperatura', 'Sonda temperatura ambiente')),
        riga(
          spunta(
            '08_Opzioni-Comando-Limitatore',
            'comandoLimitatore',
            'Comando limitatore di velocità',
          ),
          testo('08_Opzioni-Comando-Limitatore-V', 'comandoLimitatoreV', 'Tensione (V)'),
          acdc('08_Opzioni-Comando-Limitatore-AC-DC', 'comandoLimitatoreAcDc'),
        ),
        riga(
          spunta('08_Opzioni-Protezione-Agg.230V', 'protezione230', 'Protezione aggiuntiva 230V'),
        ),
        riga(
          spunta('08_Opzioni-Evacuazione-Incendio', 'evacuazioneIncendio', 'Evacuazione incendio'),
          scelta(
            '08_Opzioni-Evacuazione-Incendio-Piani',
            'evacuazionePiani',
            'Evacuazione incendio',
            [
              ['Singolo', 'singolo', 'Piano singolo'],
              ['Cascata', 'cascata', 'In cascata'],
            ],
          ),
        ),
        riga(
          spunta('08_Opzioni-Prot.EN81-21', 'protezioniEn8121', 'Protezioni EN81-21'),
          scelta('08_Opzioni-Prot.EN81-21-scelta', 'protezioniEn8121Tipo', 'Protezioni EN81-21', [
            ['Accesso Vano', 'accessoVano', 'Solo controllo accesso vano'],
            ['AMI100', 'ami100', 'Dispositivo AMI100 RTBS'],
            ['SHI', 'shi', 'Dispositivo SHI'],
            ['Manuale', 'manuale', 'Dispositivo manuale'],
            ['Preattivato', 'preattivato', 'Dispositivo pre-attivato'],
          ]),
        ),
        riga(
          spunta('08_Opzioni-Prot.UCM', 'protezioneUcm', 'Protezione UCM'),
          scelta('08_Opzioni-Prot.UCM-scelta', 'protezioneUcmTipo', 'Protezione UCM', [
            ['Monit.Valvole', 'monitoraggio', 'Monitoraggio freno / valvole'],
            ['Lim.A3', 'limitatoreA3', 'Soluzione con limitatore A3'],
            ['UCMP DMG', 'ucmpDmg', 'Soluzione UCMP DMG'],
            ['Elgo', 'elgo', 'Soluzione ELGO Safe'],
          ]),
        ),
      ],
    },
    {
      titolo: '9 · Accessori',
      righe: [
        conTitolo(
          'Cabina',
          spunta('09_Acc.Cab_Stop2', 'stop2Accesso', 'Stop 2° accesso'),
          spunta(
            '09_Acc.Cab_Gremb.Retrattile',
            'grembiule',
            'Gestione grembiule retrattile (sensore e cavi)',
          ),
        ),
        riga(
          spunta('09_Acc.Cab_Pesacarico', 'pesacarico', 'Pesacarico DMG LLEC7'),
          scelta('09_Acc.Cab_Pesacarico-Sensori', 'pesacaricoSensore', 'Tipo di sensore', [
            ['Arcata', 'arcata', 'per arcata'],
            ['Funi', 'funi', 'per funi multiple'],
            ['Sotto-Cab', 'sottoCabina', 'sotto cabina'],
            ['Fune-sing', 'funeSingola', 'per singola fune'],
          ]),
          testo('09_Acc.Cab_Pesacarico-Sens.Funi-N°', 'pesacaricoFuniN', 'Funi multiple: N°'),
          testo('09_Acc.Cab_Pesacarico-Sens.Funi-Diam', 'pesacaricoFuneDiam', 'Singola fune: Ø'),
        ),
        riga(
          spunta('09_Acc.Cab_Lamp.Eme-TOC', 'lampadaTetto', 'Lampada di emergenza tetto cabina'),
          spunta('09_Acc.Cab_Antine', 'barrieraCellule', 'Barriera di cellule'),
        ),
        conTitolo(
          'Vano',
          scelta('09_Acc.Vano_Kit-Illuminazione', 'illuminazioneVano', 'Illuminazione vano', [
            ['Led+Cord', 'ledCordino', 'Led di vano + cordino'],
            ['Led+Deviatore', 'ledDeviatore', 'Led di vano + deviatore'],
            ['Kit-Cord', 'kitCordino', 'Solo kit accensione (cordino)'],
            ['Kit-Deviatore', 'kitDeviatore', 'Solo kit accensione (deviatore)'],
          ]),
          spunta('09_Acc.Vano_Catena-Sicu', 'catenaSicurezze', 'Catena sicurezze'),
          spunta('09_Acc.Vano_Canalina', 'canalinaVano', 'Canalina vano'),
        ),
        conTitolo(
          'Sala macchine',
          spunta('09_Acc.SM_Cavi-Alim-Quadro', 'caviAlimentazione', 'Cavi alimentazione quadro'),
          spunta(
            '09_Acc.SM_Kit-Cavi-freno-sonda-motore',
            'kitCaviFreno',
            'Kit cavi freno - sonda - motore',
          ),
          spunta('09_Acc.SM_Cavi-Motore', 'caviMotore', 'Cavi schermati motore'),
          spunta('09_Acc.SM_Illum.SM', 'illuminazioneSala', 'Illuminazione sala macchine'),
          spunta('09_Acc.SM_Luce-Eme', 'luceEmergenza', 'Luce di emergenza'),
          spunta('09_Acc.SM_Stop', 'pulsantieraStop', 'Pulsantiera di Stop'),
          spunta('09_Acc.SM_Loc.Pulegge-Separato', 'localePulegge', 'Locale pulegge separato'),
          spunta(
            '09_Acc.SM_Cavo-Manovra-30mt',
            'cavoManovra',
            'Cavo per manovra provvisoria (30m)',
          ),
          spunta('09_Acc.SM_Quadro-Generale', 'quadroGenerale', 'Quadro di alimentazione generale'),
        ),
        riga(
          scelta('09_Acc.Cab_Telefonia', 'telefonia', 'Telefono di emergenza', [
            ['DMG-Amigo', 'amigo', 'Sistema telefonico di emergenza Amigo (EN81-28)'],
            ['Altro', 'altro', 'Altro telefono'],
          ]),
          spunta('09_Acc.Cab_Telefonia-S.M', 'derivatoSala', 'Derivato di sala macchine'),
          spunta('09_Acc.Cab_Telefonia-F.F', 'derivatoFossa', 'Derivato di fondo fossa'),
          testo('09_Acc.Cab_Altro-Telefono-Nome', 'altroTelefono', 'Altro telefono: quale'),
        ),
      ],
    },
    {
      titolo: '10 · Pulsantiere di cabina',
      righe: [
        riga(
          scelta('10_CarPanels_Dim_EN81-71', 'antivandalo', 'Opzione antivandalo EN81-71', [
            ['Classe1', 'classe1', 'Classe 1'],
            ['Classe2', 'classe2', 'Classe 2'],
          ]),
        ),
        // The three boxes «Flush_00x0» are on page 4 (floor panels, «Altra altezza» of the flat plates)
        // but belong to the cabin field: they are not offered here.
        riga(
          scelta(
            '10_CarPanels_Dim_Flush-scelta',
            'cabinaPiastrePiane',
            'Montaggio a filo: piastre piane (larghezza × altezza)',
            FLUSH_CABINA,
            {
              salta: ['Flush_0060', 'Flush_0080', 'Flush_0090'],
            },
          ),
          testo('10_CarPanels_Dim_Flush', 'copMisura', 'COP su misura'),
        ),
        riga(
          scelta(
            '10_CarPanels_Dim_scelta',
            'cabinaModello',
            'Montaggio sovrapposto (larghezza × altezza)',
            DIM_CABINA,
          ),
        ),
        riga(
          testo(
            '10_CarPanels_Dim_Column',
            'venusLunghezza',
            'Colonna Venus: lunghezza (2000-2400)',
          ),
          scelta('10_CarPanels_Dim_Column-Fixed', 'venusApertura', 'Colonna Venus', [
            ['Fissa', 'fissa', 'Fissa'],
            ['Apribile', 'apribile', 'Apribile'],
          ]),
        ),
        riga(
          scelta('10_CarPanels_Materials', 'materiale', 'Materiale', [
            ['PVD black', 'pvdBlack', 'PVD black'],
            ['PVD bronze', 'pvdBronze', 'PVD bronze'],
            ['Inox S.B.', 'inoxScotchBrite', 'Inox Scotch Brite'],
            ['Mirror', 'inoxMirror', 'Inox Mirror'],
            ['PVD gold brushed', 'pvdSatinato', 'PVD satinato'],
            ['PVD gold polished', 'pvdLucido', 'PVD lucido'],
            ['G320', 'g320', 'G320'],
            ['Lino', 'lino', 'Lino'],
          ]),
        ),
        riga(
          scelta('10_CarPanels_Display', 'display', 'Display', [
            ['Banksy', 'banksy', 'Banksy'],
            ['Raffaello', 'raffaello', 'Raffaello'],
            ['Giotto', 'giotto', 'Giotto'],
            ['Matisse', 'matisse', 'Matisse'],
          ]),
        ),
        riga(
          testo('10_CarPanels_Display-Kg', 'displayKg', 'Capacità (Kg)'),
          testo('10_CarPanels_Display-Persons', 'displayPersone', 'Persone'),
          testo('10_CarPanels_Display-ID', 'displayImpianto', 'N° Impianto'),
          testo('10_CarPanels_Display-CE', 'displayCe', 'N° CE'),
          testo('10_CarPanels_Display-Other', 'displayAltro', 'Altro'),
        ),
        riga(
          scelta('10_CarPanels_P.Button', 'pulsanti', 'Design pulsanti', [
            ['1', 'dardoQuadrato', 'Dardo (quadrato)'],
            ['2', 'dardoTondo', 'Dardo (tondo)'],
            ['3', 'macro', 'Macro'],
            ['4', 'disco', 'Disco'],
            ['5', 'blQuadrato', 'BL (quadrato)'],
            ['6', 'blTondo', 'BL (tondo)'],
            ['7', 'sherman', 'Sherman'],
            ['8', 'panzer', 'Panzer'],
          ]),
          scelta('10_CarPanels_P.Button-Illimin', 'illuminazione', 'Illuminazione', [
            ['Red', 'singolaRossa', 'Singola: rossa'],
            ['Blue', 'singolaBlu', 'Singola: blu'],
            ['W-Red', 'doppiaRossa', 'Doppia: bianca rossa'],
            ['W-Blue', 'doppiaBlu', 'Doppia: bianca blu'],
          ]),
        ),
        conTitolo(
          'Elementi acustici',
          scelta('10_CarPanels_Acoustic-Telephone', 'telefono', 'Telefono', [
            ['Amigo', 'amigo', 'Derivato audio di cabina Telefonia DMG Amigo system'],
            ['Other', 'altro', 'Altro telefono'],
          ]),
          testo('10_CarPanels_Acoustic-Telephone-Other', 'telefonoAltro', 'Altro telefono: quale'),
          spunta('10_CarPanels_Acoustic-Caruso', 'sintesiVocale', 'Sintesi vocale DMG'),
          spunta(
            '10_CarPanels_Acoustic-Intercom',
            'citofoniaPompieri',
            'Citofonia DMG per pompieri',
          ),
        ),
        conTitolo(
          'Pulsanti di servizio',
          spunta('10_CarPanels_Service-Apri.P', 'servizioApri', 'Apri porte'),
          spunta('10_CarPanels_Service-Chiudi.P', 'servizioChiudi', 'Chiudi porte'),
          spunta('10_CarPanels_Service-Allarme', 'servizioAllarme', 'Allarme'),
          spunta('10_CarPanels_Service-Stop', 'servizioStop', 'Stop'),
        ),
        conTitolo(
          'Contatti a chiave',
          scelta('10_CarPanels_Key-Cab-Flo', 'chiaviDove', 'Contatti a chiave', [
            ['Car', 'cabina', 'In cabina'],
            ['Floors', 'piani', 'Ai piani'],
          ]),
        ),
        riga(...tasti(1, 'chiave1')),
        riga(...tasti(2, 'chiave2')),
        riga(
          spunta('10_CarPanels_Key-SmartKey', 'smartKey', 'Smart Key Plus'),
          testo('10_CarPanels_Key-SmartKey-Master', 'smartKeyMaster', 'Master'),
          testo('10_CarPanels_Key-SmartKey-User', 'smartKeyUser', 'User'),
        ),
      ],
    },
    {
      titolo: '11 · Pulsantiere di piano',
      righe: [
        riga(
          scelta(
            '11_FloorPanels_Dim_Flush-scelta',
            'pianoPiastrePiane',
            'Piastre piane (larghezza × altezza)',
            FLUSH_PIANO,
          ),
          testo('11_FloorPanels_Dim_Flush', 'pianoPiastreAltra', 'Piastre piane: altra altezza'),
        ),
        riga(
          scelta(
            '11_FloorPanels_Dim_scelta',
            'pianoModello',
            'Greta, Luna, Cut, Silverlight (larghezza × altezza)',
            DIM_PIANO,
          ),
          testo('11_FloorPanels_Dim_Other', 'pianoModelloAltra', 'Altra altezza'),
        ),
        ...RIGHE_PIANO,
        conTitolo(
          'Configurazione segnalatori',
          scelta('11_FloorPanels_Indicator-config', 'segnalatori', 'Segnalatori', [
            ['Main', 'principale', 'Al piano principale'],
            ['All', 'tutti', 'A tutti i piani'],
          ]),
          scelta('11_FloorPanels_Indicator-HV', 'segnalatoriVerso', 'Verso', [
            ['H', 'orizzontale', 'Orizzontale'],
            ['V', 'verticale', 'Verticale'],
          ]),
          scelta('11_FloorPanels_Indicator-display', 'segnalatoriDisplay', 'Display', [
            ['Banksy', 'banksy', 'Banksy'],
            ['Raffaello', 'raffaello', 'Raffaello'],
            ['Giotto', 'giotto', 'Giotto'],
          ]),
          spunta('11_FloorPanels_Indicator-Frecce', 'segnalatoriFrecce', 'Frecce di direzione'),
          spunta('11_FloorPanels_Indicator-Gong', 'segnalatoriGong', 'Gong'),
        ),
      ],
    },
    {
      titolo: '12 · Note',
      righe: [
        riga(testo('12_Note-Controller', 'noteQuadro', 'Quadro')),
        riga(testo('12_Note-Fixtures', 'notePulsantiere', 'Pulsantiere')),
      ],
    },
  ];
  // Every field that holds data is in the map; the rest are the buttons of the form (pulizia).
  const resto = [...campi.keys()].filter(
    (n) => !usati.has(n) && !/^00_(Ico|Lingua|Footer)/.test(n),
  );
  if (resto.length) throw new Error(`${file}: fields with no place in the map: ${resto}`);
  return {
    id: 'dmg-pitagora-4-0',
    fornitore: 'DMG',
    titolo: 'Quote form Pitagora 4.0 (modernizzazioni, v1.9)',
    fonte:
      'QF_Pitagora-4.0_v1.9_261016.pdf caricato dal proprietario del portale il 02/11/2026 ' +
      '(modulo compilabile DMG, invariato; mappa da scripts/moduli/dmg.mjs)',
    file,
    sha256,
    tipo: 'acroform',
    pulizia: { nonStampare: [] },
    gruppi,
  };
}

async function fixtures() {
  const file = 'dmg-fixtures.pdf';
  const { sha256, campi } = await leggi(file);
  const { testo, spunta, scelta, elenco, usati } = costruttore(campi, file);
  // The models on the cover of the form, in its order, with the name of their plate and widths.
  const MODELLI = [
    ['Piane', 'Piana', 'piane', 'Flat standard'],
    ['Elise', 'Elise', 'elise', 'Elise'],
    ['Silverlight', 'Silverlight', 'silverlight', 'Silverlight'],
    ['GildaTM', 'GildaTM', 'gildaTm', 'Gilda TM'],
    ['Luna', 'Luna', 'luna', 'Luna'],
    ['Cut', 'Cut', 'cut', 'Cut'],
    ['Greta', 'Greta', 'greta', 'Greta'],
  ];
  const nomeDi = Object.fromEntries(MODELLI.map(([dim, , , nome]) => [dim, nome]));
  const mostra = (dim, piastra) =>
    [`00-Piastra-${piastra}`]
      .concat(['02', '10', '11'].flatMap((n) => [`${n}-Dim.${dim}`, `${n}-Dim.${dim}-IMG`]))
      .filter((nome) => campi.has(nome));
  const larghezze = (sezione, prefisso) =>
    MODELLI.filter(([dim]) => campi.has(`${sezione}-Dim.${dim}`)).map(([dim]) => {
      const acro = `${sezione}-Dim.${dim}`;
      const f = campi.get(acro);
      const stati = f.acroField.getWidgets().map((w) => w.getOnValue().decodeText());
      const key = `${prefisso}${dim.replace('TM', 'Tm')}`;
      const label = `Larghezza ${nomeDi[dim]} (mm)`;
      // A width with one box only (Cut 90 on the floor) is a tick box: a choice needs at least two.
      return stati.length === 1
        ? spunta(acro, key, `${label}: ${stati[0]}`)
        : scelta(
            acro,
            key,
            label,
            stati.map((s) => [s, `l${s}`, s]),
          );
    });
  const montaggio = (sezione, prefisso) => [
    riga(
      scelta(`${sezione}-Viti-Perni`, `${prefisso}Fissaggio`, 'Fissaggio', [
        ['Viti', 'viti', 'Viti'],
        ['Perni', 'perni', 'Perni'],
      ]),
      spunta(`${sezione}-Scatola`, `${prefisso}Scatola`, 'Scatola'),
      elenco(`${sezione}-Spessore`, `${prefisso}Spessore`, 'Spessore'),
    ),
  ];
  const MATERIALI = [
    ['S.Brite', 'inoxScotchBrite', 'Inox Scotch Brite'],
    ['Mirror', 'inoxMirror', 'Inox Mirror'],
    ['G320', 'g320', 'G320'],
    ['PVD satinato', 'pvdSatinato', 'PVD satinato'],
    ['PVD lucido', 'pvdLucido', 'PVD lucido'],
    ['Lino', 'lino', 'Lino'],
  ];
  const CODIFICA = [
    ['CAN', 'can', 'Seriale DMG CAN'],
    ['3W', 'fili3', 'Seriale DMG 3W (3 fili)'],
    ['RS485', 'rs485', 'Seriale DMG RS485'],
    ['CAN OPEN', 'canOpen', 'CAN OPEN'],
    ['1/piano', 'filoPiano', '1 filo per piano / 1 filo per segmento / Codice Gray / Binario'],
    ['Cont.Auton.', 'autonomo', 'Conteggio autonomo'],
  ];
  const chiave = (sezione, n, prefisso) => [
    scelta(`${sezione}-Chiave${n}-Tipo`, `${prefisso}Tipo`, `Chiave ${n}`, [
      ['Kaba', 'kaba', 'Kaba'],
      ['Viro', 'viro', 'Viro'],
      ['Euro', 'euro', 'Euro'],
    ]),
    // The first column of the sheet is «2P-1E R.M.» (state «1P-1E» in the PDF).
    scelta(`${sezione}-Chiave${n}-PE`, `${prefisso}Pe`, `Chiave ${n}: posizioni`, [
      ['1P-1E', 'p2e1rm', '2P-1E R.M.'],
      ['2P-1E', 'p2e1', '2P-1E'],
      ['2P-2E', 'p2e2', '2P-2E'],
    ]),
    testo(`${sezione}-K${n}-Incisione`, `${prefisso}Incisione`, `Chiave ${n}: incisione`),
  ];
  const smartKey = (sezione, prefisso) =>
    riga(
      spunta(`${sezione}-SmartKey`, `${prefisso}SmartKey`, 'Smart Key Plus'),
      testo(`${sezione}-SmartKey-Master`, `${prefisso}SmartKeyMaster`, 'Master'),
      testo(`${sezione}-SmartKey-User`, `${prefisso}SmartKeyUser`, 'User'),
    );
  const PIANI = [
    ['Alto', 'alto', 'Piano ALTO'],
    ['Medio', 'intermedi', 'Piani INTERMEDI'],
    ['Basso', 'basso', 'Piano BASSO'],
  ];
  const pulsantiere = PIANI.map(([sigla, k, titolo]) => {
    const a = (nome) => `10-${sigla}-${nome}`;
    return conTitolo(
      titolo,
      testo(a('Lunghezza'), `p${k}Lunghezza`, 'Lunghezza minima (mm)'),
      spunta(a('Targhetta'), `p${k}Targhetta`, 'Targhetta Braille'),
      spunta(a('Chiave'), `p${k}Chiave`, 'Chiave'),
      spunta(a('Puls'), `p${k}Pulsante`, 'Pulsante'),
      testo(a('PulsN°'), `p${k}PulsanteN`, 'Pulsante N°'),
      spunta(a('Puls-Giù'), `p${k}Giu`, 'Pulsante discesa'),
      spunta(a('Puls-Su'), `p${k}Su`, 'Pulsante salita'),
      spunta(a('Segn-ALL'), `p${k}Allarme`, 'Segnalazione allarme'),
      spunta(a('Segn-Pres'), `p${k}Presente`, 'Segnalazione «Presente»'),
      spunta(a('Segn-F.S'), `p${k}FuoriServizio`, 'Segnalazione fuori servizio'),
      testo(a('Segn-N°'), `p${k}SegnalazioneN`, 'Segnalazione N°'),
      spunta(a('Display'), `p${k}Display`, 'Display'),
      spunta(a('Gong'), `p${k}Gong`, 'Gong'),
      elenco(a('Q.tà'), `p${k}Quantita`, 'Q.tà'),
    );
  });
  const segnalatori = PIANI.map(([sigla, k, titolo]) => {
    const a = (nome) => `11-${sigla}-${nome}`;
    return conTitolo(
      titolo,
      testo(a('Lunghezza'), `s${k}Lunghezza`, 'Lunghezza minima (mm)'),
      scelta(a('Frecce'), `s${k}Frecce`, 'Frecce', [
        ['Up', 'su', 'Su'],
        ['Down', 'giu', 'Giù'],
        ['Up&Down', 'suGiu', 'Su e giù'],
      ]),
      spunta(a('Display'), `s${k}Display`, 'Display'),
      spunta(a('Gong'), `s${k}Gong`, 'Gong'),
      elenco(a('Q.tà'), `s${k}Quantita`, 'Q.tà'),
    );
  });

  const gruppi = [
    {
      titolo: 'Intestazione',
      righe: [
        riga(testo('00-Cliente', 'cliente', 'Cliente', { prefill: 'azienda' })),
        riga(testo('00-Rif.ordine', 'riferimentoOrdine', 'Riferimento ordine', { prefill: 'rif' })),
        riga(
          testo('00-Contatto', 'contatto', 'Contatto di riferimento', { prefill: 'utente' }),
          testo('00-Data', 'data', 'Data', { prefill: 'data', linea: true }),
        ),
        riga(testo('00-Indirizzo', 'indirizzo', 'Progetto / Indirizzo', { linea: true })),
        riga({
          key: 'modello',
          kind: 'radio',
          label: 'Modello di pulsantiera',
          opzioni: MODELLI.map(([dim, piastra, valore, nome]) => ({
            valore,
            label: nome,
            mostra: mostra(dim, piastra),
          })),
        }),
      ],
    },
    {
      titolo: 'Cabina · 1 · N° fermate',
      righe: [riga(elenco('01-Fermate', 'fermate', 'N° fermate'))],
    },
    {
      titolo: 'Cabina · 2 · Dimensioni',
      righe: [
        riga(...larghezze('02', 'cLarghezza')),
        riga(testo('02-Lunghezza min', 'cLunghezzaMinima', 'Lunghezza minima (mm)')),
        ...montaggio('02', 'c'),
      ],
    },
    {
      titolo: 'Cabina · 3 · Finitura materiale',
      righe: [riga(scelta('03-Materiale', 'cMateriale', 'Finitura materiale', MATERIALI))],
    },
    {
      titolo: 'Cabina · 4 · Pulsanti di chiamata',
      righe: [
        riga(
          scelta('04-P.Chiamata', 'pulsante', 'Pulsanti di chiamata', [
            ['Dardo', 'dardo', 'Dardo'],
            ['Macro', 'macro', 'Macro'],
            ['Disco', 'disco', 'Disco (JST)'],
            ['Panzer', 'panzer', 'Panzer'],
            ['Sherman', 'sherman', 'Sherman classic'],
            ['Sherman Touchless', 'shermanTouchless', 'Sherman touchless'],
            ['B7', 'b7', 'B7 Maxxi'],
          ]),
        ),
        riga(
          scelta('04-P.Chiamata-Dardo', 'dardoMontaggio', 'Dardo: montaggio', [
            ['Front-Q', 'frontaleQuadrato', 'Frontale, quadrato'],
            ['Front-S', 'frontaleTondo', 'Frontale, tondo'],
            ['Back-Q', 'posterioreQuadrato', 'Posteriore, quadrato'],
            ['Back-S', 'posterioreTondo', 'Posteriore, tondo'],
          ]),
          spunta('04-P.Chiamata-Dardo-Braille', 'dardoBraille', 'Dardo: Braille'),
        ),
        riga(
          spunta('04-P.Chiamata-B', 'bl', 'BL'),
          scelta('04-P.Chiamata-BL', 'blTipo', 'BL', [
            ['K', 'blsk', 'BLSK'],
            ['F', 'blsf', 'BLSF'],
            ['B', 'blsb', 'BLSB'],
            ['Q', 'blq', 'BLQ'],
            ['X', 'blx', 'BLX (Braille)'],
          ]),
        ),
        riga(
          scelta('04-Illuminazione', 'illuminazione', 'Illuminazione', [
            ['Single-Red', 'singolaRossa', 'Singola: rossa'],
            ['Single-Blue', 'singolaBlu', 'Singola: blu'],
            ['Double-Red', 'doppiaRossa', 'Doppia: bianca-rossa'],
            ['Double-Blue', 'doppiaBlu', 'Doppia: bianca-blu'],
            ['Twin-Red', 'twinRossa', 'Twin: bianca-rossa'],
            ['Twin-Blue', 'twinBlu', 'Twin: bianca-blu'],
          ]),
        ),
        conTitolo(
          'Opzioni',
          spunta('04-EN81-70:2018', 'en8170Contrasto', 'EN81-70:2018 (contrasto)'),
          spunta('04-BEEP', 'beep', 'BEEP EN81-70'),
        ),
        conTitolo(
          'Decorazione',
          ...Array.from({ length: 14 }, (_, i) =>
            testo(`04-Decorazione${piano(i + 1)}`, `decorazione${i + 1}`, `Decorazione ${i + 1}`),
          ),
          testo('04-PP', 'pianoPrincipale', 'Piano principale'),
        ),
      ],
    },
    {
      titolo: 'Cabina · 5 · Pulsanti di servizio',
      righe: [
        riga(
          spunta('05-P.Servizio-Apri', 'servizioApri', 'Apri porte'),
          spunta('05-P.Servizio-Chiudi', 'servizioChiudi', 'Chiudi porte'),
          spunta('05-P.Servizio-Allarme', 'servizioAllarme', 'Allarme'),
          spunta('05-P.Servizio-Stop', 'servizioStop', 'Stop'),
        ),
      ],
    },
    {
      titolo: 'Cabina · 6 · Chiavi',
      righe: [
        riga(...chiave('06', 1, 'cChiave1')),
        riga(...chiave('06', 2, 'cChiave2')),
        smartKey('06', 'c'),
      ],
    },
    {
      titolo: 'Cabina · 7 · Dati impianto',
      righe: [
        riga(testo('07-Kg', 'kg', 'Kg'), testo('07-Pers', 'persone', 'Pers.')),
        riga(
          testo('07-N.Impianto', 'nImpianto', 'N° impianto'),
          testo('07-Matricola', 'matricola', 'Matricola'),
        ),
        riga(testo('07-CE', 'ce', 'CE'), testo('07-Logo', 'logo', 'Logo')),
      ],
    },
    {
      titolo: 'Cabina · 8 · Elementi acustici',
      righe: [
        riga(
          scelta('08-Elem.Acustici', 'acustici', 'Elementi acustici', [
            ['Griglia', 'griglia', 'Solo griglia (asole)'],
            ['Griglia+Cit', 'grigliaCitofono', 'Griglia + citofono DMG'],
            ['Amigo', 'amigo', 'Telefono Amigo'],
            ['Amigo+GSM', 'amigoGsm', 'Telefono Amigo + GSM'],
          ]),
          spunta('08-Cornetta', 'cornetta', 'Cornetta'),
          spunta('08-Gong', 'gong', 'Gong'),
        ),
      ],
    },
    {
      titolo: 'Cabina · 9 · Display',
      righe: [
        riga(
          scelta('09-Display', 'display', 'Display', [
            ['M-7', 'matisse7', 'Matisse 7"'],
            ['M-10.1', 'matisse101', 'Matisse 10,1"'],
            ['G-4.3', 'giotto43', 'Giotto 4,3"'],
            ['G-5', 'giotto5', 'Giotto 5"'],
            ['G-5.6', 'giotto56', 'Giotto 5,6"'],
            ['G-7', 'giotto7', 'Giotto 7"'],
            ['G-10.1', 'giotto101', 'Giotto 10,1"'],
            ['R-2.8', 'raffaello28', 'Raffaello 2,8"'],
            ['R-4.3', 'raffaello43', 'Raffaello 4,3"'],
            ['R-5', 'raffaello5', 'Raffaello 5"'],
            ['B-DB3', 'banksyDb3', 'Banksy DB3'],
            ['B-DB1', 'banksyDb1', 'Banksy DB1'],
          ]),
          scelta('09-Targhe', 'targhe', 'Targhe', [
            ['CTDB3-nero', 'ctdb3Nera', 'CTDB3 (Nera)'],
            ['CTDB3-bianco', 'ctdb3Bianca', 'CTDB3 (Bianca)'],
            ['CTD4', 'ctd4', 'CTD4'],
          ]),
        ),
        riga(scelta('09-Codifica', 'cCodifica', 'Codifica', CODIFICA)),
        riga(testo('09-Quadro', 'quadro', 'Quadro di manovra')),
        riga(testo('00-Note1', 'noteCabina', 'Note (cabina)')),
      ],
    },
    {
      titolo: 'Piano · 10 · Configurazioni pulsantiere',
      righe: [
        riga(...larghezze('10', 'pLarghezza')),
        ...montaggio('10', 'p'),
        ...pulsantiere,
        riga(testo('10-Logo', 'pLogo', 'Logo')),
      ],
    },
    {
      titolo: 'Piano · 11 · Configurazioni segnalatori',
      righe: [riga(...larghezze('11', 'sLarghezza')), ...montaggio('11', 's'), ...segnalatori],
    },
    {
      titolo: 'Piano · 12 · Finitura materiale',
      righe: [
        riga(
          scelta('12-Materiale', 'pMateriale', 'Finitura materiale', MATERIALI),
          scelta('12-Testate', 'testate', 'Testate', [
            ['Plastica', 'plastica', 'Plastica'],
            ['Metallo', 'metallo', 'Metallo'],
          ]),
        ),
      ],
    },
    {
      // «13 - Pulsanti di chiamata»: the sheet refers to the choices of the cabin panel — no field.
      titolo: 'Piano · 14 · Chiavi',
      righe: [riga(...chiave('14', 1, 'pChiave1')), smartKey('14', 'p')],
    },
    {
      titolo: 'Piano · 15 · Display',
      righe: [
        conTitolo(
          'Pulsantiere',
          spunta('15-Disp.-Raff-2-P', 'raffaello2Pulsantiere', 'Raffaello 2"'),
          spunta('15-Disp.-Raff-2.8-P', 'raffaello28Pulsantiere', 'Raffaello 2,8"'),
          spunta('15-Disp.-Banksy-DB1-P', 'banksyDb1Pulsantiere', 'Banksy DB1'),
        ),
        conTitolo(
          'Segnalatori',
          spunta('15-Disp.-Raff-2.8-S', 'raffaello28Segnalatori', 'Raffaello 2,8"'),
          spunta('15-Disp.-Raff-4.3-S', 'raffaello43Segnalatori', 'Raffaello 4,3"'),
          spunta('15-Disp.-Raff-5-S', 'raffaello5Segnalatori', 'Raffaello 5"'),
          spunta('15-Disp.-Banksy-DB3-S', 'banksyDb3Segnalatori', 'Banksy DB3'),
        ),
        riga(scelta('15-Codifica', 'pCodifica', 'Codifica', CODIFICA)),
        riga(testo('00-Note2', 'notePiano', 'Note (piano)')),
      ],
    },
  ];
  // Every field that holds data is in the map; what is left: the buttons, the pictures, the patches
  // and the version line of the form (printed as it is).
  const resto = [...campi.keys()].filter(
    (n) =>
      !usati.has(n) &&
      !/-TOPPA$|-IMG$|^00-(ICO|RESET|Lingua|Home|Puls|Piastra|File|Versione)|-info(-view)?$/.test(
        n,
      ),
  );
  if (resto.length) throw new Error(`${file}: fields with no place in the map: ${resto}`);
  return {
    id: 'dmg-fixtures',
    fornitore: 'DMG',
    titolo: 'Quote form Fixtures (bottoniere, v1.3)',
    fonte:
      'QF_Fixtures_v1.3_260915.pdf caricato dal proprietario del portale il 02/11/2026 ' +
      '(modulo compilabile DMG, invariato; mappa da scripts/moduli/dmg.mjs)',
    file,
    sha256,
    tipo: 'acroform',
    pulizia: { nonStampare: ['-TOPPA$'] },
    gruppi,
  };
}

for (const mappa of [await pitagora(), await fixtures()]) {
  const out = join(ASSETS, mappa.file.replace(/\.pdf$/, '.json'));
  writeFileSync(out, `${JSON.stringify(mappa, null, 2)}\n`);
  const n = mappa.gruppi.flatMap((g) => g.righe.flatMap((r) => r.campi)).length;
  console.log(`${mappa.file.replace(/\.pdf$/, '.json')}: ${n} campi`);
}
