import { Sheet, COL, vBreaker, vContact, vCoil, motor, ground } from './lib.mjs';

// Schema di potenza di principio: argano geared con inverter ad anello chiuso.
export default function t02() {
  const s = new Sheet({
    n: 'T02',
    title: 'Potenza — ascensore elettrico con argano geared (VVVF)',
    subtitle: 'Inverter ad anello chiuso · 2 contattori in serie (opzione economica) oppure STO SIL 3 · freno a doppio circuito',
  });
  const cx = 300; // colonna di potenza
  const P = COL.p400;

  s.text(cx, 58, 'Rete 3~ 400 V + N + PE  (da quadro generale)', { size: 12, weight: 700, anchor: 'middle', c: COL.p230 });
  s.line(cx, 66, cx, 96, { c: COL.p230, w: 3 });
  [-5, 0, 5].forEach((d) => s.line(cx + d - 4, 78, cx + d + 4, 86, { c: COL.p230, w: 1.2 }));
  s.text(cx + 14, 84, '3~', { size: 10, c: COL.p230 });

  vBreaker(s, cx, 96, 'QS1  sezionatore generale lucchettabile', { c: P });
  s.line(cx, 142, cx, 166, { c: P, w: 3 });
  vBreaker(s, cx, 166, 'QF1  magnetotermico + differenziale tipo B', { c: P });
  s.line(cx, 212, cx, 236, { c: P, w: 3 });
  s.box(cx - 80, 236, 160, 40, 'Filtro EMC + reattanza', { fill: COL.fillA, size: 11 });
  s.line(cx, 276, cx, 304, { c: P, w: 3 });

  // inverter
  s.group(cx - 120, 304, 240, 160, 'INVERTER VVVF (anello chiuso)', { c: COL.v24, dash: '' });
  s.text(cx - 100, 340, 'L1 L2 L3', { size: 11 });
  s.text(cx - 100, 440, 'U  V  W', { size: 11 });
  s.text(cx + 40, 336, 'STO1  STO2 (opz. d)', { size: 11, c: COL.sic, weight: 700 });
  s.text(cx + 40, 352, 'ingressi ridondanti', { size: 9.5, c: COL.mute });
  s.text(cx + 8, 404, 'encoder in', { size: 10.5, c: COL.v24 });
  s.text(cx + 8, 420, 'uscite relè: pronto/guasto', { size: 10, c: COL.mute });
  s.line(cx, 440, cx, 478, { c: P, w: 3 });

  // contattori in serie
  vContact(s, cx, 478, { label: 'KM1  contattore di potenza (opz. a)', c: P, h: 44 });
  s.line(cx, 522, cx, 548, { c: P, w: 3 });
  vContact(s, cx, 548, { label: 'KM2  contattore indipendente (opz. a)', c: P, h: 44 });
  s.line(cx, 592, cx, 640, { c: P, w: 3 });
  // resistenza di frenatura
  s.line(cx - 120, 410, cx - 150, 410, { c: P, w: 2 });
  s.line(cx - 150, 410, cx - 150, 440, { c: P, w: 2 });
  s.rect(cx - 162, 440, 24, 40, { c: P });
  s.text(cx - 150, 500, 'RB', { size: 11, anchor: 'middle' });
  s.text(cx - 150, 514, 'resistenza di\nfrenatura', { size: 9.5, anchor: 'middle', c: COL.mute });
  s.line(cx - 150, 480, cx - 150, 490, { c: P, w: 2 });

  // motore
  motor(s, cx, 666, 'M', '3~', { r: 26 });
  s.text(cx + 40, 650, 'Motore asincrono / sincrono', { size: 11, weight: 700 });
  s.text(cx + 40, 666, 'su argano geared', { size: 10.5, c: COL.mute });
  s.text(cx + 40, 682, 'PTC → inverter e PLC', { size: 10.5, c: COL.mute });
  ground(s, cx - 60, 640, P);
  s.text(cx - 60, 668, 'PE', { size: 10, anchor: 'middle' });

  // encoder
  s.box(cx + 240, 716, 150, 44, 'Encoder', { sub: 'incrementale / SinCos (anello chiuso)', fill: COL.fillC, size: 11 });
  s.link([[cx + 240, 738], [cx + 26, 700]], { c: COL.v24, w: 1.6, dash: '4 3' });
  s.link([[cx + 315, 716], [cx + 315, 470], [cx + 120, 408]], { c: COL.v24, w: 1.6, arrow: true });

  // freno
  const bx = 620;
  s.text(bx, 90, 'FRENO — due circuiti indipendenti', { size: 13, weight: 700, c: COL.ink });
  s.box(bx, 106, 250, 54, 'Alimentatore freno', { sub: 'raddrizzatore + eccitazione veloce', fill: COL.fillA, size: 12 });
  s.line(bx + 40, 160, bx + 40, 210, { c: P, w: 2 });
  vContact(s, bx + 40, 210, { label: 'KB1', c: P, h: 40 });
  s.line(bx + 40, 250, bx + 40, 300, { c: P, w: 2 });
  vCoil(s, bx + 40, 300, 'BR1  bobina freno 1', { c: P });
  s.line(bx + 190, 160, bx + 190, 210, { c: P, w: 2 });
  vContact(s, bx + 190, 210, { label: 'KB2', c: P, h: 40 });
  s.line(bx + 190, 250, bx + 190, 300, { c: P, w: 2 });
  vCoil(s, bx + 190, 300, 'BR2  bobina freno 2', { c: P });
  s.text(bx, 384, 'Il PLC comanda KB1/KB2 solo tramite il consenso della catena;', { size: 11 });
  s.text(bx, 400, 'la rilevazione dello stato (feedback) di ciascun freno va al PLC e', { size: 11 });
  s.text(bx, 416, 'al modulo UCM. Meccanica del freno: certificato del costruttore', { size: 11 });
  s.text(bx, 432, 'dell\'argano (non si sostituisce il freno certificato).', { size: 11 });

  // ausiliari
  s.text(bx, 490, 'AUSILIARI (dal sezionatore QS2, separati dalla potenza)', { size: 13, weight: 700 });
  const aux = [
    ['QF2', '230 V luce cabina / FM cabina e vano', COL.p230],
    ['QF3', 'trasformatore → SMPS 48 V (catena)', COL.sic],
    ['QF4', 'SMPS 24 V logica, bus, router, gateway', COL.v24],
    ['QF5', 'caricabatterie ARD / allarme / luce emergenza', COL.warn],
  ];
  aux.forEach(([q, t, c], i) => {
    s.rect(bx, 508 + i * 36, 48, 26, { c, sw: 1.6, r: 3 });
    s.text(bx + 24, 526 + i * 36, q, { size: 11, anchor: 'middle', weight: 700, c });
    s.text(bx + 62, 526 + i * 36, t, { size: 11.5 });
  });

  s.group(1000, 90, 560, 380, 'Note di progetto', { c: COL.mute });
  [
    '1. Il PLC non pilota mai la potenza direttamente: dà il consenso, la catena lo toglie.',
    '2. Arresto del motore da inverter, EN 81-20:2020 5.9.2.5.4: bastano 2 contattori (a),',
    '    OPPURE un STO conforme a EN 61800-5-2 SIL 3 con HFT ≥ 1 (d). Scelta economica: (a);',
    '    con (d) si eliminano KM1/KM2. Non servono entrambi.',
    '3. KM1/KM2: contatti a specchio, retroazione letta dal PLC e dalla catena; se uno resta',
    '    chiuso la ripartenza è bloccata al più tardi alla prossima inversione (5.9.2.5.2).',
    '4. Freno: 2 dispositivi elettromeccanici indipendenti (5.9.2.2.2.3) con retroazione;',
    '    la meccanica del freno è quella certificata dell\'argano.',
    '5. Limitatore di tempo del motore: min(45 s; corsa completa + 10 s, minimo 20 s),',
    '    reset manuale (5.9.2.7). Cablato o in modulo certificato, non solo software.',
    '6. Protezione termica su ogni motore (5.10.4.2); sovratemperatura apparecchi → stop',
    '    al piano e ripartenza dopo raffreddamento (5.10.4.3).',
    '7. Taglia (kW), sezioni e protezioni: dal motore reale; qui solo la struttura.',
  ].forEach((t, i) => s.text(1014, 120 + i * 26, t, { size: 11.5 }));
  s.legend(1300, 520, [
    [COL.p400, 'Potenza 400 V c.a.', ''],
    [COL.p230, 'Rete / 230 V', ''],
    [COL.sic, 'Catena di sicurezza', ''],
    [COL.v24, 'Segnali 24 V', ''],
  ]);
  return s;
}
