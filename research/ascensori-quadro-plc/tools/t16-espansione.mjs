import { Sheet, COL } from './lib.mjs';

export default function t16() {
  const s = new Sheet({
    n: 'T16',
    title: 'Espansione da 12 a 24 fermate',
    subtitle: 'Stessa CPU, stesso quadro, stesso inverter: si aggiungono solo nodi di piano e un modulo pulsanti',
  });

  const colX = [80, 330];
  [[12, 0], [24, 1]].forEach(([n, k]) => {
    const x = colX[k];
    s.group(x - 30, 50, 220, 640, n === 12 ? 'BASE: 12 fermate' : 'ESPANSO: 24 fermate', { c: COL.mute });
    const step = n === 12 ? 44 : 22;
    const hh = n === 12 ? 36 : 17;
    for (let i = 0; i < n; i++) {
      const fl = n - i;
      const y = 90 + i * step;
      const extra = fl > 12;
      s.rect(x, y, 160, hh, { fill: extra ? COL.fillD : COL.fillC, c: extra ? COL.can : COL.v24, sw: 1.1, r: 2 });
      s.text(x + 80, y + hh / 2 + 4, `Piano ${fl} · nodo N${fl}`, { size: n === 12 ? 11 : 9.5, anchor: 'middle', weight: 600 });
    }
  });
  s.text(80, 660, 'tratto blu = base (T07)', { size: 10.5, c: COL.v24 });
  s.text(330, 660, 'tratto arancio = piani 13…24 (nuovi)', { size: 10.5, c: COL.can });

  // tabella delta
  const TX = 600;
  s.group(TX, 50, 960, 640, 'Che cosa cambia (e che cosa no)', { c: COL.mute });
  const rows = [
    ['Elemento', '12 fermate', '24 fermate', 'Variazione'],
    ['CPU PLC, alimentatori, quadro', '1', '1', 'nessuna (da verificare la corrente 24 V)'],
    ['Nodi di piano sul bus CAN2', '12', '24', '+ 12 nodi (indirizzi 13…24)'],
    ['Pulsantiera di cabina (COP)', '1 modulo', '1–2 moduli', 'se i tasti superano il modulo scelto'],
    ['Cavo mobile', 'stesso', 'stesso', 'nessuna: il bus non cresce con i piani'],
    ['Catena serrature di piano', '12 contatti in serie', '24 contatti in serie', '+ 12 contatti, 2 fili di dorsale invariati'],
    ['Sensori zona porta e finecorsa', 'stessi', 'stessi', 'nessuna; solo più magneti/lamelle di piano'],
    ['Lunghezza dorsale CAN2', '≈ 40–50 m', '≈ 80–100 m', 'ben sotto 500 m a 125 kbit/s'],
    ['Corrente 24 V dei nodi', '≈ 0,6 A', '≈ 1,2 A', 'verificare caduta di tensione e alimentatore'],
    ['Parametro «numero fermate»', '12', '24', 'si imposta in messa in servizio (ruolo L3)'],
    ['Prestazioni della manovra', 'collettiva', 'collettiva', 'valutare 2 impianti in gruppo oltre 12 piani di traffico'],
    ['Fossa/testata e velocità', 'dipendono dall\'altezza', 'dipendono dall\'altezza', 'fuori da questo studio: vedi EN 81-20/50'],
  ];
  const cw = [270, 150, 150, 360];
  rows.forEach((r, i) => {
    let x = TX + 14;
    const y = 90 + i * 40;
    r.forEach((c, j) => {
      s.text(x, y, c, { size: i === 0 ? 12 : 11, weight: i === 0 ? 700 : 400 });
      x += cw[j];
    });
    s.line(TX + 10, y + 12, TX + 950, y + 12, { c: COL.grid, w: 1 });
  });
  s.text(TX + 14, 600, 'Costo dell\'espansione ≈ 12 × (nodo di piano + 1 contatto serratura + tratto di cavo + posa).', { size: 12, weight: 700 });
  s.text(TX + 14, 622, 'Il prezzo del nodo non è verificato: vedi 03-costi (formula Totale = V + B + p × N).', { size: 11.5, c: COL.warn });
  s.text(TX + 14, 650, 'Oltre 24 fermate: secondo bus CAN o repeater; da progettare a parte.', { size: 11.5 });
  return s;
}
