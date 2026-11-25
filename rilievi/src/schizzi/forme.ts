import {
  COLORI,
  CORPI,
  FRECCE,
  QUOTA,
  SPESSORI,
  TRATTEGGI,
  type Colore,
  type Misura,
} from './costanti.js';
import { SIMBOLI, type NomeSimbolo } from './simboli.js';

/**
 * Елементът на листа като примитиви за рисуване — линия (път), запълнен път (върхът на стрелката), елипса и
 * надпис. Едно разгъване за картата и печата (views/schede/_schizzo.ejs) и PDF-а (pdf-schizzi.ts); в
 * браузъра същото е public/js/schizzo-forme.js — тест пуска онзи файл и сравнява изхода с този.
 * Числата са закръглени до 0,1, за да излизат еднакво навсякъде.
 */

export type Tratteggio = readonly [number, number] | null;
export type Primitivo =
  | { p: 'l'; d: string; w: number; c: string; k: Tratteggio }
  | { p: 'f'; d: string; c: string }
  | { p: 'e'; x: number; y: number; rx: number; ry: number; w: number; c: string; k: Tratteggio }
  | {
      p: 't';
      x: number;
      y: number;
      v: string;
      z: number;
      c: string;
      a: number;
      h: 'start' | 'middle' | 'end';
    };

interface Base {
  c: Colore;
  s: Misura;
  k?: 1 | undefined;
}
/** Видът на елементите, както ги пази листът (проверката — elementi.ts). */
export type ElementoDisegno =
  | (Base & { t: 'p'; d: string })
  | (Base & { t: 'x'; x: number; y: number; v: string })
  | (Base & { t: 'e'; x: number; y: number; rx: number; ry: number })
  | (Base & { t: 'a'; x1: number; y1: number; x2: number; y2: number; v?: string | undefined })
  | (Base & {
      t: 'q';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      o: number;
      v: string;
      m?: 'r' | undefined;
    })
  | (Base & {
      t: 's';
      n: NomeSimbolo;
      x: number;
      y: number;
      w: number;
      h: number;
      r: number;
      f?: 1 | undefined;
    });

const r1 = (v: number): number => Math.round(v * 10) / 10;
type Punto = readonly [number, number];
const linea = (punti: readonly Punto[], chiusa = false): string =>
  `M${punti.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L')}${chiusa ? 'Z' : ''}`;

/** Точките на път от листа („M x y“ и относителни „l“) — абсолютни. */
export function puntiDi(d: string): Punto[] {
  const inizio = /^M(-?\d+) (-?\d+)/.exec(d);
  if (!inizio) return [];
  let x = Number(inizio[1]);
  let y = Number(inizio[2]);
  const punti: Punto[] = [[x, y]];
  for (const m of d.slice(inizio[0].length).matchAll(/l(-?\d+) (-?\d+)/g)) {
    x += Number(m[1]);
    y += Number(m[2]);
    punti.push([x, y]);
  }
  return punti;
}

/** Върхът на стрелка в (x, y), насочена по единичния вектор (ux, uy). */
function punta(x: number, y: number, ux: number, uy: number, s: Misura, c: string): Primitivo {
  const [lungo, mezzo] = FRECCE[s];
  const bx = x - ux * lungo;
  const by = y - uy * lungo;
  return {
    p: 'f',
    d: linea(
      [
        [x, y],
        [bx - uy * mezzo, by + ux * mezzo],
        [bx + uy * mezzo, by - ux * mezzo],
      ],
      true,
    ),
    c,
  };
}

/** Ъгълът на надпис по посоката (ux, uy) — в [-90, 90): никога с главата надолу, вертикалният чете отдолу нагоре. */
function angoloLettura(ux: number, uy: number): number {
  let a = (Math.atan2(uy, ux) * 180) / Math.PI;
  if (a >= 90 - 1e-9) a -= 180;
  else if (a < -90 - 1e-9) a += 180;
  return a;
}

function quota(el: Extract<ElementoDisegno, { t: 'q' }>): Primitivo[] {
  const c = COLORI[el.c];
  // Котовите и помощните линии са винаги тънки (UNI EN ISO 129-1); дебелината мени само числото и стрелките.
  const w = SPESSORI[1];
  const [lungoFreccia] = FRECCE[el.s];
  const lungo = Math.hypot(el.x2 - el.x1, el.y2 - el.y1);
  const ux = (el.x2 - el.x1) / lungo;
  const uy = (el.y2 - el.y1) / lungo;
  const nx = -uy;
  const ny = ux;
  const raggio = el.m === 'r';
  const o = raggio ? 0 : el.o;
  const a: Punto = [el.x1 + nx * o, el.y1 + ny * o];
  const b: Punto = [el.x2 + nx * o, el.y2 + ny * o];
  const out: Primitivo[] = [];
  if (Math.abs(o) > QUOTA.stacco) {
    const sg = Math.sign(o);
    for (const [px, py, qx, qy] of [
      [el.x1, el.y1, a[0], a[1]],
      [el.x2, el.y2, b[0], b[1]],
    ] as const) {
      out.push({
        p: 'l',
        d: linea([
          [px + nx * sg * QUOTA.stacco, py + ny * sg * QUOTA.stacco],
          [qx + nx * sg * QUOTA.oltre, qy + ny * sg * QUOTA.oltre],
        ]),
        w,
        c,
        k: null,
      });
    }
  }
  if (lungo < (raggio ? 1 : 2) * lungoFreccia + 16) {
    // Късата кота: стрелките — отвън, сочат към точките; линията минава след двата края.
    const oltre = lungoFreccia + 10;
    const da: Punto = raggio ? a : [a[0] - ux * oltre, a[1] - uy * oltre];
    out.push({ p: 'l', d: linea([da, [b[0] + ux * oltre, b[1] + uy * oltre]]), w, c, k: null });
    if (!raggio) out.push(punta(a[0], a[1], ux, uy, el.s, c));
    out.push(punta(b[0], b[1], -ux, -uy, el.s, c));
  } else {
    // Котовата линия спира под върховете на стрелките — кръглият ѝ край не излиза пред тях.
    const accorcia = lungoFreccia / 2;
    const da: Punto = raggio ? a : [a[0] + ux * accorcia, a[1] + uy * accorcia];
    const fino: Punto = [b[0] - ux * accorcia, b[1] - uy * accorcia];
    out.push({ p: 'l', d: linea([da, fino]), w, c, k: null });
    if (!raggio) out.push(punta(a[0], a[1], -ux, -uy, el.s, c));
    out.push(punta(b[0], b[1], ux, uy, el.s, c));
  }
  const angolo = angoloLettura(ux, uy);
  const rad = (angolo * Math.PI) / 180;
  const mx = (a[0] + b[0]) / 2 + Math.sin(rad) * QUOTA.testo;
  const my = (a[1] + b[1]) / 2 - Math.cos(rad) * QUOTA.testo;
  out.push({
    p: 't',
    x: r1(mx),
    y: r1(my),
    v: el.v,
    z: CORPI[el.s],
    c,
    a: r1(angolo),
    h: 'middle',
  });
  return out;
}

