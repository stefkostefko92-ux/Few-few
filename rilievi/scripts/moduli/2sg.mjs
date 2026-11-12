// Draws the blank 2SG order sheet (operators and landing doors) as a clean vector A4 PDF and writes the
// position of every field into its map: assets/moduli/2sg-ordine-porte.pdf + .json. The sheet repeats
// the paper form of 2SG S.r.l. — the same boxes, labels and order — but drawn here, not scanned (the
// owner of the portal, 30/10/2026). The keys, labels and limits of the fields stay those of the map, so
// the sheets already saved in the cards keep their values; only the coordinates and the file change.
//
//   npm run moduli:disegna      (then commit the PDF and the map: the map pins the PDF by its SHA-256)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { portePanels } from './2sg-porte.mjs';
import { foglio, MODULI } from './foglio.mjs';

const FILE = '2sg-ordine-porte.pdf';
const map = JSON.parse(readFileSync(join(MODULI, '2sg-ordine-porte.json'), 'utf8'));
const pen = foglio(map, { title: 'Modulo ordine operatori e sospensioni — 2SG S.r.l.' });
const { rect, hline, vline, text, check, line, area, labelLine, labelCheck, tab, band } = pen;

const L = 34;
const R = 561;
const MID = 297.5;

// ——— Header: sender, date and number, 2SG, reference, deliveries, carrier, packing, destination ———
let y = 34;
const headTop = y;
const COL_A = 352;
const COL_B = 462;
const HEAD_H = 186;
rect(L, headTop, R - L, HEAD_H);
// The column of date, 2SG, deliveries and packing stops above the destination row.
vline(COL_A, headTop, headTop + 158);

tab('MITTENTE:', L, y);
area('mittente', [L + 8, y + 18, COL_A - 8, y + 92], [y + 30, y + 44, y + 58, y + 72, y + 86]);

hline(COL_A, R, y + 22);
vline(COL_B, y, y + 22);
labelLine('DATA:', 'data', COL_A + 6, y + 15, COL_B - 6);
labelLine('ORD No:', 'ordNo', COL_B + 6, y + 15, R - 6);
[
  ['bold', '2SG SRL'],
  ['medium', 'VIA 1° MAGGIO, 13/15'],
  ['medium', '20885 RONCO BRIANTINO (MB) - ITALIA'],
  ['medium', 'TEL    +39 039 6079061'],
  ['medium', 'FAX:   +39 039 6079008'],
  ['medium', 'E_mail: info@2sg.it'],
].forEach(([font, str], i) => text(str, COL_A + 8, y + 38 + i * 11, { font, size: 8.4 }));

y += 100;
hline(L, R, y);
const MID_HEAD = 462;
vline(MID_HEAD, y, y + 58);
tab('RIFERIMENTO ORDINE:', L, y);
line('riferimento', L + 8, COL_A - 8, y + 26);
tab('CONSEGNA OPERATORI:', COL_A, y);
line('consegnaOperatori', COL_A + 6, MID_HEAD - 6, y + 26);
tab('CONSEGNA SOSPENSIONI:', MID_HEAD, y);
line('consegnaSospensioni', MID_HEAD + 6, R - 6, y + 26);

y += 34;
hline(L, COL_A, y);
tab('CORRIERE:', L, y);
line('corriere', L + 8, COL_A - 8, y + 20);
hline(COL_A, R, y + 6);
{
  const base = y + 18;
  let x = text('IMBALLO:', COL_A + 6, base);
  x = labelCheck('SI', 'imballoSi', x + 8, base);
  labelCheck('NO', 'imballoNo', x + 14, base);
  text('PORTO:   FRANCO NS. MAGAZ.', MID_HEAD + 6, base);
}

y += 24;
hline(L, R, y);
tab('DESTINAZIONE MERCE:', L, y);
line('destinazione', L + 8, R - 96, y + 20);
vline(R - 86, y, y + 28);
text('RISERVATO 2SG', R - 80, y + 10, { size: 6.4 });

// ——— The two columns: car doors (operator) and landing doors (suspensions) ———
y = headTop + HEAD_H + 8;
band('PORTE DI CABINA (OPERATORE)', L, MID - 3, y);
band('PORTE DI PIANO (SOSPENSIONI)', MID + 3, R, y);
const colTop = y + 15;
const colH = 214;
rect(L, colTop, MID - 3 - L, colH);
rect(MID + 3, colTop, R - MID - 3, colH);

