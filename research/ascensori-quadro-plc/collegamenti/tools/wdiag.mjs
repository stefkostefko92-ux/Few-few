// Motore dichiarativo per schemi di collegamento: dispositivi con piedini + connessioni instradate in canali.
// Uso:
//   const d = new Diagram(sheet);
//   d.device('-QS1', { x, y, w, title, sub, L:[…], R:[…] })     // L/R: piedini ('L1' oppure { n:'1', l:'L1' })
//   d.strip('-X1', { x, y, w, rows:[{t,sig}] })                   // morsettiera: morsetti con pin 'X1.1' …
//   d.conn('-QS1.2', '-QF1.1', { w:'105', c:'PW', cab:'W101' })   // connessione con numero di filo e colore
//   d.area('titolo', { x, y, w, h })                              // riquadro funzionale
//   d.draw()
import { INK, MUTE, term } from './wlib.mjs';

const COLAB = { PW: 'NE', AC: 'RS', DC: 'BL', IL: 'AR', N: 'AZ', PE: 'GV', SH: 'SC', NU: 'NUM' };

export class Diagram {
  constructor(s) {
    this.s = s;
    this.devs = {};
    this.pins = {}; // 'dev.pin' → { x, y, side }
    this.conns = [];
    this.areas = [];
    this.gap = {};
  }

  // Apparecchio generico
  device(id, { x, y, w = 110, title = id, sub = '', L = [], R = [], rowH = 15, head = 30, dash = '', fill = '#fff', bold = true, minH = 0 }) {
    const s = this.s;
    const n = Math.max(L.length, R.length, 1);
    const h = Math.max(minH, head + n * rowH + 6);
    s.bx(x, y, w, h, { dash, fill });
    s.tx(x + w / 2, y + 12, title, { size: 9.5, anchor: 'middle', weight: bold ? 700 : 400 });
    if (sub) s.tx(x + w / 2, y + 23, sub, { size: 7, anchor: 'middle', c: MUTE });
    const put = (arr, side) =>
      arr.forEach((p, i) => {
        const key = typeof p === 'string' ? p : p.n;
        const lab = typeof p === 'string' ? p : (p.l ?? p.n);
        const py = y + head + i * rowH + rowH / 2;
        const px = side === 'L' ? x : x + w;
        s.ln(px, py, px + (side === 'L' ? -9 : 9), py, { w: 0.9 });
        s.tx(side === 'L' ? x + 4 : x + w - 4, py + 3, lab, { size: 7.5, anchor: side === 'L' ? 'start' : 'end' });
        this.pins[`${id}.${key}`] = { x: px + (side === 'L' ? -9 : 9), y: py, side };
      });
    put(L, 'L');
    put(R, 'R');
    this.devs[id] = { x, y, w, h };
    return { x, y, w, h };
  }

  // Morsettiera: ogni riga ha un morsetto numerato; pin sinistro e destro con lo stesso nome
  strip(id, { x, y, w = 150, rows, cell = 15, split = 38, titleSub = '' }) {
    const s = this.s;
    const h = rows.length * cell;
    s.tx(x + w / 2, y - 14, id, { size: 10, anchor: 'middle', weight: 700 });
    if (titleSub) s.tx(x + w / 2, y - 4, titleSub, { size: 7, anchor: 'middle', c: MUTE });
    rows.forEach((r, i) => {
      const yy = y + i * cell;
      s.bx(x, yy, w, cell, { w: 0.8 });
      s.ln(x + split, yy, x + split, yy + cell, { w: 0.6 });
      s.tx(x + split / 2, yy + cell / 2 + 3, String(r.t), { size: 8, anchor: 'middle', weight: 700 });
      s.tx(x + split + 4, yy + cell / 2 + 3, r.sig ?? '', { size: 7.5 });
      const py = yy + cell / 2;
      s.ln(x, py, x - 9, py, { w: 0.9 });
      s.ln(x + w, py, x + w + 9, py, { w: 0.9 });
      this.pins[`${id}.${r.t}`] = { x: x - 9, y: py, side: 'L' };
      this.pins[`${id}.${r.t}:r`] = { x: x + w + 9, y: py, side: 'R' };
    });
    this.devs[id] = { x, y, w, h };
    return { x, y, w, h };
  }