function freccia(el: Extract<ElementoDisegno, { t: 'a' }>): Primitivo[] {
  const c = COLORI[el.c];
  const lungo = Math.hypot(el.x1 - el.x2, el.y1 - el.y2);
  const ux = (el.x1 - el.x2) / lungo;
  const uy = (el.y1 - el.y2) / lungo;
  const accorcia = FRECCE[el.s][0] / 2;
  const out: Primitivo[] = [];
  // Съвсем късата стрелка е само върхът ѝ — линията би излязла зад опашката.
  if (lungo > accorcia) {
    out.push({
      p: 'l',
      // От върха към опашката — пунктирът почва при стрелката, не я оставя да виси.
      d: linea([
        [el.x1 - ux * accorcia, el.y1 - uy * accorcia],
        [el.x2, el.y2],
      ]),
      // Линията на надписа със стрелка е тънка като котовата; стрелката без надпис — с дебелината си.
      w: SPESSORI[el.v ? 1 : el.s],
      c,
      k: el.k ? TRATTEGGI[el.s] : null,
    });
  }
  out.push(punta(el.x1, el.y1, ux, uy, el.s, c));
  if (el.v) {
    const z = CORPI[el.s];
    const destra = el.x2 >= el.x1;
    out.push({
      p: 't',
      x: el.x2 + (destra ? 10 : -10),
      y: r1(el.y2 + z * 0.35),
      v: el.v,
      z,
      c,
      a: 0,
      h: destra ? 'start' : 'end',
    });
  }
  return out;
}

function simbolo(el: Extract<ElementoDisegno, { t: 's' }>): Primitivo[] {
  const c = COLORI[el.c];
  const w = SPESSORI[el.s];
  const k = el.k ? TRATTEGGI[el.s] : null;
  const giro = (lx: number, ly: number): Punto =>
    el.r === 1 ? [-ly, lx] : el.r === 2 ? [-lx, -ly] : el.r === 3 ? [ly, -lx] : [lx, ly];
  // Огледалният (`f`) се обръща около вертикалната ос на кутията, преди да се завърти.
  const punto = (u: number, v: number): Punto => {
    const [lx, ly] = giro((el.f ? 0.5 - u / 100 : u / 100 - 0.5) * el.w, (v / 100 - 0.5) * el.h);
    return [el.x + lx, el.y + ly];
  };
  return SIMBOLI[el.n].parti.map((parte): Primitivo => {
    if ('d' in parte) {
      const punti = puntiDi(parte.d).map(([u, v]) => punto(u, v));
      return { p: 'l', d: linea(punti, parte.d.endsWith('z')), w, c, k };
    }
    const [cx, cy, rx, ry] = parte.e;
    const [x, y] = punto(cx, cy);
    const ex = (rx / 100) * el.w;
    const ey = (ry / 100) * el.h;
    const dritto = el.r % 2 === 0;
    return {
      p: 'e',
      x: r1(x),
      y: r1(y),
      rx: r1(dritto ? ex : ey),
      ry: r1(dritto ? ey : ex),
      w,
      c,
      // Малките кръгове (бутоните, прътът) — винаги плътни: пунктир по тях е петно.
      k: 'solido' in parte ? null : k,
    };
  });
}

/** Примитивите на един елемент в реда, в който се рисуват. */
export function primitiviDi(el: ElementoDisegno): Primitivo[] {
  const c = COLORI[el.c];
  switch (el.t) {
    case 'p':
      return [{ p: 'l', d: el.d, w: SPESSORI[el.s], c, k: el.k ? TRATTEGGI[el.s] : null }];
    case 'x':
      return [{ p: 't', x: el.x, y: el.y, v: el.v, z: CORPI[el.s], c, a: 0, h: 'start' }];
    case 'e':
      return [
        {
          p: 'e',
          x: el.x,
          y: el.y,
          rx: el.rx,
          ry: el.ry,
          w: SPESSORI[el.s],
          c,
          k: el.k ? TRATTEGGI[el.s] : null,
        },
      ];
    case 'a':
      return freccia(el);
    case 'q':
      return quota(el);
    case 's':
      return simbolo(el);
  }
}

/** Примитивите на целия лист — за шаблона на листа и PDF-а. */
export function primitiviFoglio(foglio: { e: readonly ElementoDisegno[] }): Primitivo[] {
  return foglio.e.flatMap(primitiviDi);
}
