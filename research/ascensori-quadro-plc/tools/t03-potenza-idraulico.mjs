import { Sheet, COL, vBreaker, vContact, motor, ground } from './lib.mjs';

// Schema di potenza di principio: centralina idraulica con blocco valvole.
export default function t03() {
  const s = new Sheet({
    n: 'T03',
    title: 'Potenza — ascensore idraulico (centralina + blocco valvole)',
    subtitle: '2 contattori in salita · 2 dispositivi in serie sulle valvole di discesa · limitatore di tempo · discesa di emergenza',
  });
  const cx = 280;
  const P = COL.p400;
  s.text(cx, 58, 'Rete 3~ 400 V + N + PE', { size: 12, weight: 700, anchor: 'middle', c: COL.p230 });
  s.line(cx, 66, cx, 96, { c: COL.p230, w: 3 });
  vBreaker(s, cx, 96, 'QS1  sezionatore generale', { c: P });
  s.line(cx, 142, cx, 166, { c: P, w: 3 });
  vBreaker(s, cx, 166, 'QF1  magnetotermico (avviamento pesante)', { c: P });
  s.line(cx, 212, cx, 240, { c: P, w: 3 });
  vContact(s, cx, 240, { label: 'KM1', c: P });
  s.line(cx, 284, cx, 306, { c: P, w: 3 });
  vContact(s, cx, 306, { label: 'KM2', c: P });
  s.line(cx, 350, cx, 376, { c: P, w: 3 });
  s.box(cx - 90, 376, 180, 56, 'Soft starter', { sub: 'rampa di avviamento', fill: COL.fillA, size: 12 });
  s.line(cx, 432, cx, 520, { c: P, w: 3 });
  s.poly([[cx - 90, 360], [cx - 130, 360], [cx - 130, 452], [cx, 452]], { c: P, w: 2, dash: '5 3' });
  s.text(cx - 134, 410, 'KM3\nby-pass', { size: 10.5, anchor: 'end' });
  motor(s, cx, 546, 'M', '3~', { r: 26 });
  s.text(cx + 40, 538, 'Motore della pompa (in olio)', { size: 11, weight: 700 });
  s.text(cx + 40, 554, 'PTC avvolgimento', { size: 10.5, c: COL.mute });
  ground(s, cx - 60, 520, P);

  // timer cablato
  s.rect(cx + 120, 250, 230, 96, { fill: COL.fillB, c: COL.sic, sw: 1.8, r: 4 });
  s.text(cx + 235, 276, 'Limitatore di tempo', { size: 12.5, anchor: 'middle', weight: 700, c: COL.sic });
  s.text(cx + 235, 294, 'del motore (cablato)', { size: 11, anchor: 'middle', c: COL.sic });
  s.text(cx + 235, 316, 'min(45 s; corsa a pieno carico + 10 s,', { size: 10, anchor: 'middle', c: COL.mute });
  s.text(cx + 235, 330, 'minimo 20 s) · reset manuale', { size: 10, anchor: 'middle', c: COL.mute });
  s.link([[cx + 120, 262], [cx + 14, 262]], { c: COL.sic, w: 1.8, dash: '5 3' });
  s.text(cx - 16, 262, 'contattori indipendenti', { size: 10, anchor: 'end', c: COL.mute });

  // idraulica
  const hx = 740;
  s.text(hx, 70, 'CIRCUITO IDRAULICO', { size: 13, weight: 700, c: COL.hyd });
  s.box(hx, 90, 190, 54, 'Serbatoio olio', { sub: 'livello · PTC olio / temperatura', fill: COL.fillC, size: 12 });
  s.box(hx, 180, 190, 54, 'Pompa', { sub: 'collegata al motore M', fill: COL.fillC, size: 12 });
  s.box(hx, 280, 260, 150, 'Blocco valvole', { sub: 'saracinesca · valvola di non ritorno\nvalvola di sovrappressione (≤ 140 %)\nvalvole di discesa (aperte elettricamente)\ndiscesa manuale ≤ 0,3 m/s · pompa a mano\nmanometro con saracinesca', fill: COL.fillC, size: 12, c: COL.hyd });
  s.box(hx + 300, 280, 190, 150, 'Cilindro + stantuffo', { sub: 'tubazione rigida\nvalvola di blocco\nsul cilindro', fill: COL.fillC, size: 12, c: COL.hyd });
  s.link([[hx + 95, 144], [hx + 95, 180]], { c: COL.hyd, w: 3 });
  s.link([[hx + 95, 234], [hx + 95, 280]], { c: COL.hyd, w: 3 });
  s.link([[hx + 260, 355], [hx + 300, 355]], { c: COL.hyd, w: 3, both: true });
  s.poly([[cx + 26, 546], [hx - 80, 546], [hx - 80, 207], [hx, 207]], { c: COL.hyd, w: 1.6, dash: '5 3' });
  s.text(hx - 86, 530, 'albero motore → pompa', { size: 10, c: COL.hyd, anchor: 'end' });

  // bobine valvole con due dispositivi in serie in discesa
  s.text(hx, 466, 'COMANDO VALVOLE (24 V c.c.)', { size: 13, weight: 700 });
  const vv = [
    ['YV1', 'salita (by-pass)', 0],
    ['YV2', 'discesa', 2],
    ['YV3', 'livellamento', 2],
    ['YV4', 'discesa di emergenza (batteria)', 0],
  ];
  vv.forEach(([a, b, k], i) => {
    const y = 486 + i * 44;
    s.line(hx - 40, y + 13, hx, y + 13, { c: COL.v24, w: 1.6 });
    if (k) {
      ['K1', 'K2'].forEach((c, j) => {
        s.rect(hx + j * 54, y, 44, 26, { c: COL.sic, sw: 1.4, r: 3 });
        s.text(hx + j * 54 + 22, y + 17, c, { size: 10.5, anchor: 'middle', weight: 700, c: COL.sic });
        if (j === 0) s.line(hx + 44, y + 13, hx + 54, y + 13, { c: COL.v24, w: 1.6 });
      });
      s.line(hx + 98, y + 13, hx + 118, y + 13, { c: COL.v24, w: 1.6 });
    } else s.line(hx, y + 13, hx + 118, y + 13, { c: COL.v24, w: 1.6 });
    s.rect(hx + 118, y, 48, 26, { c: COL.hyd, sw: 1.6, r: 3 });
    s.text(hx + 142, y + 17, a, { size: 11, anchor: 'middle', weight: 700, c: COL.hyd });
    s.text(hx + 176, y + 17, b + (k ? '  — 2 dispositivi in serie' : ''), { size: 11 });
  });

  // sensori
  s.group(1250, 70, 310, 360, 'Sensori sul PLC (non di sicurezza)', { c: COL.mute });
  [
    'Sensore di temperatura olio: obbligatorio',
    '  (5.9.3.11): stop e discesa al piano basso.',
    'Trasduttore di pressione: diagnosi, carico,',
    '  perdite (utile, non richiesto da norma).',
    'Livello olio minimo nel serbatoio.',
    'Retroazione KM1/KM2/KM3 e valvole.',
    'Zona di sbloccaggio visibile senza rete',
    '  (5.9.3.9.3, oltre 2 piani).',
    'Sensori di zona porta e finecorsa alto.',
  ].forEach((t, i) => s.text(1264, 104 + i * 28, t, { size: 11.5 }));

  s.group(740, 720, 820, 200, 'Punti di norma (EN 81-20:2020, solo numero e valore)', { c: COL.mute });
  [
    '5.9.3.4.2 salita · 5.9.3.4.3 discesa · 5.9.3.4.4 sorveglianza · 5.9.3.10 limitatore di tempo: min(45 s; corsa + 10 s; min 20 s).',
    '5.9.3.5.3.2 valvola di sovrappressione ≤ 140 % · 5.9.3.8.1 vm, vd ≤ 1,0 m/s · 5.9.3.9.1 discesa manuale ≤ 0,3 m/s.',
    '5.12.1.10 antideriva 15 min · 5.12.2.3.2 extracorsa idraulico · 5.9.3.11 temperatura olio.',
    'Il blocco valvole e il cilindro hanno certificato proprio: si comandano secondo la loro scheda.',
  ].forEach((t, i) => s.text(754, 752 + i * 28, t, { size: 11 }));
  s.legend(1300, 470, [
    [COL.p400, 'Potenza 400 V c.a.', ''],
    [COL.hyd, 'Olio / idraulica', ''],
    [COL.sic, 'Catena di sicurezza', ''],
  ]);
  return s;
}
