// Rated load, car area and passengers (UNI EN 81-20:2020, 5.4.2: Tabelle 6 e 8; registry: cabina.superficie,
// cabina.passeggeri). Pure.
import { KV } from './norme';

const LOADS = KV.areaTable;
const last = LOADS[LOADS.length - 1];

/** Maximum available car area [m²] for a rated load [kg]; linear between the rows, +0,16 m² per 100 kg past 2500 kg. */
export function maxArea(Q: number): number {
  if (!(Q > 0)) return 0;
  if (Q <= LOADS[0][0]) return LOADS[0][1];
  if (Q >= last[0]) return last[1] + ((Q - last[0]) / 100) * KV.areaPer100kgOver2500;
  for (let i = 1; i < LOADS.length; i++) {
    const [q1, a1] = LOADS[i];
    if (Q <= q1) {
      const [q0, a0] = LOADS[i - 1];
      return a0 + ((Q - q0) / (q1 - q0)) * (a1 - a0);
    }
  }
  return last[1];
}

/** Smallest rated load of the table [kg] whose maximum area admits the car area [m²]; past 2500 kg in steps of 100 kg. */
export function loadForArea(area: number): number {
  for (const [q, a] of LOADS) if (area <= a + 1e-9) return q;
  return last[0] + Math.ceil((area - last[1]) / KV.areaPer100kgOver2500 - 1e-9) * 100;
}

/** Passengers: the smaller of Q/75 (rounded down) and the number the area admits (Tabella 8). */
export function passengers(Q: number, area: number): number {
  const byLoad = Math.floor(Q / KV.personMass + 1e-9);
  const rows = KV.personsTable;
  let byArea = 0;
  for (const [n, a] of rows) if (area + 1e-9 >= a) byArea = n;
  const top = rows[rows.length - 1];
  if (area > top[1]) byArea = top[0] + Math.floor((area - top[1]) / KV.areaPerPersonOver20 + 1e-9);
  return Math.max(0, Math.min(byLoad, byArea));
}