// Car doors, left half of the column: kind, options, operator.
{
  const x = L + 6;
  const boxX = L + 128;
  const row = (i) => colTop + 14 + i * 12.4;
  const at = (label, key, i) => {
    text(label, x, row(i));
    check(key, boxX, row(i));
  };
  at('AUTOMATICO', 'automatico', 0);
  at('SEMIAUTOMATICO', 'semiautomatico', 1);
  at('EXTRACORSA', 'extracorsaCabina', 2.5);
  at('BLOCCO FUORI PIANO', 'bloccoFuoriPiano', 3.5);
  at('PARAMENTO DI CABINA', 'paramento', 4.5);
  at('PORTE PESANTI => 60Kg', 'portePesanti', 6);
  text('OPERATORE TRIFASE 127Vca:', x, row(7.5));
  at('OPERATORE A BRACCIO OP93', 'operatoreOp93', 8.5);
  text('OPERATORE MONOFASE 230Vca:', x, row(10));
  at('OPERATORE LINEARE "LOUIS"', 'operatoreLouis', 11);
  at('OPERATORE PWM "FLY"', 'operatoreFly', 12);
}
// Car doors, right half: motor, sills.
{
  const x0 = L + 146;
  const x = x0 + 6;
  const boxX = MID - 3 - 14;
  vline(x0, colTop, colTop + 168);
  const row = (i) => colTop + 14 + i * 12;
  const at = (label, key, i) => {
    text(label, x, row(i));
    check(key, boxX, row(i));
  };
  at('MOTORE 125/220VCA', 'motore125', 0);
  at('MOTORE 48 VCC', 'motore48', 1);
  // The voltage and the frequency of another motor: two short lines, one under the other.
  const end = text('MOTORE :', x, row(2.2));
  line('motoreVca', end + 6, end + 46, row(2.2));
  text('VCA', end + 50, row(2.2));
  line('motoreHz', end + 6, end + 46, row(3.2));
  text('HZ', end + 50, row(3.2));
  hline(x0, MID - 3, row(3.9));
  at('NON FORNIRE SOGLIA', 'nonFornireSogliaCabina', 4.8);
  at('SOGLIA RINFORZATA H90', 'sogliaRinforzataCabina', 5.8);
  hline(x0, MID - 3, row(6.5));
  text('SOGLIE CENTRALI 2AO:', x, row(7.4));
  let e = labelCheck('H50', 'centraliH50', x, row(8.4));
  labelCheck('H70', 'centraliH70', e + 10, row(8.4));
  text('SOGLIE TELESCOPICA 2AT/4AO:', x, row(9.5));
  e = labelCheck('H75', 'telescopicaH75', x, row(10.5));
  labelCheck('H90', 'telescopicaH90', e + 10, row(10.5));
  text('SOGLIE TELESCOPICA 3AT/6AT:', x, row(11.6));
  labelCheck('H120', 'telescopicaH120', x, row(12.6));
}
// Notes under the car doors.
{
  const top = colTop + 168;
  hline(L, MID - 3, top);
  text('NOTE:', L + 6, top + 10, { font: 'bold' });
  area('note', [L + 6, top + 12, MID - 9, colTop + colH - 4], [top + 22, top + 34]);
}
// Landing doors.
{
  const x = MID + 9;
  const end = R - 8;
  const row = (i) => colTop + 14 + i * 13.6;
  let e = labelCheck('NON FORNIRE SOGLIA', 'nonFornireSogliaPiano', x, row(0));
  labelCheck('SOGLIA RINFORZATA H90', 'sogliaRinforzataPiano', e + 18, row(0));
  e = x;
  for (const [label, key] of [
    ['H50', 'sogliaH50'],
    ['H70', 'sogliaH70'],
    ['H75', 'sogliaH75'],
    ['H90', 'sogliaH90'],
    ['H120', 'sogliaH120'],
  ])
    e = labelCheck(label, key, e === x ? x : e + 16, row(1));
  hline(MID + 3, R, row(1.65));
  e = text('TELAI:', x, row(2.5));
  e = labelCheck('NO', 'telaiNo', e + 40, row(2.5));
  e = labelCheck('SI', 'telaiSi', e + 12, row(2.5));
  labelLine('NR.', 'telaiNr', e + 14, row(2.5), end);
  labelCheck('VERNICIATI IN ANTIRUGGINE RAL 9002', 'telaiAntiruggine', x, row(3.5));
  e = labelCheck('VERNICIATI A FUOCO BUCCIATI', 'telaiFuoco', x, row(4.5));
  labelLine('RAL NR.', 'telaiRal', e + 14, row(4.5), end);
  labelLine('RIVESTITI IN', 'telaiRivestiti', x, row(5.7), end);
  e = labelCheck('TELAI DI DIMENSIONI SPECIALI:', 'telaiSpeciali', x, row(7));
  text('ALLEGARE DISEGNO', e + 6, row(7));
  hline(MID + 3, R, row(7.65));
  const opt = x + 90;
  text('EXTRACORSA:', x, row(8.5));
  e = labelCheck('NO', 'extracorsaNo', opt, row(8.5));
  labelCheck('SI', 'extracorsaSi', e + 12, row(8.5));
  text('SCASSO BOTTONIERA:', x, row(9.6));
  e = labelCheck('NO', 'scassoNo', opt, row(9.6));
  e = labelCheck('SI', 'scassoSi', e + 12, row(9.6));
  e = text('LxH:', e + 10, row(9.6));
  // Width and height of the cut-out: two lines of the same length.
  const half = (end - e - 18) / 2;
  line('scassoL', e + 4, e + 4 + half, row(9.6));
  text('X', e + 8 + half, row(9.6));
  line('scassoH', e + 18 + half, end, row(9.6));
  text('ALETTE DI FISSAGGIO:', x, row(10.7));
  e = labelCheck('NO', 'aletteNo', opt, row(10.7));
  e = labelCheck('SI', 'aletteSi', e + 12, row(10.7));
  labelLine('MM:', 'aletteMm', e + 14, row(10.7), end);
  labelLine('ALTEZZA DA TERRA (mm):', 'altezzaTerra', x, row(12), end);
}

