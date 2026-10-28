// The search of the remedies of one check (round 54): each lever tried on the whole design, as the screen would set it.
// A number goes the way that helps, first by the smallest step, then by the slope of the check's margin (a secant toward
// the limit, doubling where there is no number), then back by halves to the least change that passes; an entry of a
// list and a distance given back are tried as they are. A remedy is a value with which the check is no longer counted
// against the design and no other check stops passing; what else it puts right, or leaves with «Attenzione», is said
// with it. Bounded (the design is worked out tens of times, each tens of milliseconds): `pausa` lets the screen breathe
// between two, `signal` stops it. Pure but for those.
import { COSTI, type Esito, type Leva, type LevaNum, type Rimedio, type Valuta } from './tipi';

export interface Opzioni {
  /** awaited between two workings-out (the screen's event loop); absent: none */
  pausa?: () => Promise<void>;
  signal?: AbortSignal;
  /** the most remedies returned (default 3) and the most workings-out in all (default 140) */
  quanti?: number;
  budget?: number;
  /** a pause every this many workings-out (default 1: a cheap design pauses less often) */
  ogni?: number;
}

interface Punto<I> { x: number; I: I; e: Esito; m: number | null; ok: boolean }

/** The grid point of step `passo` beyond `x` the way `d` (x itself when on the grid and `stretto` is false). */
const griglia = (x: number, passo: number, d: 1 | -1, stretto = true): number => {
  const q = x / passo, n = d > 0 ? Math.ceil(q) : Math.floor(q), y = n * passo;
  return stretto && Math.abs(y - x) < 1e-9 ? y + d * passo : y;
};

export class Interrotta extends Error {}

/** The remedies of check `target` among `leve`, from the inputs `I0` that give `e0`; best first. */
export async function cercaRimedi<I>(I0: I, e0: Esito, target: string, leve: readonly Leva<I>[], valuta: Valuta<I>, o: Opzioni = {}): Promise<Rimedio<I>[]> {
  let left = o.budget ?? 140, n = 0;
  const passa = (e: Esito): boolean => !e.problemi.has(target);
  const ev = async (I: I | null): Promise<Esito | null> => {
    if (o.signal?.aborted) throw new Interrotta();
    if (!I || left <= 0) return null;
    left--;
    const e = valuta(I);
    if (++n % (o.ogni ?? 1) === 0) await o.pausa?.();
    return e;
  };
  const found: Rimedio<I>[] = [];
  const keep = (L: Leva<I>, I: I, e: Esito, a: number | string | null, label?: string, labelDa?: string): void => {
    const nuovi = [...e.problemi].filter(([id, s]) => id !== target && (!e0.problemi.has(id) || (s === 'fail' && e0.problemi.get(id) === 'warn'))).map(([id, stato]) => ({ id, stato }));
    // a value that makes another check fail is no remedy (a parapet lowered under its height, a buffer's stroke under its
    // least, a door under its width): one passing with «Attenzione» is said with it
    if (nuovi.some((x) => x.stato === 'fail')) return;
    const risolti = [...e0.problemi.keys()].filter((id) => id !== target && !e.problemi.has(id));
    found.push({ key: L.key, tipo: L.tipo, costo: L.costo, da: L.da, a, ...(label ? { label } : {}), ...(labelDa ? { labelDa } : {}), inputs: I, risolti, nuovi });
  };
  for (const L of leve) {
    if (left <= 0) break;
    if (L.tipo === 'togli') {
      const I = L.set(I0), e = await ev(I);
      if (I && e && passa(e)) keep(L, I, e, null);
    } else if (L.tipo === 'scelta') {
      for (const op of L.opzioni) {
        if (op.id === L.da) continue;
        const I = L.set(I0, op.id), e = await ev(I);
        if (I && e && passa(e)) keep(L, I, e, op.id, op.label, L.opzioni.find((x) => x.id === L.da)?.label);
      }
    } else {
      for (const d of L.dir ? [L.dir] : ([1, -1] as const)) {
        const p = await numerica(L, d, I0, e0, target, ev, passa);
        if (p) keep(L, p.I, p.e, p.x);
      }
    }
  }
  return ordina(found, o.quanti ?? 3);
}

