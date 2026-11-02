// Draws the two order sheets of AMI 100 — Mono UCM and Mono RTBS — and writes their maps:
// assets/moduli/ami100-mono-ucm.pdf|json and ami100-mono-rtbs.pdf|json. The fields and their order are
// those of the list the owner of the portal sent (Ami_100.pdf, 30/10/2026: the data to prepare the
// order, first of the UCM, then of the RTBS); the choices where the catalogue has fixed versions
// (supply 24/48 Vdc, governor rope on the left or right of the rail, rails of 7, 8, 9 or 16 mm,
// economiser yes/no) are tick boxes — the owner chose them over free text. On top, like the other
// order sheets: the sender, the date and the lift the order is for.
//
//   npm run moduli:disegna      (then commit the PDFs and the maps: each map pins its PDF by SHA-256)
import { foglio } from './foglio.mjs';

const FONTE =
  "Campi e ordine dall'elenco «Ami_100.pdf» caricato dal proprietario del portale il 30/10/2026 " +
  '(i dati per preparare l’ordine, senza modulo): foglio disegnato da Rilievi Impianti ' +
  '(scripts/moduli/ami100.mjs); le scelte fisse dal catalogo AMI100 (tensione 24/48 Vdc, fune del ' +
  'limitatore a sinistra o a destra, guide 7-8-9-16 mm, economizzatore)';

const testo = (key, label, maxLength) => ({ key, kind: 'text', label, maxLength });
const scelte = (titolo, voci) => ({
  titolo,
  campi: voci.map(([key, label]) => ({ key, kind: 'check', label })),
});
const SPESSORE = scelte('Spessore guida [mm]', [
  ['spessore7', '7'],
  ['spessore8', '8'],
  ['spessore9', '9'],
  ['spessore16', '16'],
]);
const TENSIONE = scelte('Tensione di alimentazione', [
  ['tensione24', '24 Vdc'],
  ['tensione48', '48 Vdc'],
]);
const FUNE = scelte('Posizione della fune del limitatore rispetto alla guida', [
  ['funeSinistra', 'Sinistra'],
  ['funeDestra', 'Destra'],
]);
const ECONOMIZZATORE = scelte('Economizzatore', [
  ['economizzatoreSi', 'Sì'],
  ['economizzatoreNo', 'No'],
]);
const INTESTAZIONE = {
  titolo: 'Intestazione',
  righe: [
    { campi: [{ ...testo('mittente', 'Mittente', 120), prefill: 'azienda' }] },
    { campi: [{ ...testo('data', 'Data', 20), prefill: 'data' }] },
    { campi: [{ ...testo('riferimento', 'Riferimento impianto', 120), prefill: 'rif' }] },
  ],
};

const SHEETS = [
  {
    id: 'ami100-mono-ucm',
    titolo: 'AMI 100 Mono UCM',
    file: 'ami100-mono-ucm.pdf',
    righe: [
      { campi: [testo('numeroOrdine', "Numero d'ordine", 30)] },
      { campi: [testo('portata', 'Portata impianto = Q [Kg]', 10)] },
      { campi: [testo('pesoP', 'Peso cabina + peso arcata + peso accessori = P [Kg]', 10)] },
      { campi: [testo('pesoContrappeso', 'Peso contrappeso [Kg]', 10)] },
      SPESSORE,
      TENSIONE,
      FUNE,
      { campi: [testo('fermate', 'Numero delle fermate', 4)] },
      scelte('Sopralzi universali', [
        ['sopralziSi', 'Sì'],
        ['sopralziNo', 'No'],
      ]),
      ECONOMIZZATORE,
    ],
  },
  {
    id: 'ami100-mono-rtbs',
    titolo: 'AMI 100 Mono RTBS',
    file: 'ami100-mono-rtbs.pdf',
    righe: [
      { campi: [testo('disponibilita', 'Disponibilità', 60)] },
      { campi: [testo('numeroOrdine', "Numero d'ordine", 30)] },
      TENSIONE,
      { campi: [testo('codiceAmi', 'Codice AMI 100 MONO RTBS', 40)] },
      { campi: [testo('codiceStaffa', 'Codice staffa', 40)] },
      { campi: [testo('numeroStaffe', 'Numero staffe', 6)] },
      { campi: [testo('codiceSopralzo', 'Codice sopralzo universale', 40)] },
      SPESSORE,
      ECONOMIZZATORE,
      FUNE,
    ],
  },
];

const L = 56;
const R = 539;
const VALUE = 318;

for (const sheet of SHEETS) {
  const map = {
    id: sheet.id,
    titolo: sheet.titolo,
    fonte: FONTE,
    file: sheet.file,
    sha256: '0'.repeat(64),
    tipo: 'overlay',
    dimensione: 10,
    sopraLinea: 2,
    gruppi: [INTESTAZIONE, { titolo: sheet.titolo, righe: sheet.righe }].map((g) =>
      structuredClone(g),
    ),
  };
  const pen = foglio(map, { title: `${sheet.titolo} — dati per l'ordine`, label: 10 });
  const { rect, hline, text, check, line, band } = pen;

  let y = 64;
  text(sheet.titolo.toUpperCase(), L, y + 18, { font: 'bold', size: 24 });
  text("Dati per l'ordine", L, y + 38, { size: 12 });
  y += 62;

  // The sender, the date, the lift.
  rect(L, y, R - L, 92);
  const header = [
    ['Mittente', 'mittente'],
    ['Data', 'data'],
    ['Riferimento impianto', 'riferimento'],
  ];
  header.forEach(([label, key], i) => {
    const base = y + 22 + i * 27;
    text(label, L + 10, base);
    line(key, L + 128, R - 10, base);
  });
  y += 92 + 18;

  band(sheet.titolo.toUpperCase(), L, R, y, 20, 10.5);
  y += 20;
  const rowH = 34;
  rect(L, y, R - L, rowH * sheet.righe.length);
  sheet.righe.forEach((riga, i) => {
    const top = y + i * rowH;
    if (i > 0) hline(L, R, top, 0.4);
    const base = top + rowH / 2 + 3.5;
    const label = riga.titolo ?? riga.campi[0].label;
    // A long label on two lines in its column.
    const words = label.split(' ');
    const lines = [];
    for (const word of words) {
      const last = lines.at(-1);
      const next = last ? `${last} ${word}` : word;
      pen.doc.font('medium').fontSize(10);
      if (last && pen.doc.widthOfString(next) > VALUE - L - 24) lines.push(word);
      else lines[lines.length ? lines.length - 1 : 0] = next;
    }
    lines.forEach((str, j) => text(str, L + 10, base + (j - (lines.length - 1) / 2) * 12));
    if (riga.titolo) {
      let x = VALUE;
      for (const campo of riga.campi) {
        const end = check(campo.key, x, base);
        x = text(campo.label, end + 5, base) + 20;
      }
    } else {
      line(riga.campi[0].key, VALUE, R - 10, base);
    }
  });
  pen.doc
    .moveTo(VALUE - 10, y)
    .lineTo(VALUE - 10, y + rowH * sheet.righe.length)
    .lineWidth(0.4)
    .stroke();

  await pen.salva(sheet.file);
}
