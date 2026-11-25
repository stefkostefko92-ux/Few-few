import { Sheet, COL } from './lib.mjs';

// Vista frontale indicativa del quadro (trazione). Scala grafica 1 mm = 0,5 px.
export default function t15() {
  const s = new Sheet({
    n: 'T15',
    title: 'Disposizione fisica del quadro (vista frontale, indicativa)',
    subtitle: 'Armadio 800 × 1000 × 300 mm per trazione fino a 15 kW · idraulico: vedi tabella',
  });
  const X = 60;
  const Y = 60;
  const w = 400;
  const h = 500;
  s.rect(X, Y, w, h, { c: COL.ink, sw: 3, fill: '#f8fafc', r: 4 });
  s.text(X + w / 2, Y - 8, '800 mm', { size: 11, anchor: 'middle', c: COL.mute });
  s.text(X - 10, Y + h / 2, '1000 mm', { size: 11, anchor: 'middle', c: COL.mute, rotate: -90 });

  const row = (y, label) => {
    s.line(X + 8, y, X + w - 8, y, { c: '#94a3b8', w: 5 });
    s.text(X + 12, y - 4, label, { size: 8.5, c: COL.mute });
  };
  const comp = (x, y, cw, ch, t, fill = COL.fillA, c = COL.ink) => {
    s.rect(X + x, Y + y, cw, ch, { fill, c, sw: 1.2, r: 2 });
    const sz = Math.min(10, (cw - 4) / (t.length * 0.62));
    s.text(X + x + cw / 2, Y + y + ch / 2 + 3, t, { size: Math.max(7, sz), anchor: 'middle', weight: 600 });
  };

  // riga 1: ingresso
  row(Y + 20, '');
  comp(14, 22, 44, 50, 'QS1', COL.fillR, COL.p230);
  comp(62, 22, 34, 50, 'QF1', COL.fillR, COL.p230);
  comp(100, 22, 34, 50, 'QF2', COL.fillR, COL.p230);
  comp(138, 22, 34, 50, 'QF3', COL.fillR, COL.p230);
  comp(176, 22, 56, 50, 'Filtro EMC', COL.fillA);
  comp(236, 22, 70, 50, 'Reattanza', COL.fillA);
  comp(310, 22, 76, 50, 'Res. frenatura', COL.fillA);
  // riga 2: inverter
  comp(14, 88, 190, 118, 'INVERTER VVVF + STO', COL.fillC, COL.v24);
  comp(212, 88, 56, 56, 'KM1', COL.fillA);
  comp(272, 88, 56, 56, 'KM2', COL.fillA);
  comp(332, 88, 54, 56, 'KB freno', COL.fillA);
  comp(212, 150, 174, 56, 'Alim. freno + porte', COL.fillA);
  // riga 3: alimentatori
  comp(14, 222, 84, 70, 'SMPS 48 V', COL.fillB, COL.sic);
  comp(102, 222, 84, 70, 'SMPS 24 V', COL.fillC, COL.v24);
  comp(190, 222, 100, 70, 'Caricabatt. ARD', COL.fillD);
  comp(294, 222, 92, 70, 'Batterie', COL.fillD);
  // riga 4: controllo
  comp(14, 308, 100, 76, 'PLC CPU + I/O', COL.fillC, COL.v24);
  comp(118, 308, 70, 76, 'Nodi CAN / I/O remoto', COL.fillD);
  comp(192, 308, 90, 76, 'Gateway web', COL.fillE);
  comp(286, 308, 100, 76, 'Router 5G + AP', COL.fillE);
  // riga 5: sicurezza
  comp(14, 400, 120, 50, 'Modulo CE (bypass · UCM)', COL.fillB, COL.sic);
  comp(138, 400, 70, 50, 'Relè sicurezza', COL.fillB, COL.sic);
  comp(212, 400, 80, 50, 'Limit. tempo (idr.)', COL.fillB, COL.sic);
  comp(296, 400, 90, 50, 'Teleallarme', COL.fillD);
  // riga 6: morsettiere
  comp(14, 462, 90, 28, 'X1 potenza', '#fff');
  comp(108, 462, 90, 28, 'X2 sicurezza', '#fff', COL.sic);
  comp(202, 462, 90, 28, 'X3 CAN/24 V', '#fff', COL.can);
  comp(296, 462, 90, 28, 'X4 cabina/vano', '#fff');

  // sportello
  const DX = 520;
  s.rect(DX, Y, 240, h, { c: COL.ink, sw: 3, fill: '#fff', r: 4 });
  s.text(DX + 120, Y - 8, 'SPORTELLO (esterno)', { size: 11, anchor: 'middle', c: COL.mute });
  s.box(DX + 20, Y + 24, 200, 72, 'Display locale 4–7"', { sub: 'stato · guasti · parametri\nsolo lettura senza chiave', fill: COL.fillC, size: 12 });
  s.circle(DX + 60, Y + 150, 20, { c: COL.ink, fill: COL.fillD });
  s.text(DX + 60, Y + 154, 'SERV', { size: 10, anchor: 'middle', weight: 700 });
  s.text(DX + 60, Y + 188, 'chiave\nSERVIZIO', { size: 10, anchor: 'middle' });
  s.circle(DX + 180, Y + 150, 20, { c: COL.rf, fill: '#fff' });
  s.text(DX + 180, Y + 154, 'Wi-Fi', { size: 10, anchor: 'middle', weight: 700, c: COL.rf });
  s.text(DX + 180, Y + 188, 'pulsante\n10 min', { size: 10, anchor: 'middle' });
  s.box(DX + 20, Y + 230, 200, 54, 'LED di stato', { sub: 'rete · catena · bus · 5G · allarme', fill: COL.fillA, size: 12 });
  s.box(DX + 20, Y + 300, 200, 54, 'Manovra di ispezione', { sub: 'salita · discesa · abilita\n(se prevista nel quadro)', fill: COL.fillD, size: 12 });
  s.box(DX + 20, Y + 370, 200, 54, 'Targa e schemi', { sub: 'marcatura, tensioni, schema\nin tasca porta-schemi', fill: COL.fillA, size: 12 });
  s.text(DX + 120, Y + 450, 'Sportello con serratura.\nIP2X dietro la chiusura;\nsezionatore azionabile da fuori.', { size: 10.5, anchor: 'middle', c: COL.mute });

  // tabella varianti
  const TX = 800;
  s.group(TX, 40, 760, 560, 'Armadi indicativi (da dimensionare con i dati reali dell\'azionamento)', { c: COL.mute });
  const T = [
    ['Variante', 'Armadio', 'Note'],
    ['Trazione ≤ 7,5 kW, 12 fermate', '600×800×250', 'inverter a parete o su guida; dissipazione ≈ 3 % della potenza'],
    ['Trazione ≤ 15 kW, fino a 24 fermate', '800×1000×300', 'come in figura; nessun componente in più per le fermate'],
    ['Idraulico con soft starter', '600×800×250', 'niente inverter né reattanza; soft starter + contattore di by-pass'],
    ['Idraulico con inverter', '800×1000×300', 'inverter con reattanza + filtro EMC; valvola proporzionale'],
    ['Senza locale macchine (MRL)', 'in architrave o nel vano', 'accessibile per manutenzione dal piano; ingombro minimo'],
  ];
  const cw = [250, 140, 340];
  T.forEach((r, i) => {
    let x = TX + 14;
    r.forEach((c, j) => {
      s.text(x, 80 + i * 44, c, { size: i === 0 ? 12 : 11, weight: i === 0 ? 700 : 400 });
      x += cw[j];
    });
    s.line(TX + 10, 92 + i * 44, TX + 750, 92 + i * 44, { c: COL.grid, w: 1 });
  });
  s.text(TX + 14, 330, 'Regole di montaggio', { size: 12.5, weight: 700 });
  [
    '• Separare nel canale: 400 V (nero) · 48 V sicurezza (verde) · 24 V + CAN (blu/arancio).',
    '• Potenza e bus in canali diversi o a ≥ 100 mm, con schermi a terra solo dal lato quadro.',
    '• Morsetti con ponticelli di prova sulla catena di sicurezza e punto di misura per ogni tratto.',
    '• Ventilazione o termostato, riscaldamento anticondensa se il quadro è in ambiente freddo.',
    '• Targhetta per ogni conduttore, schemi in tasca; sezionatore lucchettabile.',
    '• I punti di misura della catena e il modulo CE sono accessibili senza smontare altro.',
    '• Aerazione del locale e del vano: vedere 02-normativa (scheda VSA 2016).',
  ].forEach((t, i) => s.text(TX + 14, 356 + i * 28, t, { size: 11.5 }));
  return s;
}
