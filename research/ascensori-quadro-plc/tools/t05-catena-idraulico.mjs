import { Sheet, COL } from './lib.mjs';
import { row } from './t04-catena-trazione.mjs';

// Catena di sicurezza idraulico: extracorsa solo in alto; comando valvole con 2 dispositivi in serie.
export default function t05() {
  const s = new Sheet({
    n: 'T05',
    title: 'Catena di sicurezza — ascensore idraulico',
    subtitle: 'Extracorsa solo in alto · valvole di discesa con 2 dispositivi in serie · limitatore di tempo del motore',
  });
  const G = COL.sic;
  const yA = 120;
  const yB = 215;
  const yC = 310;
  const xs = 190;
  const xt = 1010;
  const lab = (y, t, sub) => {
    s.text(30, y - 2, t, { size: 12, weight: 700, c: G });
    s.text(30, y + 14, sub, { size: 9.5, c: COL.mute });
  };
  s.box(30, 40, 120, 40, 'SMPS 48 V', { sub: 'SELV · fusibile', fill: COL.fillB, size: 11, c: G });
  s.poly([[90, 80], [90, yA - 40], [xs - 20, yA - 40], [xs - 20, yA], [xs, yA]], { c: G, w: 2.4 });

  lab(yA, 'TRATTO A', 'arresti, ispezione, extracorsa');
  const endA = row(s, yA, xs, [['STOP\nfossa'], ['STOP\ntetto'], ['Ispez.\ntetto'], ['Extra-\ncorsa alto'], ['Fune lenta\n(indiretto)']]);
  s.poly([[endA, yA], [xt, yA], [xt, yB], [xt - 4, yB]], { c: G, w: 2.4 });
  lab(yB, 'TRATTO B', 'serrature piano');
  const endB = row(s, yB, xt - 20, [['Serr.\nP12'], ['…P24', 'dots'], ['altre', 'dots'], ['Serr.\nP3'], ['Serr.\nP2'], ['Serr.\nP1']], -1);
  s.poly([[endB, yB], [xs - 20, yB], [xs - 20, yC], [xs, yC]], { c: G, w: 2.4 });
  lab(yC, 'TRATTO C', 'porta cabina');
  const endC = row(s, yC, xs, [['Porta\ncabina']]);
  s.poly([[endC, yC], [xt, yC]], { c: G, w: 2.4 });
  [[yA, 'I01', 'A'], [yB, 'I02', 'B'], [yC, 'I03', 'C']].forEach(([y, io, t]) => {
    s.dot(xt, y, COL.v24, 3);
    s.poly([[xt, y], [1090, y]], { c: COL.v24, w: 1.5, dash: '3 3', arrow: true });
    s.rect(1096, y - 16, 120, 32, { c: COL.v24, fill: COL.fillC, sw: 1.3, r: 4 });
    s.text(1156, y + 5, `${io} · tratto ${t}`, { size: 11, anchor: 'middle', weight: 700, c: COL.v24 });
  });
  s.text(1096, yA - 38, 'PLC: lettura per diagnosi', { size: 11, weight: 700, c: COL.v24 });
  s.rect(176, yB - 36, xt - 160, yC - yB + 82, { c: COL.warn, dash: '7 4', sw: 1.3, r: 8 });
  s.text(190, yB - 40, 'zona ponticellabile: SOLO modulo CE e BYPASS di manutenzione', { size: 10.5, c: COL.warn, weight: 700 });

  s.poly([[xt, yC], [xt, 420], [700, 420]], { c: G, w: 2.4 });
  s.box(430, 396, 270, 48, 'Interfaccia di sicurezza', { sub: 'relè a contatti guidati o uscite del modulo CE', fill: COL.fillB, size: 12, c: G });

  // uscite
  s.poly([[565, 444], [565, 480]], { c: G, w: 2.4 });
  s.text(40, 480, 'Comando delle uscite (due vie indipendenti)', { size: 13, weight: 700 });
  const outs = [
    ['KM1 + KM2', 'motore in salita: 2 contattori in serie (5.9.3.4.2 a)', 40],
    ['K1 + K2 → YV2/YV3', 'valvole di discesa: 2 dispositivi in serie (5.9.3.4.3 a)', 40 + 320],
    ['Timer motore', 'min(45 s; corsa + 10 s; min 20 s), reset manuale (5.9.3.10)', 40 + 640],
  ];
  outs.forEach(([t, sub, x]) => s.box(x, 500, 300, 70, t, { sub, fill: COL.fillA, size: 12 }));
  s.poly([[565, 480], [190, 480], [190, 500]], { c: G, w: 2.4, arrow: true });
  s.poly([[565, 480], [510, 480], [510, 500]], { c: G, w: 2.4, arrow: true });
  s.poly([[565, 480], [830, 480], [830, 500]], { c: G, w: 2.4, arrow: true });

  const bx = 1040;
  s.box(bx, 400, 250, 90, 'Modulo certificato CE', { sub: 'anticipo apertura e rilivellamento\nUCM idraulico: 2 valvole in serie\ncon autocontrollo (5.6.7.3)', fill: '#fff', c: G, size: 11.5 });
  s.box(bx + 270, 400, 250, 90, 'BYPASS di manutenzione', { sub: 'solo ispezione/emergenza\ncicalino ≥ 55 dB(A) a 1 m', fill: COL.fillD, size: 11.5, c: COL.warn });

  s.group(30, 620, 1500, 300, 'Punti di norma (EN 81-20:2020: solo numero, termine e valore; testo nella base privata, vedi 02-normativa)', { c: COL.mute });
  [
    '5.12.2.1 extracorsa (idraulico: solo in alto) · 5.12.2.3.2 · 5.9.3.4.2 distacco in salita · 5.9.3.4.3 distacco in discesa · 5.9.3.4.4 sorveglianza.',
    '5.9.3.10 limitatore di tempo: min(45 s; corsa a pieno carico + 10 s; minimo 20 s) · 5.9.3.11 temperatura olio (obbligatoria) · 5.10.4.4 sovratemperatura.',
    '5.9.3.5.4.1 valvole · 5.9.3.4.3 discesa · 5.9.3.9.1 discesa manuale ≤ 0,3 m/s · 5.9.3.9.3 zona di sbloccaggio (> 2 piani) · 5.9.3.8.1 vm, vd ≤ 1,0 m/s.',
    '5.12.1.2.1 sovraccarico e rilivellamento · 5.12.1.10 antideriva 15 min · 5.6.7.3 UCM idraulico (2 valvole in serie, autocontrollo) · 5.11.2.1.2 lettura PLC.',
    'Nessun obbligo di pressostato né di rilevamento elettrico di perdite nei testi appresi (02-normativa, sezione 12): il trasduttore di pressione è una scelta di diagnosi.',
    'Modernizzazione: UNI 10411-2 14.5 e 10411-12 14.3 (gruppo valvole), 14.4.1 / 14.2.1 (centralina) — verificare la conformità «all\'originale».',
  ].forEach((t, i) => s.text(46, 652 + i * 32, t, { size: 11.5 }));
  s.legend(1300, 520, [
    [COL.sic, 'Catena 48 V c.c. (cablata)', ''],
    [COL.v24, 'Lettura per diagnosi', '3 3'],
    [COL.warn, 'Ponticello consentito', '5 3'],
  ]);
  return s;
}
