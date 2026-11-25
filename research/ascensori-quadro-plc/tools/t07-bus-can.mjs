import { Sheet, COL } from './lib.mjs';

// Topologia dei bus: due segmenti CAN indipendenti (cabina e piani), ciascuno terminato alle due estremità.
export default function t07() {
  const s = new Sheet({
    n: 'T07',
    title: 'Bus CAN: cabina e piani (12 fermate, espandibile a 24)',
    subtitle: 'Due segmenti separati sulla CPU: CAN1 cabina (cavo mobile) · CAN2 piani (dorsale nel vano)',
  });

  // quadro
  s.group(40, 60, 250, 360, 'QUADRO', { c: COL.ink, dash: '' });
  const cpu = s.box(60, 90, 210, 100, 'CPU PLC', { sub: 'due porte CAN (CAN1 e CAN2)\no 2 gateway CAN-Ethernet', fill: COL.fillC });
  const psu = s.box(60, 330, 210, 60, 'Alimentazione 24 V', { sub: 'protetta · una coppia per segmento', fill: COL.fillC });
  s.text(276, 112, 'CAN2', { size: 10.5, c: COL.can, weight: 700 });
  s.text(276, 162, 'CAN1', { size: 10.5, c: COL.can, weight: 700 });
  [[120, 'R 120 Ω'], [170, 'R 120 Ω']].forEach(([y]) => {
    s.rect(292, y - 6, 30, 12, { c: COL.can, fill: '#fff', sw: 1.2 });
    s.text(307, y + 18, '120 Ω', { size: 8.5, anchor: 'middle', c: COL.can });
  });

  // vano
  const vx = 500;
  s.group(vx - 40, 50, 760, 700, 'VANO DI CORSA (vista schematica)', { c: COL.mute });
  // cabina
  s.rect(vx + 20, 290, 200, 150, { c: COL.ink, sw: 2, fill: COL.fillA, r: 4 });
  s.text(vx + 120, 308, 'CABINA', { size: 12, weight: 700, anchor: 'middle' });
  const cop = s.box(vx + 32, 322, 82, 38, 'COP', { sub: 'pulsanti 12-24', fill: COL.fillD, size: 11 });
  const dsp = s.box(vx + 126, 322, 82, 38, 'Display', { sub: 'frecce · gong', fill: COL.fillD, size: 11 });
  const dor = s.box(vx + 32, 372, 82, 38, 'Porte', { sub: 'inverter', fill: COL.fillD, size: 11 });
  const pes = s.box(vx + 126, 372, 82, 38, 'Pesacarico', { sub: 'carico', fill: COL.fillD, size: 11 });
  s.text(vx + 120, 430, 'cass. derivazione cabina', { size: 9.5, anchor: 'middle', c: COL.mute });
  // cavo mobile
  s.poly([[270, 170], [350, 170], [350, 360], [vx + 20, 360]], { c: COL.can, w: 2.4 });
  s.text(362, 200, 'CAN1: cavo mobile', { size: 11, c: COL.can, weight: 700 });
  s.text(362, 216, '2 fili CAN + schermo +\n24 V (coppie dedicate)', { size: 10, c: COL.mute });

  // dorsale piani: verticale a destra della cabina
  const bx = vx + 420;
  s.poly([[270, 120], [bx, 120], [bx, 700]], { c: COL.can, w: 2.4 });
  s.text(bx + 14, 112, 'CAN2: dorsale nel vano (stub ≤ 0,3 m)', { size: 11, c: COL.can, weight: 700 });
  const n = 12;
  const y0 = 150;
  const step = 42;
  for (let i = 0; i < n; i++) {
    const y = y0 + i * step;
    const fl = n - i;
    s.line(vx + 250, y + 18, vx + 380, y + 18, { c: COL.mute, w: 1, dash: '3 3' });
    s.text(vx + 258, y + 14, `Piano ${fl}`, { size: 10.5, c: COL.mute });
    s.line(bx, y + 18, bx + 18, y + 18, { c: COL.can, w: 2 });
    s.rect(bx + 18, y + 4, 128, 30, { fill: COL.fillD, c: COL.can, sw: 1.2, r: 3 });
    s.text(bx + 82, y + 17, `Nodo N${fl}`, { size: 10.5, anchor: 'middle', weight: 700 });
    s.text(bx + 82, y + 29, '2 tasti · LED · gong', { size: 8.5, anchor: 'middle', c: COL.mute });
    s.dot(bx, y + 18, COL.can, 3);
  }
  s.rect(bx + 18, y0 + n * step + 6, 128, 40, { c: COL.can, dash: '5 4', sw: 1.2, fill: '#fff', r: 3 });
  s.text(bx + 82, y0 + n * step + 24, 'Piani 13…24', { size: 11, anchor: 'middle', weight: 700, c: COL.can });
  s.text(bx + 82, y0 + n * step + 38, 'espansione (T16)', { size: 9, anchor: 'middle', c: COL.mute });
  s.poly([[bx, y0 + n * step + 20], [bx, y0 + n * step + 70]], { c: COL.can, w: 2.4 });
  s.box(bx - 18, y0 + n * step + 70, 36, 22, '120Ω', { fill: '#fff', size: 8.5, c: COL.can });

  // catena delle serrature (fisica) accanto ai nodi
  s.poly([[vx + 395, y0 + 6], [vx + 395, y0 + (n - 1) * step + 24]], { c: COL.sic, w: 2.4 });
  s.text(vx + 385, 140, 'catena serrature piano', { size: 10, c: COL.sic, weight: 700, anchor: 'middle' });
  s.text(vx + 385, 152, '(2 fili, T04)', { size: 9, c: COL.sic, anchor: 'middle' });

  // note tecniche
  s.group(40, 450, 400, 300, 'Regole del bus (da verificare in progetto esecutivo)', { c: COL.mute });
  const lines = [
    'Velocità 125 kbit/s: lunghezza massima 500 m per segmento',
    '(raccomandazione CiA 102); vano da 24 fermate ≈ 80–100 m.',
    'Cavo: coppia twistata schermata 120 Ω; schermo a terra solo',
    'a un'+"'"+'estremità (quadro); stub ≤ 0,3 m; terminazione 120 Ω',
    'ai due capi di ogni segmento.',
    'Indirizzi nodo: DIP-switch o pulsante di auto-assegnazione;',
    'nodo di piano = indirizzo del piano (1…24).',
    'Alimentazione 24 V per nodo: ≈ 50 mA → 24 nodi ≈ 1,2 A',
    '(sezione e caduta da calcolare).',
    'Il bus non porta mai segnali di sicurezza: chiavi pompieri e',
    'serrature sono cablate (vedi T04 e punti EN 81-73 in',
    '02-normativa).',
    'Guasto del bus = ascensore fermo al piano con porte',
    'apribili, mai movimento incontrollato.',
  ];
  lines.forEach((t, i) => s.text(54, 482 + i * 17, t, { size: 11 }));

  s.legend(1330, 640, [
    [COL.can, 'Bus CAN (segnali + 24 V)', ''],
    [COL.sic, 'Catena serrature (cablata)', ''],
    [COL.mute, 'Quota di piano (indicativa)', '3 3'],
  ]);
  return s;
}
