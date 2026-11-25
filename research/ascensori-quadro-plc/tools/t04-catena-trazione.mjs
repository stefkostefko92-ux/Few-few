import { Sheet, COL, hSafety } from './lib.mjs';

// Disegna una riga di contatti in serie. dir = 1 (verso destra) o -1 (verso sinistra).
export function row(s, y, xStart, items, dir = 1, { w = 56, gap = 14 } = {}) {
  const G = COL.sic;
  let x = xStart;
  items.forEach(([t, kind], i) => {
    const x0 = dir === 1 ? x : x - w;
    if (kind === 'dots') {
      s.rect(x0, y - 14, w, 28, { c: G, dash: '4 3', sw: 1.2, r: 3, fill: '#fff' });
      s.text(x0 + w / 2, y + 5, '…', { size: 14, anchor: 'middle', weight: 700, c: G });
      s.text(x0 + w / 2, y + 30, t, { size: 9, anchor: 'middle', c: COL.mute });
    } else {
      hSafety(s, x0, y, '', { w });
      s.text(x0 + w / 2, y + 22, t, { size: 9.5, anchor: 'middle' });
    }
    const x1 = dir === 1 ? x + w : x - w;
    if (i < items.length - 1) s.line(x1, y, x1 + dir * gap, y, { c: G, w: 2.4 });
    x = x1 + dir * gap;
  });
  return x - dir * gap; // coordinata del lato di uscita dell'ultimo elemento
}

