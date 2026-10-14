// Deterministic random installations for the property and proposal tests (same generator as the prototype's tests).
import { PRESETS } from '../index';
import type { FormValues } from '../index';

export function makeRandom(seed0: number) {
  let seed = seed0;
  const rnd = (): number => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)] as T;
  const U = (a: number, b: number): number => a + (b - a) * rnd();
  return { rnd, pick, U };
}

export function randomInstallation(R: ReturnType<typeof makeRandom>): FormValues {
  const { rnd, pick, U } = R;
  const base = { ...pick([PRESETS.A, PRESETS.B, PRESETS.C]) };
  const layout = pick(['top', 'topDefl', 'bottom']), groove = pick(['U', 'UU', 'VH', 'VN']);
  return { ...base, context: pick(['repl', 'new']), layout, r: pick(['1', '2']), alphaMode: pick(['geo', 'manual']), alphaManual: U(120, 220), dropAlign: pick(['center', 'car']),
    Q: U(300, 2500), P: U(400, 3000), k: U(0.4, 0.55), v: U(0.5, 2.5), H: U(6, 60), L0: U(0.5, 4), dx: U(0.1, 0.9), h: U(0.4, 1.5), Hv: U(5, 70), Dp: U(300, 700), Jp: U(0, 3),
    nps: Math.floor(U(0, 3)), npr: Math.floor(U(0, 2)), etaShaft: U(0.6, 0.9), compare: rnd() < 0.5,
    n_D: U(400, 800), n_groove: groove, n_beta: U(75, 105), n_gamma: U(35, 45), n_i: U(20, 70), n_etaD: U(0.5, 0.9), n_nm: U(900, 1480), n_Pn: U(3, 30),
    n_n: Math.floor(U(3, 9)), n_d: pick([8, 9, 10, 11, 12, 13]), n_Fmin: U(30, 110), n_qf: U(0.22, 0.6), n_brakeNm: U(20, 300), n_shaftMax: U(1500, 8000), n_mass: U(200, 1500),
    keepRopes: rnd() < 0.5 };
}
