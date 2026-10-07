import { WSheet, area, table, term, vcont, coil, hcont, MUTE } from './wlib.mjs';
import { Diagram } from './wdiag.mjs';
import { SHEETS, PROJ, COLORS, WIRE_RANGES } from './wdata.mjs';

export default function e00() {
  const s = new WSheet({ n: 'E00', title: SHEETS[0][1], sub: 'Schemi di collegamento — serie E00…E18' });
  // intestazione
  s.tx(60, 80, 'QUADRO DI MANOVRA A PLC PER ASCENSORI', { size: 22, weight: 700 });
  s.tx(60, 102, 'Schemi di collegamento · trazione elettrica (argano geared) e idraulico', { size: 12 });
  s.tx(60, 120, `Commessa: ${PROJ.commessa} · ${PROJ.impianto}`, { size: 9.5, c: MUTE });
  s.tx(60, 134, `Alimentazione: ${PROJ.rete} · catena di sicurezza 48 V c.c. · logica 24 V c.c. · ausiliari 230 V c.a.`, { size: 9.5, c: MUTE });

  // indice fogli
  const rows = SHEETS.map(([n, t]) => [n, t]);
  table(s, 60, 160, [50, 520], ['Foglio', 'Titolo'], rows, { rh: 17, size: 9 });
  s.tx(60, 160 + 17 * (rows.length + 1) + 16, 'Zone del foglio: colonne 1–16 in alto e in basso, righe A–H ai lati (riferimenti incrociati: «E04/C7»).', { size: 8, c: MUTE });

  // legenda dei segni grafici
  const lx = 700;
  area(s, lx, 160, 440, 340, 'Legenda dei segni grafici');
  const d = new Diagram(s);
  d.device('-Axx', { x: lx + 20, y: 190, w: 100, title: 'Apparecchio', sub: 'piedini a sinistra/destra', L: ['1', '2'], R: ['3', '4'], rowH: 14 });
  s.tx(lx + 140, 210, 'Apparecchio del quadro con designazione (-A1, -U1, -K10 …)', { size: 8 });
  d.strip('-Xn', { x: lx + 20, y: 276, w: 100, rows: [{ t: '1', sig: 'segnale' }, { t: '2', sig: 'segnale' }], cell: 15 });
  s.tx(lx + 140, 285, 'Morsettiera: sinistra = lato quadro, destra = lato campo', { size: 8 });
  d.field('-SQn', { x: lx + 20, y: 320, w: 60, cell: 20, pins: ['IN', 'OUT'], title: '', sub: '' });
  s.tx(lx + 140, 342, 'Apparecchio di campo allineato ai morsetti (titolo a destra)', { size: 8 });
  s.ln(lx + 20, 392, lx + 110, 392);
  s.tx(lx + 65, 389, '401 BL', { size: 7, anchor: 'middle' });
  s.tx(lx + 65, 400, 'W201', { size: 6, anchor: 'middle', c: MUTE, italic: true });
  s.tx(lx + 140, 395, 'Filo: numero + colore; sigla cavo sotto (corsivo)', { size: 8 });
  s.ln(lx + 20, 425, lx + 70, 425);
  s.poly([[lx + 70, 422], [lx + 75, 425], [lx + 70, 428]], { c: '#111', w: 1, fill: '#111' });
  s.tx(lx + 80, 428, '→ E06 -K10:A1', { size: 7.5 });
  s.tx(lx + 200, 428, 'Rimando ad altro foglio (destinazione)', { size: 8 });
  term(s, lx + 25, 458, '');
  s.tx(lx + 40, 461, 'Morsetto / punto di giunzione (●)', { size: 8 });
  s.junction(lx + 250, 458);
  s.bx(lx + 300, 450, 40, 16, { dash: '8 3 2 3' });
  s.tx(lx + 346, 462, 'Area funzionale', { size: 8 });

  // codice colori
  const cx = 1160;
  area(s, cx, 160, 380, 200, 'Colori dei conduttori (da verificare su EN 60204-1)');
  const crow = [
    ['NE', 'nero', 'potenza c.a. e c.c.'], ['RS', 'rosso', 'comando c.a.'], ['BL', 'blu', 'comando c.c. (24 V, 48 V)'],
    ['AR', 'arancio', 'interblocco da fonte esterna'], ['AZ', 'azzurro', 'neutro'], ['GV', 'giallo/verde', 'PE'],
    ['SC', 'schermo', 'calza/schermo'], ['NUM', 'numerato', 'cavo mobile (conduttori numerati)'],
  ];
  table(s, cx + 12, 190, [45, 90, 220], ['Sigla', 'Colore', 'Uso'], crow, { rh: 16, size: 8.5 });

  // designazioni e numerazione
  area(s, cx, 380, 380, 400, 'Designazioni (EN 81346) e numeri di filo');
  const des = [
    ['-QS / -QF / -QR', 'sezionatore / magnetotermico / differenziale'],
    ['-KM / -KB / -K / -KA', 'contattori / freno / relè / relè ausiliari'],
    ['-G / -F / -T', 'alimentatori / fusibili / trasformatori'],
    ['-U / -M / -B / -Y', 'inverter / motori / sensori / bobine'],
    ['-S / -H', 'interruttori, finecorsa / segnalazioni'],
    ['-A1…-A9', 'PLC, I/O, gateway, router, modulo CE, ecc.'],
    ['-X / XC / XP', 'morsettiere / cabina / nodi di piano'],
  ];
  table(s, cx + 12, 410, [120, 245], ['Sigla', 'Significato'], des, { rh: 16, size: 8 });
  const wr = Object.entries(WIRE_RANGES).map(([k, [a, b]]) => `${k} ${a}–${b}`);
  s.tx(cx + 12, 560, 'Intervalli dei numeri di filo per foglio:', { size: 8.5, weight: 700 });
  for (let i = 0; i < wr.length; i += 3) s.tx(cx + 12, 576 + (i / 3) * 14, wr.slice(i, i + 3).join('   ·   '), { size: 8 });
  // avvertenze
  area(s, 60, 590, 1080, 190, 'Ipotesi e avvertenze');
  [
    'Caso di riferimento: motore 7,5 kW su argano geared, inverter 11 kW / 24 A anello chiuso, 12 fermate (24 con +12 nodi di piano). Tutti i valori sono di esempio.',
    'Sezioni, correnti, curve di sgancio, potere di interruzione, lunghezze e cadute di tensione vanno ricalcolati dal progettista con i dati di targa (EN 60204-1).',
    'I morsetti dei costruttori (inverter, PLC, comunicatore, modulo CE, operatore porte) sono indicati con nomi generici: vanno sostituiti con quelli del componente scelto.',
    'La catena di sicurezza è cablata (contatti ad apertura positiva); il PLC la legge solo tramite -A7 (EN 81-20:2020 5.11.2.1.2). Il PLC non fa parte della catena.',
    'Moduli certificati (bypass porte, UCM, eventuale STO SIL 3) vanno acquistati con certificato di esame di tipo e installati secondo le loro istruzioni.',
    'Questi fogli sono schemi di riferimento per lo studio di fattibilità: non sono un esecutivo, non valgono come dichiarazione di conformità.',
    'Norme citate solo con numero di punto e valore; il testo delle norme (UNI/EN/ISO) non è riprodotto.',
  ].forEach((t, i) => s.tx(72, 616 + i * 22, t, { size: 8.5 }));
  return s;
}
