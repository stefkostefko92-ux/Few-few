import { Sheet, COL } from './lib.mjs';

export default function t08() {
  const s = new Sheet({
    n: 'T08',
    title: 'Cabina, cavo mobile e dispositivi del vano',
    subtitle: 'Conduttori del cavo mobile (indicativi, +10–20 % di riserva) · uguali da 12 a 24 fermate',
  });
  // cabina
  s.group(30, 50, 560, 560, 'CABINA E TETTO', { c: COL.ink, dash: '' });
  const b = [
    ['COP', 'pulsanti 12–24 · display · voce', COL.fillD],
    ['Operatore porte', 'inverter proprio · limiti aperto/chiuso', COL.fillA],
    ['Barriera / costa', 'protezione porte 25–1 800 mm', COL.fillA],
    ['Pesacarico', '4–20 mA · sovraccarico ≥ +10 %, min 75 kg', COL.fillA],
    ['Citofono + pulsante giallo', 'EN 81-28 · comunicatore 4G/5G', COL.fillD],
    ['Luce cabina + emergenza', '≥ 100 lx · emergenza ≥ 5 lx per 1 h', COL.fillA],
    ['Sensori zona porta ×2', 'verso modulo CE (T04)', COL.fillB],
    ['Contatto porta cabina', 'catena tratto D (T04)', COL.fillB],
    ['Ispezione tetto', 'commutatore · salita · discesa · MARCIA · STOP', COL.fillB],
    ['Scatola di derivazione', 'morsettiera di cabina · uscita cavo mobile', COL.fillC],
  ];
  b.forEach(([t, sub, fill], i) => {
    const x = 50 + (i % 2) * 270;
    const y = 80 + Math.floor(i / 2) * 100;
    s.box(x, y, 250, 80, t, { sub, fill, size: 12 });
  });
  // cavo
  const rows = [
    ['Catena di sicurezza 48 V c.c.: tetto, paracadute, porta cabina (3 anelli andata/ritorno)  · XC 1–6', '6', COL.sic],
    ['Segnali 24 V: ispezione attiva, sovraccarico, carico completo  · XC 7–9', '3', COL.v24],
    ['Operatore porte: porta aperta, chiusa, barriera/costa  · XC 10–12', '3', COL.v24],
    ['Allarme (copia del comunicatore)  · XC 13', '1', COL.v24],
    ['Pesacarico 4–20 mA (coppia schermata)  · XC 14–15', '2', COL.v24],
    ['Comandi: porte apri/chiudi, luce cabina  · XC 16–18', '3', COL.v24],
    ['CAN1: H, L, schermo, +24 V, 0 V (coppia twistata schermata)  · XC 19–23', '5', COL.can],
    ['Luce cabina 230 V (L, N, PE)  · XC 24–26', '3', COL.p230],
    ['Operatore porte 230 V (L, N, PE)  · XC 27–29', '3', COL.p230],
    ['Citofono / comunicatore (fonia A/B, +24 V, 0 V)  · XC 30–33', '4', COL.warn],
    ['Luce di emergenza (carica, segnale)  · XC 34–35', '2', COL.warn],
    ['Ispezione tetto (salita, discesa, +24 V, 0 V)  · XC 36–39', '4', COL.sic],
    ['Sensori zona porta ×2 (segnali + alimentazione)  · XC 41–44', '4', COL.sic],
    ['Terra di protezione  · XC 45', '1', COL.ink],
    ['Riserva  · XC 40, 46–48', '4', COL.mute],
  ];
  s.group(630, 50, 920, 560, 'CAVO MOBILE (conduttori)', { c: COL.mute });
  rows.forEach(([t, n, c], i) => {
    const y = 88 + i * 31;
    s.line(650, y - 10, 700, y - 10, { c, w: 5 });
    s.text(714, y - 5, t, { size: 11.5 });
    s.text(1520, y - 5, n, { size: 12, anchor: 'end', weight: 700, c });
  });
  s.line(650, 88 + rows.length * 31 - 12, 1530, 88 + rows.length * 31 - 12, { c: COL.ink, w: 1 });
  s.text(714, 88 + rows.length * 31 + 8, 'Totale (morsettiera XC, foglio E11)', { size: 12.5, weight: 700 });
  s.text(1520, 88 + rows.length * 31 + 8, '48 conduttori numerati + schermi', { size: 12.5, anchor: 'end', weight: 700 });

  s.group(30, 640, 1520, 330, 'Vano: dispositivi e punti di norma (EN 81-20:2020, numero e valore)', { c: COL.mute });
  [
    'Contatti serratura di piano · 5.3.9.1 (blocco, SIL 3) · 5.3.9.1.2 impegno ≥ 7 mm · 5.3.8.1 zona di sbloccaggio ≤ 0,20 m (≤ 0,35 m con porte motorizzate accoppiate).',
    'Fossa · 5.2.1.5.1: STOP (≤ 1,60 m di profondità: uno; > 1,60 m: due), ispezione entro 0,30 m dal rifugio, presa 2P+PE, luce vano ≥ 50 lx (5.2.1.4.1).',
    'Tetto cabina · 5.4.8: ispezione entro 0,30 m dal rifugio, STOP ≤ 1 m dall\'accesso, presa 2P+PE · 5.12.1.5.2.1 ispezione ≤ 0,63 m/s (≤ 0,30 m/s con ≤ 2,0 m di spazio).',
    'Extracorsa · 5.12.2.1 (trazione: alto e basso; idraulico: solo alto) · 5.12.2.2.1 organo distinto da quello della fermata normale.',
    'Limitatore di velocità e paracadute (trazione) · 5.6.2.2.1.6 (DES a SIL 2) · 5.6.2.1.5 (paracadute, SIL 1) · cavo del limitatore: nessun comando wireless (5.6.2.2.1.4 c) 1)).',
    'Sensori di zona porta · 5.12.1.4: 2 sensori indipendenti verso il modulo CE (SIL 2) · il PLC ne riceve una copia per la manovra.',
    'Allarme dalla fossa e dal tetto · 5.2.1.6: dispositivi di allarme nei punti dove si può restare intrappolati.',
    'Cavi pendenti · 5.10.6.1: EN 50214 / IEC 60227-6 / IEC 60245-5 · sezione minima da EN 60204-1 prosp. 5.',
  ].forEach((t, i) => s.text(46, 672 + i * 34, t, { size: 11.5 }));
  return s;
}