/** The least change of number `L` the way `d` with which the check passes; null: none within its range. */
async function numerica<I>(L: LevaNum<I>, d: 1 | -1, I0: I, e0: Esito, target: string, ev: (I: I | null) => Promise<Esito | null>,
  passa: (e: Esito) => boolean): Promise<Punto<I> | null> {
  const lim = d > 0 ? L.max : L.min, inside = (x: number): boolean => (d > 0 ? x <= lim : x >= lim);
  const at = async (x: number): Promise<Punto<I> | null> => {
    if (!inside(x)) return null;
    const I = L.set(I0, x), e = await ev(I);
    return I && e ? { x, I, e, m: e.margini.get(target) ?? null, ok: passa(e) } : null;
  };
  // the last point that does not pass (the start), the first that does
  const first = await at(griglia(L.da, L.passo, d));
  if (!first) return null;
  let lo: Punto<I> = { x: L.da, I: I0, e: e0, m: e0.margini.get(target) ?? null, ok: false }, cur: Punto<I> = first;
  // no number moved by the smallest step: a ten times larger one says whether this way helps at all
  if (!cur.ok && !(cur.m !== null && lo.m !== null && cur.m > lo.m)) {
    const far = await at(griglia(L.da + d * 10 * L.passo, L.passo, d, false));
    if (!far || !(far.ok || (far.m !== null && lo.m !== null && far.m > lo.m))) return null;
    cur = far;
  }
  for (let i = 0; i < 8 && !cur.ok; i++) {
    const run = Math.abs(cur.x - L.da);
    // toward the limit along the margin's slope (a little beyond it) while short of it, else twice as far from the start
    // (past the limit and still counted: «Attenzione» has its own threshold)
    let x = cur.m !== null && lo.m !== null && cur.m > lo.m && cur.m < 0 ? cur.x + ((0 - cur.m) * (cur.x - lo.x)) / (cur.m - lo.m) * 1.05 : L.da + d * 2 * run;
    if ((x - cur.x) * d < L.passo) x = cur.x + d * L.passo;
    x = griglia(x, L.passo, d, false);
    if (!inside(x)) x = lim;
    if (x === cur.x) return null;
    let next = await at(x);
    // refused there (beyond what the screen takes): halfway, twice at most
    for (let h = 0; !next && h < 2; h++) {
      x = griglia(cur.x + (x - cur.x) / 2, L.passo, d, false);
      if (x === cur.x) break;
      next = await at(x);
    }
    if (!next) return null;
    lo = cur;
    cur = next;
  }
  if (!cur.ok) return null;
  // back by halves to the least change that passes
  for (let i = 0; i < 6 && Math.abs(cur.x - lo.x) > L.passo; i++) {
    const mid = griglia((cur.x + lo.x) / 2, L.passo, d, false), p: Punto<I> | null = mid === cur.x || mid === lo.x ? null : await at(mid);
    if (!p) break;
    if (p.ok) cur = p;
    else lo = p;
  }
  return cur;
}

/** Best first, one per input: none left with «Attenzione», then fewer, the cheapest, the smallest change for its size. */
function ordina<I>(all: Rimedio<I>[], quanti: number): Rimedio<I>[] {
  const peso = (r: Rimedio<I>): number[] => {
    const rel = typeof r.a === 'number' && typeof r.da === 'number' ? Math.abs(r.a - r.da) / Math.max(Math.abs(r.da), 100) : 0;
    return [r.nuovi.length, COSTI.indexOf(r.costo), rel];
  };
  const sorted = [...all].sort((a, b) => {
    const pa = peso(a), pb = peso(b);
    for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) return (pa[i] ?? 0) - (pb[i] ?? 0);
    return 0;
  });
  const seen = new Set<string>();
  return sorted.filter((r) => !seen.has(r.key) && !!seen.add(r.key)).slice(0, quanti);
}