export default function t04() {
  const s = new Sheet({
    n: 'T04',
    title: 'Catena di sicurezza — ascensore elettrico (trazione)',
    subtitle: 'Contatti ad apertura positiva in serie · bypass porte solo con modulo certificato · il PLC legge, non scavalca',
  });
  const G = COL.sic;
  const yA = 120;
  const yB = 215;
  const yC = 310;
  const yD = 405;
  const xs = 190; // inizio contatti
  const xt = 1010; // curva a destra

  const lab = (y, t, sub) => {
    s.text(30, y - 2, t, { size: 12, weight: 700, c: G });
    s.text(30, y + 14, sub, { size: 9.5, c: COL.mute });
  };

  // alimentazione
  s.box(30, 40, 120, 40, 'SMPS 48 V', { sub: 'SELV · fusibile', fill: COL.fillB, size: 11, c: G });
  s.poly([[90, 80], [90, yA - 40], [xs - 20, yA - 40], [xs - 20, yA], [xs, yA]], { c: G, w: 2.4 });
  s.text(160, yA - 46, '+48 V', { size: 10, c: G, weight: 700 });

  // TRATTO A
  lab(yA, 'TRATTO A', 'arresti e ispezione');
  const endA = row(s, yA, xs, [['STOP\nfossa'], ['STOP\ntetto'], ['Ispez.\ntetto'], ['STOP\nspazi']].map(([t]) => [t]));
  s.poly([[endA, yA], [xt, yA], [xt, yB], [xt - 4, yB]], { c: G, w: 2.4 });
  // TRATTO B (verso sinistra)
  lab(yB, 'TRATTO B', 'limitatori e extracorsa');
  const endB = row(s, yB, xt - 20, [['Limit.\nvelocità'], ['Para-\ncadute'], ['Fine-\ncorsa alto'], ['Fine-\ncorsa basso'], ['Ammor-\ntizzatori']], -1);
  s.poly([[endB, yB], [xs - 20, yB], [xs - 20, yC], [xs, yC]], { c: G, w: 2.4 });
  // TRATTO C
  lab(yC, 'TRATTO C', 'serrature piano');
  const endC = row(s, yC, xs, [['Serr.\nP1'], ['Serr.\nP2'], ['Serr.\nP3'], ['altre', 'dots'], ['Serr.\nP12'], ['…P24', 'dots']]);
  s.poly([[endC, yC], [xt, yC], [xt, yD], [xt - 4, yD]], { c: G, w: 2.4 });
  // TRATTO D (verso sinistra)
  lab(yD, 'TRATTO D', 'porta cabina');
  const endD = row(s, yD, xt - 20, [['Porta\ncabina']], -1);
  // taps verso PLC
  [[yA, 'I01', 'A', endA], [yB, 'I02', 'B', endB], [yC, 'I03', 'C', endC], [yD, 'I04', 'D', endD]].forEach(([y, io, t, ex], i) => {
    const px = xt + 40;
    s.dot(xt, y, COL.v24, 3);
    s.poly([[xt, y], [1090, y]], { c: COL.v24, w: 1.5, dash: '3 3', arrow: true });
    s.rect(1096, y - 16, 120, 32, { c: COL.v24, fill: COL.fillC, sw: 1.3, r: 4 });
    s.text(1156, y + 5, `${io} · tratto ${t}`, { size: 11, anchor: 'middle', weight: 700, c: COL.v24 });
  });
  s.text(1096, yA - 38, 'PLC: lettura per diagnosi', { size: 11, weight: 700, c: COL.v24 });
  s.text(1096, yA - 24, '(interfaccia isolata, T06)', { size: 9.5, c: COL.mute });

  // zona ponticellabile (C + D)
  s.rect(176, yC - 50, xt - 160, yD - yC + 100, { c: COL.warn, dash: '7 4', sw: 1.3, r: 8 });
  s.text(190, yC - 54, 'zona ponticellabile: SOLO dal modulo CE e dal BYPASS di manutenzione', { size: 10.5, c: COL.warn, weight: 700 });

  // uscita verso interfaccia
  s.poly([[endD, yD], [xs - 20, yD], [xs - 20, 500]], { c: G, w: 2.4 });
  s.box(xs - 160, 500, 280, 70, 'Interfaccia di sicurezza', { sub: 'relè a contatti guidati o uscite del modulo CE', fill: COL.fillB, size: 12, c: G });
  s.link([[xs - 20, 570], [xs - 20, 610]], { c: G, w: 2.4 });
  s.box(xs - 160, 610, 460, 70, 'KM1 · KM2 · KB1 · KB2 · STO', { sub: 'tolgono coppia e chiudono i freni; retroazione al modulo e al PLC', fill: COL.fillA, size: 12 });

  // modulo CE e bypass
  const m = s.box(520, 500, 330, 94, 'Modulo certificato CE', { sub: 'anticipo apertura e rilivellamento\n2 sensori di zona porta · esame di tipo\nSIL minimo: prospetto A.1 (02-normativa)', fill: '#fff', c: G, size: 12 });
  const bp = s.box(880, 500, 250, 94, 'BYPASS di manutenzione', { sub: 'nel quadro, solo ispezione/emergenza\ncicalino e luce lampeggiante\nsotto la cabina', fill: COL.fillD, size: 12, c: COL.warn });
  s.poly([[685, 500], [685, yD + 50]], { c: COL.warn, dash: '5 3', w: 1.8, arrow: true });
  s.poly([[1005, 500], [1005, yD + 50]], { c: COL.warn, dash: '5 3', w: 1.8, arrow: true });

  // note
  s.group(30, 720, 1500, 260, 'Punti di norma da rispettare (solo numero e valore; testo e dettagli: 02-normativa e base privata)', { c: COL.mute });
  [
    'EN 81-20:2020 5.11.2.2.1 — contatto di sicurezza: IP ≥ 4X, ≥ 10⁶ cicli · 5.11.2.2.2 — apertura positiva · 5.11.2.2.3 — isolamento 250 V (IP4X) / 500 V.',
    '5.11.2.1.2 — collegamenti in parallelo e prelievi di informazioni dalla catena: la lettura del PLC (I01…I04) va fatta con interfaccia isolata e guasto analizzato',
    '             secondo 5.11.2.3.2 e 5.11.2.3.3, oppure con modulo di monitoraggio certificato (scelta di progetto, da far validare).',
    '5.12.1.4 — porte aperte in zona di sbloccaggio: livellamento ≤ 0,80 m/s, rilivellamento ≤ 0,30 m/s · 5.12.1.8 — bypass di manutenzione, ≥ 55 dB(A) a 1 m sotto la cabina.',
    '5.12.1.9 — controllo dei contatti porta in zona di sbloccaggio · 5.12.1.11 — dispositivi di arresto (EN 60947-5-5), vietati in cabina (5.12.1.11.3).',
    '5.11.2.6 — PESSRAL: SIL minimo dal prospetto A.1; EN 81-50:2020 5.15/5.16 · 5.11.2.3.5 — targa e n° del certificato di esame di tipo sui dispositivi con elettronica.',
    '5.11.1.2 — elenco dei guasti da considerare (a…j): l\'analisi di guasto dell\'intero quadro va nel fascicolo tecnico.',
  ].forEach((t, i) => s.text(46, 752 + i * 28, t, { size: 11.5 }));
  s.legend(1300, 500, [
    [COL.sic, 'Catena 48 V c.c. (cablata)', ''],
    [COL.v24, 'Lettura per diagnosi', '3 3'],
    [COL.warn, 'Ponticello consentito', '5 3'],
  ]);
  return s;
}