  // Apparecchio di campo ALLINEATO ai morsetti: una riga per piedino, passo = cell, piedini a sinistra (o destra).
  // I fili verso la morsettiera restano orizzontali. Titolo e descrizione a destra (o a sinistra) del riquadro.
  field(id, { x, y, w = 70, cell = 24, pins, title = id, sub = '', side = 'L', note = '', pad = 3 }) {
    const s = this.s;
    const h = pins.length * cell;
    s.bx(x, y + pad, w, h - 2 * pad, { w: 1.1 });
    pins.forEach((p, i) => {
      const key = typeof p === 'string' ? p : p.n;
      const lab = typeof p === 'string' ? p : (p.l ?? p.n);
      const py = y + i * cell + cell / 2;
      const px = side === 'L' ? x : x + w;
      s.ln(px, py, px + (side === 'L' ? -9 : 9), py, { w: 0.9 });
      s.tx(side === 'L' ? x + 5 : x + w - 5, py + 3, lab, { size: 7.5, anchor: side === 'L' ? 'start' : 'end' });
      this.pins[`${id}.${key}`] = { x: px + (side === 'L' ? -9 : 9), y: py, side };
    });
    const tx = side === 'L' ? x + w + 8 : x - 8;
    const an = side === 'L' ? 'start' : 'end';
    s.tx(tx, y + 11, title, { size: 9.5, anchor: an, weight: 700 });
    if (sub) s.tx(tx, y + 22, sub, { size: 7.5, anchor: an, c: MUTE });
    if (note) s.tx(tx, y + 32, note, { size: 7, anchor: an, c: MUTE, italic: true });
    this.devs[id] = { x, y, w, h };
    return { x, y, w, h };
  }

  // Riferimento di continuazione: tratto breve che esce dal piedino con numero di filo e destinazione.
  stub(pin, text, { w = '', c = '', len = 46, cab = '' } = {}) {
    const s = this.s;
    const P = this._pin(pin);
    const dir = P.side === 'R' ? 1 : -1;
    const x2 = P.x + dir * len;
    s.ln(P.x, P.y, x2, P.y, { w: 1 });
    s.poly([[x2, P.y - 3], [x2 + dir * 5, P.y], [x2, P.y + 3]], { c: '#111111', w: 1, fill: '#111111' });
    const lab = w ? `${w}${c ? ' ' + COLAB[c] : ''}` : '';
    if (lab) s.tx(P.x + (dir * len) / 2, P.y - 2.5, lab, { size: 7, anchor: 'middle' });
    if (cab) s.tx(P.x + (dir * len) / 2, P.y + 8, cab, { size: 6, anchor: 'middle', c: MUTE, italic: true });
    s.tx(x2 + dir * 9, P.y + 3, text, { size: 7.5, anchor: dir === 1 ? 'start' : 'end' });
  }

  area(title, { x, y, w, h }) {
    this.areas.push({ title, x, y, w, h });
  }

  // lato = 'R' per partire dal lato destro del morsetto (pin ':r')
  conn(a, b, o = {}) {
    this.conns.push({ a, b, ...o });
  }

  _pin(key) {
    const p = this.pins[key];
    if (!p) throw new Error(`pin sconosciuto: ${key}`);
    return p;
  }

