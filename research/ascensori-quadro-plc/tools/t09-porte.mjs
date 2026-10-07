import { Sheet, COL } from './lib.mjs';

export default function t09() {
  const s = new Sheet({
    n: 'T09',
    title: 'Controllo delle porte',
    subtitle: 'Operatore con inverter proprio · il PLC comanda e legge, la sicurezza resta nella catena',
  });
  const plc = s.box(40, 100, 200, 90, 'PLC', { sub: 'Q10 apri · Q11 chiudi\nI23 aperta · I24 chiusa · I25 barriera', fill: COL.fillC, size: 13 });
  const op = s.box(340, 100, 220, 90, 'Operatore porte', { sub: 'inverter dedicato\nrampe e coppia proprie', fill: COL.fillA, size: 13 });
  const mot = s.box(660, 100, 200, 90, 'Motore + cinghia', { sub: 'anta cabina → anta piano', fill: COL.fillA, size: 13 });
  const acc = s.box(960, 100, 220, 90, 'Accoppiatore', { sub: 'sblocca la serratura\nin zona di sbloccaggio', fill: COL.fillA, size: 13 });
  s.link([plc.r, op.l], { c: COL.v24, label: '24 V', ly: -8 });
  s.link([op.r, mot.l], { c: COL.p400, w: 3 });
  s.link([mot.r, acc.l], { c: COL.ink });
  s.link([[400, 190], [400, 240], [200, 240], [200, 190]], { c: COL.v24, label: 'limiti aperto/chiuso (I23, I24)', ly: 16 });
  const bar = s.box(340, 300, 220, 80, 'Barriera / costa', { sub: 'protezione 25–1 800 mm\nsenza contatto fisico', fill: COL.fillD, size: 13 });
  s.link([[500, 300], [500, 190]], { c: COL.v24, label: 'riapertura', lx: 34 });
  s.link([[340, 340], [90, 340], [90, 190]], { c: COL.v24, label: 'I25', ly: -6 });
  const ctc = s.box(660, 300, 220, 80, 'Contatti di sicurezza', { sub: 'serratura piano (tratto C)\nporta cabina (tratto D)', fill: COL.fillB, size: 13, c: COL.sic });
  s.link([ctc.r, [960, 340], [1000, 340]], { c: COL.sic, w: 2.4, arrow: false });
  s.text(1010, 344, 'verso la catena (T04) — mai al PLC come comando', { size: 11, c: COL.sic, weight: 700 });

  s.group(40, 440, 1500, 520, 'Valori e punti di norma', { c: COL.mute });
  const T = [
    ['Grandezza', 'Valore', 'Punto'],
    ['Energia cinetica delle porte automatiche', '≤ 10 J', 'EN 81-20:2020 5.3.6.2.2.1 a)'],
    ['Forza di arresto', '≤ 150 N', '5.3.6.2.2.1 c)'],
    ['Copertura della riapertura automatica', '25 … 1 600 mm; ostacolo Ø 50 mm', '5.3.6.2.2.1 b)'],
    ['Protezione senza contatto (accessibilità)', '25 … 1 800 mm dalla soglia', 'EN 81-70:2005 5.2.4'],
    ['Pulsante di riapertura in cabina', 'obbligatorio con porte automatiche', '5.3.6.3'],
    ['Zona di sbloccaggio', '≤ 0,20 m (≤ 0,35 m con porte motorizzate accoppiate)', '5.3.8.1'],
    ['Moto con porta aperta', 'solo livellamento ≤ 0,80 m/s, rilivellamento ≤ 0,30 m/s', '5.12.1.4'],
    ['Tempo porte aperte (installatore, non utente)', 'regolabile, tipico 2–20 s; DM 236/1989: ≥ 8 s aperte, chiusura ≥ 4 s', 'EN 81-70:2005 5.2.3; DM 236/1989 8.1.12'],
    ['Porte manuali: cabina ferma', '≥ 2 s dopo l\'arresto', '5.12.4.1'],
    ['Ostruzione prolungata / guasto della protezione', 'forza ridotta ≤ 4 J + avviso acustico a ogni chiusura', '5.3.6.2.2.1 b)'],
    ['Controllo dei contatti porta in zona', 'guasto → niente servizio normale', '5.12.1.9'],
  ];
  T.forEach((r, i) => {
    const y = 480 + i * 36;
    s.text(56, y, r[0], { size: i ? 11.5 : 12, weight: i ? 400 : 700 });
    s.text(560, y, r[1], { size: i ? 11.5 : 12, weight: i ? 400 : 700 });
    s.text(1180, y, r[2], { size: i ? 11 : 12, weight: i ? 400 : 700, c: i ? COL.mute : COL.ink });
    s.line(50, y + 12, 1530, y + 12, { c: COL.grid, w: 1 });
  });
  s.legend(1330, 90, [[COL.v24, 'Segnali 24 V', ''], [COL.sic, 'Catena', ''], [COL.p400, 'Potenza', '']]);
  return s;
}