// ——— Leaves: how many, finish, profiles ———
y = colTop + colH + 8;
rect(L, y, R - L, 66);
{
  const row = (i) => y + 14 + i * 15;
  labelLine('ANTE DI CABINA:  NR.', 'anteCabinaNr', L + 6, row(0), L + 170, { font: 'bold' });
  labelLine('ANTE DI PIANO:  NR.', 'antePianoNr', MID + 9, row(0), MID + 140, { font: 'bold' });
  let e = labelCheck("GREZZE (VERN. ALL'INTERNO)", 'anteGrezze', L + 6, row(1));
  labelCheck('ANTIRUGGINE RAL 9002', 'anteAntiruggine', e + 22, row(1));
  e = labelCheck('VERNICIATE A FUOCO BUCCIATE', 'anteFuoco', MID + 9, row(1));
  labelLine('RAL NR.', 'anteRal', e + 12, row(1), R - 8);
  labelLine('RIVESTITE IN :', 'anteRivestite', L + 6, row(2), R - 8);
  e = labelCheck('PROFILI DI BATTUTA IN ALLUMINIO', 'profiliAlluminio', L + 6, row(3));
  e = text('PROFILI DI BATTUTA IN INOX:', e + 26, row(3));
  e = labelCheck('SCOTCH BRITE', 'inoxScotchBrite', e + 8, row(3));
  e = labelCheck('LUCIDO BA', 'inoxLucidoBa', e + 14, row(3));
  labelCheck('SPECCHIO', 'inoxSpecchio', e + 14, row(3));
}

// ——— Clear opening and kind of door, for the car and for the landings ———
const bottom = portePanels(pen, { top: y + 66 + 8, left: L, mid: MID, right: R });
if (bottom > 841.89 - 24) throw new Error(`the sheet runs off the page (${bottom})`);

map.fonte =
  'Ridisegnato da Rilievi Impianti (scripts/moduli/2sg.mjs) dal modulo cartaceo di 2SG S.r.l. ' +
  '(DATI_RILIEVI_2SG.pdf, scansione caricata dal proprietario del portale il 13/10/2026): stessi campi e ' +
  'stesso ordine, foglio vettoriale A4 al posto della scansione (30/10/2026)';
map.dimensione = 8.4;
map.sopraLinea = 1.6;
delete map.ruota;
await pen.salva(FILE);