  draw() {
    const s = this.s;
    for (const a of this.areas) {
      s.bx(a.x, a.y, a.w, a.h, { dash: '8 3 2 3', w: 0.9 });
      s.tx(a.x + 6, a.y + 11, a.title, { size: 8.5, weight: 700 });
    }
    // 1) classifica le connessioni e raggruppa per canale
    const items = this.conns.map((c) => {
      const A = this._pin(c.a);
      const B = this._pin(c.b);
      let type;
      let key;
      if (c.lane != null) { type = 'lane'; key = 'lane'; }
      else if (A.side === 'R' && B.side === 'L' && A.x < B.x) { type = 'fwd'; key = `f${Math.round(A.x / 10)}-${Math.round(B.x / 10)}`; }
      else if (A.side === 'L' && B.side === 'R' && B.x < A.x) { type = 'bwd'; key = `b${Math.round(B.x / 10)}-${Math.round(A.x / 10)}`; }
      else if (A.side === B.side) { type = 'same'; key = `s${A.side}${Math.round((A.side === 'R' ? Math.max(A.x, B.x) : Math.min(A.x, B.x)) / 10)}`; }
      else { type = 'mid'; key = 'mid'; }
      return { c, A, B, type, key, y1: Math.min(A.y, B.y) - 3, y2: Math.max(A.y, B.y) + 3 };
    });
    // 2) assegna corsie con riuso quando gli intervalli verticali non si sovrappongono
    const groups = {};
    for (const it of items) (groups[it.key] ??= []).push(it);
    for (const g of Object.values(groups)) {
      g.sort((p, q) => p.y1 - q.y1);
      const lanes = [];
      for (const it of g) {
        let k = lanes.findIndex((last) => last < it.y1);
        if (k < 0) { k = lanes.length; lanes.push(it.y2); } else lanes[k] = it.y2;
        it.lane = k;
      }
    }
    const laneCount = {};
    for (const it of items) laneCount[it.key] = Math.max(laneCount[it.key] ?? 0, it.lane + 1);
    // 3) disegno
    const laneY = {};
    for (const { c, A, B, type, key, lane } of items) {
      const lab = c.w ? `${c.w}${c.c ? ' ' + COLAB[c.c] : ''}` : '';
      const dash = c.dash ?? '';
      const wd = c.bold ? 1.6 : 1;
      let pts;
      const step = (span, n) => Math.max(4, Math.min(8, (span - 50) / Math.max(n, 1)));
      if (type === 'lane') {
        const dirA = A.side === 'R' ? 1 : -1;
        const dirB = B.side === 'R' ? 1 : -1;
        const k = (laneY[c.lane] = (laneY[c.lane] ?? 0) + 1);
        const ya = c.lane + k * 4;
        pts = [[A.x, A.y], [A.x + dirA * (14 + k * 4), A.y], [A.x + dirA * (14 + k * 4), ya], [B.x + dirB * (14 + k * 4), ya], [B.x + dirB * (14 + k * 4), B.y], [B.x, B.y]];
      } else if (type === 'fwd') {
        const span = B.x - A.x;
        const cx = Math.min(B.x - 14, A.x + 30 + lane * step(span, laneCount[key]));
        pts = [[A.x, A.y], [cx, A.y], [cx, B.y], [B.x, B.y]];
      } else if (type === 'bwd') {
        const span = A.x - B.x;
        const cx = Math.max(B.x + 14, A.x - 30 - lane * step(span, laneCount[key]));
        pts = [[A.x, A.y], [cx, A.y], [cx, B.y], [B.x, B.y]];
      } else if (type === 'same') {
        const cx = A.side === 'R' ? Math.max(A.x, B.x) + 14 + lane * 6 : Math.min(A.x, B.x) - 14 - lane * 6;
        pts = [[A.x, A.y], [cx, A.y], [cx, B.y], [B.x, B.y]];
      } else {
        pts = [[A.x, A.y], [(A.x + B.x) / 2, A.y], [(A.x + B.x) / 2, B.y], [B.x, B.y]];
      }
      s.pl(pts, { w: wd, dash });
      if (lab) {
        const [x1, y1] = pts[0];
        const [x2] = pts[1];
        const ax = x1 + (x2 - x1) / 2;
        s.tx(ax, y1 - 2.5, lab, { size: 7, anchor: 'middle' });
        if (c.cab) s.tx(ax, y1 + 8, c.cab, { size: 6, anchor: 'middle', c: MUTE, italic: true });
      }
    }
    const use = {};
    for (const c of this.conns) {
      use[c.a] = (use[c.a] ?? 0) + 1;
      use[c.b] = (use[c.b] ?? 0) + 1;
    }
    for (const [k, n] of Object.entries(use)) if (n > 1) s.junction(this.pins[k].x, this.pins[k].y);
  }
}
