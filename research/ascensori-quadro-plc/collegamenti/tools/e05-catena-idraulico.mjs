import { WSheet, area, table, MUTE } from './wlib.mjs';
import { Diagram } from './wdiag.mjs';
import { STRIPS, SHEETS } from './wdata.mjs';

export default function e05() {
  const s = new WSheet({
    n: 'E05',
    title: SHEETS.find((x) => x[0] === 'E05')[1],
    sub: '48 V c.c. · limitatore e paracadute non usati · extracorsa alto · tratti A, B, C, D letti tramite -A7',
  });
  const d = new Diagram(s);
  const cell = 32;
  const y0 = 120;
  const xs = 470;
  const rows = STRIPS.X2.rows.map((r) => ({ t: r.t, sig: r.sig }));
  d.strip('-X2', { x: xs, y: y0, w: 200, rows, cell, titleSub: 'sinistra: quadro · destra: campo' });
  const rowY = (i) => y0 + (i - 1) * cell;
  const rc = (i) => rowY(i) + cell / 2;
  const P = (k) => d._pin(k);

  // filo orizzontale con etichetta centrata (numero + colore sopra, sigla cavo sotto)
  const wire = (a, b, w, cab = '') => {
    const A = P(a);
    const B = P(b);
    s.ln(A.x, A.y, B.x, B.y, { w: 1 });
    const mx = (A.x + B.x) / 2;
    s.tx(mx, A.y - 3, `${w} BL`, { size: 7, anchor: 'middle' });
    if (cab) s.tx(mx, A.y + 9, cab, { size: 6, anchor: 'middle', c: MUTE, italic: true });
  };
  // blocchetto a due piedini (contatto o fusibile): L e R dentro il riquadro
  const blk = (id, x, y, w, txtL, txtR, noL = false) => {
    s.bx(x, y + 3, w, cell - 6, { w: 1.1 });
    if (!noL) s.ln(x, y + cell / 2, x - 9, y + cell / 2, { w: 0.9 });
    s.ln(x + w, y + cell / 2, x + w + 9, y + cell / 2, { w: 0.9 });
    s.tx(x + 5, y + cell / 2 + 3, txtL, { size: 7.5 });
    s.tx(x + w - 5, y + cell / 2 + 3, txtR, { size: 7.5, anchor: 'end' });
    d.pins[`${id}.L`] = { x: x - 9, y: y + cell / 2, side: 'L' };
    d.pins[`${id}.R`] = { x: x + w + 9, y: y + cell / 2, side: 'R' };
  };

  // ---- catena nel quadro: alimentatore → fusibile → STOP quadro → morsetto 1
  const y1 = rowY(1);
  blk('-G1', 70, y1, 70, '+48 V', '', true);
  blk('-F1', 210, y1, 60, '1', '2');
  blk('-SF4', 320, y1, 70, '1', '2');
  s.tx(70, y1 - 1, '-G1  alimentatore 48 V', { size: 8, weight: 700 });
  s.tx(210, y1 - 1, '-F1  2 A', { size: 8, weight: 700 });
  s.tx(320, y1 - 1, '-SF4  STOP quadro', { size: 8, weight: 700 });
  wire('-G1.R', '-F1.L', '440');
  wire('-F1.R', '-SF4.L', '441');
  wire('-SF4.R', '-X2.1', '400');
  // 0 V
  d.stub('-X2.15', '← -G1:− (0 V 48 V)', { w: '400', c: 'DC', len: 40 });

  // ---- ponticelli interni lato quadro (come E04) e prese di lettura verso -A7
  [[2, 3, '405'], [4, 5, '406'], [6, 7, '407'], [8, 9, '408'], [10, 11, '409'], [12, 13, '417']].forEach(([a, b, w]) => d.conn(`-X2.${a}`, `-X2.${b}`, { w, c: 'DC' }));
  [[4, '451', '→ -A7:IN1 (tratto A)'], [10, '452', '→ -A7:IN2 (tratto B)'], [12, '453', '→ -A7:IN3 (tratto C)']].forEach(([r, w, t]) => d.stub(`-X2.${r}`, t, { w, c: 'DC', len: 110 }));
  d.stub('-X2.14', '→ -A7:IN4 (tratto D) · -K10:A1 · -K11:A1 (E06)', { w: '433', c: 'DC', len: 110 });

  // ---- sul lato quadro, FUORI catena: limitatore di tempo -KT1 e pressostato (non richiesto)
  d.field('-KT1', { x: 190, y: rowY(6), w: 60, cell, pins: [{ n: '15', l: '15' }, { n: '16', l: '16' }], title: '-KT1  limitatore di tempo', sub: 'contatto NC nel consenso KM (E02)', note: 'fuori catena · 5.9.3.10', side: 'L' });
  d.stub('-KT1.15', '← E02 -K12', { w: '', len: 30 });
  d.stub('-KT1.16', '→ E06 consenso', { w: '', len: 30 });
  s.bx(190, rowY(8) + 4, 60, cell * 2 - 8, { dash: '4 3', w: 0.9 });
  s.tx(220, rowY(8) + cell, 'non installato', { size: 7, anchor: 'middle', c: MUTE, italic: true });
  s.tx(258, rowY(8) + 15, '-SP2  pressostato', { size: 9.5, weight: 700 });
  s.tx(258, rowY(8) + 26, 'non richiesto: nessuna funzione di sicurezza', { size: 7.5, c: MUTE });
  s.tx(258, rowY(8) + 37, 'non entra in catena', { size: 7, c: MUTE, italic: true });

  // ---- lato campo
  const fx = 840;
  const mk = (r, id, name, title, loc, cab, w1, w2) => {
    d.field(id, { x: fx, y: rowY(r), w: 70, cell, pins: ['IN', 'OUT'], title: `${name}  ${title}`, sub: loc });
    wire(`-X2.${r}:r`, `${id}.IN`, w1, cab);
    wire(`-X2.${r + 1}:r`, `${id}.OUT`, w2, cab);
  };
  mk(1, '-SF1', '-SF1', 'STOP fossa', 'fossa · W201', 'W201', '401', '402');
  mk(3, '-SF2', '-SF2/-SF3', 'STOP tetto + ispezione (in serie)', 'cabina · XC:1–2', 'W210', '403', '404');
  mk(11, '-SL', 'XP1 … XPn', 'serrature di piano in serie', 'dorsale vano · W204 (E10)', 'W204', '421', '422');
  mk(13, '-SD1', '-SD1', 'porta di cabina', 'cabina · XC:5–6', 'W210', '431', '432');

  // righe 5–8: limitatore e paracadute non usati → ponticelli fissi lato campo
  [[5, 6, '460'], [7, 8, '461']].forEach(([a, b, w]) => {
    const A = P(`-X2.${a}:r`);
    const B = P(`-X2.${b}:r`);
    const cx = A.x + 16;
    s.pl([[A.x, A.y], [cx, A.y], [cx, B.y], [B.x, B.y]], { w: 1 });
    s.junction(A.x, A.y);
    s.junction(B.x, B.y);
    const my = (A.y + B.y) / 2;
    s.tx(cx + 14, my - 2, `${w} BL`, { size: 7 });
    s.tx(cx + 14, my + 7, 'non usato (idraulico)', { size: 7, c: MUTE, italic: true });
  });
  s.bx(fx, rowY(5) + 4, 330, cell * 4 - 8, { dash: '4 3', w: 0.9 });
  s.tx(fx + 8, rowY(5) + 42, '-SG1 limitatore di velocità · -SP1 paracadute', { size: 9, weight: 700 });
  s.tx(fx + 8, rowY(5) + 55, 'non usati (idraulico): ponticelli fissi in morsettiera, 5↔6 e 7↔8', { size: 7.5, c: MUTE });
  s.tx(fx + 8, rowY(5) + 67, 'i morsetti 5…8 restano nella catena per tenerla uguale al foglio E04', { size: 7.5, c: MUTE });
  s.tx(fx + 8, rowY(5) + 79, 'non togliere i ponticelli: la catena resta chiusa solo con essi', { size: 7.5, c: MUTE });

  // righe 9–10: extracorsa ALTO -SQ1 + fune lenta -SQ6 (opzionale) in serie
  const bw = 70;
  const sqx = fx;
  const sq1y = rowY(9);
  const sq6y = rowY(10);
  blk('-SQ1', sqx, sq1y, bw, 'IN', 'OUT');
  blk('-SQ6', sqx, sq6y, bw, 'OUT', 'IN');
  wire('-X2.9:r', '-SQ1.L', '415', 'W203');
  wire('-X2.10:r', '-SQ6.L', '416', 'W203');
  const ra = P('-SQ1.R');
  const rb = P('-SQ6.R');
  const ux = ra.x + 18;
  s.pl([[ra.x, ra.y], [ux, ra.y], [ux, rb.y], [rb.x, rb.y]], { w: 1 });
  s.tx(ux + 5, (ra.y + rb.y) / 2 + 3, '462 BL', { size: 7 });
  s.tx(ux + 50, sq1y + 14, '-SQ1  extracorsa alto', { size: 9.5, weight: 700 });
  s.tx(ux + 50, sq1y + 25, 'vano · W203 · 5.12.2.1', { size: 7.5, c: MUTE });
  s.tx(ux + 50, sq6y + 14, '-SQ6  fune lenta (opzionale)', { size: 9.5, weight: 700 });
  s.tx(ux + 50, sq6y + 25, 'solo con azione indiretta, in serie a -SQ1', { size: 7.5, c: MUTE });

  area(s, 50, y0 - 40, 650, cell * 15 + 54, 'QUADRO');
  area(s, fx - 40, y0 - 40, 400, cell * 15 + 54, 'CAMPO (vano, macchina, cabina)');
  d.draw();

  // ---- tabella dei tratti
  const ty = y0 + cell * 15 + 36;
  table(
    s,
    60,
    ty,
    [70, 360, 110, 160, 140, 220, 220],
    ['Tratto', 'Elementi in serie', 'Morsetti X2', 'Fili (andata/ritorno)', 'Cavo', 'Lettura PLC', 'Punti di norma'],
    [
      ['A', 'STOP quadro, STOP fossa, STOP tetto, ispezione tetto', '1–2, 3–4', '401/402, 403/404', 'W201, W210', 'I01 (-A7 canale 1)', '5.12.1.11, 5.12.1.5.1.2'],
      ['B', 'solo extracorsa alto -SQ1 (+ fune lenta -SQ6, opz.)', '5…8 ponticelli · 9–10', '460, 461 · 415/416 (462)', 'W203', 'I02 (-A7 canale 2)', '5.12.2.1'],
      ['C', 'serrature di piano (uno per fermata)', '11–12', '421/422', 'W204', 'I03 (-A7 canale 3)', '5.3.9.1, 5.3.9.4.1'],
      ['D', 'porta di cabina', '13–14', '431/432', 'W210', 'I04 (-A7 canale 4)', '5.3.13.2'],
    ],
    { rh: 15 },
  );
  // ---- note
  const ny = ty + 15 * 5 + 18;
  s.tx(60, ny, 'Note', { size: 8.5, weight: 700 });
  const notes = [
    'Ipotesi di esempio: idraulico a 12 fermate, senza limitatore di velocità né paracadute; rinvio alla morsettiera -X2 identica a E04 (stessi morsetti e fili 401…432).',
    'Extracorsa: solo limite alto -SQ1 (EN 81-20:2020 5.12.2.1); il contatto di fune lenta -SQ6 serve solo con azione indiretta del pistone. Limite basso e ammortizzatori: non in catena nell\'esempio.',
    'Fuori catena: -KT1 (limitatore di tempo del motore, reset manuale, 5.9.3.10) agisce sul consenso dei contattori (E02, E06). Nessun pressostato obbligatorio: -SP2 non installato.',
    'UCM idraulico: modulo certificato -A5 (E06), due valvole in serie con autocontrollo, 5.6.7.3; bypass delle porte solo tramite -A5, mai cavallotti.',
    'Letture da -A7 (isolamento, guasto analizzato): 5.11.2.1.2, 5.11.2.3.2–3. Contatti ad apertura positiva, IP ≥ 4X, ≥ 10⁶ cicli (5.11.2.2). Nessun apparecchio in parallelo ai contatti di sicurezza.',
    'Fili 460…462 nuovi (E05); i fili 451…453 e 433 come in E04 (letture -A7 e fine catena verso E06). Alimentazione -G1 e -F1: E03.',
  ];
  notes.forEach((t, i) => s.tx(60, ny + 13 + i * 12, `${i + 1}. ${t}`, { size: 8, c: MUTE }));
  return s;
}
