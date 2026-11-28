import { WSheet, area, table, MUTE } from './wlib.mjs';
import { Diagram } from './wdiag.mjs';
import { STRIPS } from './wdata.mjs';

export default function e04() {
  const s = new WSheet({
    n: 'E04',
    title: 'Catena di sicurezza — trazione (collegamenti e morsetti)',
    sub: '48 V c.c. · contatti ad apertura positiva in serie · tratti A, B, C, D letti dal PLC tramite -A7',
  });
  const d = new Diagram(s);
  const cell = 32;
  const y0 = 120;
  const xs = 470;
  const rows = STRIPS.X2.rows.map((r) => ({ t: r.t, sig: r.sig }));
  d.strip('-X2', { x: xs, y: y0, w: 200, rows, cell, titleSub: 'sinistra: quadro · destra: campo' });
  const rowY = (i) => y0 + (i - 1) * cell;

  // catena nel quadro: alimentatore → fusibile → STOP → morsetto 1
  const yc = rowY(1) + cell / 2;
  d.field('-G1', { x: 70, y: rowY(1), w: 70, cell, pins: [{ n: '+', l: '+48 V' }], title: '', side: 'R' });
  s.tx(70 + 35, rowY(1) - 4, '-G1  SMPS 48 V', { size: 8, anchor: 'start', weight: 700 });
  d.field('-F1', { x: 210, y: rowY(1), w: 60, cell, pins: [{ n: 'in', l: '1' }, ], title: '', side: 'L' });
  s.tx(210, rowY(1) - 4, '-F1  2 A', { size: 8, weight: 700 });
    d.field('-SF4', { x: 320, y: rowY(1), w: 70, cell, pins: [{ n: 'in', l: '1' }], title: '', side: 'L' });
  s.tx(320, rowY(1) - 4, '-SF4  STOP quadro', { size: 8, weight: 700 });
  s.ln(140 + 9, yc, 201, yc);
  s.tx(175, yc - 3, '440 BL', { size: 7, anchor: 'middle' });
  s.ln(270, yc, 311, yc);
  s.tx(290, yc - 3, '441 BL', { size: 7, anchor: 'middle' });
  s.ln(390 + 0, yc, 390 + 0, yc);
  s.ln(390, yc, 461, yc);
  s.tx(425, yc - 3, '400 BL', { size: 7, anchor: 'middle' });
  // 0 V
  d.stub('-X2.15', '← -G1:− (0 V 48 V)', { w: '400', c: 'DC', len: 40 });
  // jumper interni
  [[2, 3, '405'], [4, 5, '406'], [6, 7, '407'], [8, 9, '408'], [10, 11, '409'], [12, 13, '417']].forEach(([a, b, w]) => d.conn(`-X2.${a}`, `-X2.${b}`, { w, c: 'DC' }));
  // prese di lettura e uscita verso il relè di sicurezza
  const taps = [[4, '451', '→ -A7:IN1 (tratto A)'], [10, '452', '→ -A7:IN2 (tratto B)'], [12, '453', '→ -A7:IN3 (tratto C)']];
  taps.forEach(([r, w, t]) => {
    d.stub(`-X2.${r}`, t, { w, c: 'DC', len: 110 });
  });
  d.stub('-X2.14', '→ -A7:IN4 (tratto D) · -K10:A1 · -K11:A1 (E06)', { w: '433', c: 'DC', len: 110 });

  // dispositivi di campo allineati ai morsetti
  const fx = 830;
  const F = [
    [1, '-SF1', 'STOP fossa', 'fossa · W201', 'SF1', ['401', '402'], 'W201'],
    [3, '-SF2/-SF3', 'STOP tetto + ispezione (in serie)', 'cabina · XC:1–2', 'SF2', ['403', '404'], 'W210'],
    [5, '-SG1', 'limitatore di velocità', 'macchina/vano · W202', 'SG1', ['411', '412'], 'W202'],
    [7, '-SP1', 'paracadute', 'cabina · XC:3–4', 'SP1', ['413', '414'], 'W210'],
    [9, '-SQ1 · -SQ2 · -SQ3', 'extracorsa alto, basso, ammortizzatori', 'vano/fossa · W203', 'SQ', ['415', '416'], 'W203'],
    [11, 'XP1 … XPn', 'serrature di piano in serie', 'dorsale vano · W204 (E10)', 'XP', ['421', '422'], 'W204'],
    [13, '-SD1', 'porta di cabina', 'cabina · XC:5–6', 'SD1', ['431', '432'], 'W210'],
  ];
  F.forEach(([r, name, title, loc, id, ws, cab]) => {
    d.field(`-${id}`, { x: fx, y: rowY(r), w: 70, cell, pins: ['IN', 'OUT'], title: `${name}  ${title}`, sub: loc });
    d.conn(`-X2.${r}:r`, `-${id}.IN`, { w: ws[0], c: 'DC', cab });
    d.conn(`-X2.${r + 1}:r`, `-${id}.OUT`, { w: ws[1], c: 'DC', cab });
  });
  area(s, xs - 150, y0 - 40, 360 + 20, cell * 15 + 54, 'QUADRO');
  area(s, fx - 40, y0 - 40, 380, cell * 15 + 54, 'CAMPO (vano, macchina, cabina)');
  d.draw();

  // tabella dei tratti
  const ty = y0 + cell * 15 + 36;
  table(
    s,
    60,
    ty,
    [70, 330, 120, 150, 150, 220, 250],
    ['Tratto', 'Elementi in serie', 'Morsetti X2', 'Fili (andata/ritorno)', 'Cavo', 'Lettura PLC', 'Punti di norma'],
    [
      ['A', 'STOP quadro, STOP fossa, STOP tetto, ispezione tetto', '1–2, 3–4', '401/402, 403/404', 'W201, W210', 'I01 (-A7 canale 1)', '5.12.1.11, 5.12.1.5.1.2'],
      ['B', 'limitatore, paracadute, extracorsa, ammortizzatori', '5–6, 7–8, 9–10', '411…416', 'W202, W210, W203', 'I02 (-A7 canale 2)', '5.6.2.2.1.6, 5.12.2'],
      ['C', 'serrature di piano (uno per fermata)', '11–12', '421/422', 'W204', 'I03 (-A7 canale 3)', '5.3.9.1, 5.3.9.4.1'],
      ['D', 'porta di cabina', '13–14', '431/432', 'W210', 'I04 (-A7 canale 4)', '5.3.13.2'],
    ],
    { rh: 15 },
  );
  s.tx(60, ty + 92, 'Le letture passano da -A7 (isolamento, guasto analizzato): EN 81-20:2020 5.11.2.1.2, 5.11.2.3.2–3. Nessun apparecchio in parallelo ai contatti di sicurezza.', { size: 8, c: MUTE });
  s.tx(60, ty + 104, 'Contatti: apertura positiva, IP ≥ 4X, ≥ 10⁶ cicli (5.11.2.2). Sigle e morsetti come nello schema. Bypass porte e UCM: modulo certificato -A5 (E06), mai cavallotti.', { size: 8, c: MUTE });
  return s;
}
