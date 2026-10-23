// A run of the simulation as time series: one sample every KS.step seconds, one typed array per quantity, and the
// events on the way (doors, start, brake, slip, buffers). frameAt() interpolates between two samples for the 3D and
// the cursor on the charts. Pure.

export const CHANNELS = [
  /** car floor above the lowest floor [m], speed and acceleration (upwards positive) */
  's', 'v', 'a',
  /** counterweight buffer plate, height above the lowest floor [m] */
  'cw',
  /** sheave angle [rad]; rope travel over the sheave [m] (they differ when the ropes slip) */
  'theta', 'rope',
  /** pulls at the sheave, car and counterweight side [N]; T1/T2; e^(f·α) of the condition shown */
  'Tc', 'Tw', 'ratio', 'efa',
  /** torque on the motor shaft [N·m]: the motor, or the brake when it acts */
  'torque',
  /** compression of the car and counterweight buffers [m] */
  'bufCar', 'bufCw',
  /** opening of the car door (and of the landing door where the car stands), 0…1 */
  'door',
  /** load in the car [kg] */
  'load',
  /** 1 while the ropes slip on the sheave, 1 while the brake holds */
  'slip', 'brake',
] as const;

export type Channel = (typeof CHANNELS)[number];
export type Frame = Record<Channel, number> & { t: number };

export type EventId =
  | 'doorsClose' | 'start' | 'cruise' | 'decel' | 'stop' | 'doorsOpen'
  | 'brakeOn' | 'slip' | 'carStop' | 'sheaveStop'
  | 'loadFull' | 'cwBuffer' | 'carBuffer' | 'maxCompression' | 'solid' | 'lifted' | 'jump';

export interface SimEvent {
  t: number;
  id: EventId;
}

export interface Series {
  dt: number;
  /** number of samples; the last one is at (n − 1)·dt */
  n: number;
  data: Readonly<Record<Channel, Float64Array>>;
  events: readonly SimEvent[];
}

export interface Recorder {
  push(f: Omit<Frame, 't'>): void;
  event(id: EventId): void;
  /** time of the next sample [s] */
  readonly t: number;
  done(): Series;
}

export function recorder(dt: number): Recorder {
  const cols: Record<Channel, number[]> = Object.fromEntries(CHANNELS.map((c) => [c, [] as number[]])) as unknown as Record<Channel, number[]>;
  const events: SimEvent[] = [];
  let n = 0;
  return {
    push(f) {
      for (const c of CHANNELS) cols[c].push(f[c]);
      n += 1;
    },
    event(id) {
      events.push({ t: Math.max(0, (n - 1) * dt), id });
    },
    get t() {
      return n * dt;
    },
    done() {
      const data = Object.fromEntries(CHANNELS.map((c) => [c, Float64Array.from(cols[c])])) as Record<Channel, Float64Array>;
      return { dt, n, data, events };
    },
  };
}

export const duration = (s: Series): number => Math.max(0, (s.n - 1) * s.dt);

/** The state at time t: linear between the two nearest samples; slip and brake from the earlier one. */
export function frameAt(s: Series, t: number): Frame {
  const T = duration(s), u = Math.min(Math.max(t, 0), T) / s.dt;
  const i = Math.min(Math.floor(u), Math.max(0, s.n - 2)), k = Math.min(1, u - i), j = Math.min(i + 1, s.n - 1);
  const f = { t: Math.min(Math.max(t, 0), T) } as Frame;
  for (const c of CHANNELS) {
    const a = s.data[c][i] ?? 0, b = s.data[c][j] ?? a;
    f[c] = c === 'slip' || c === 'brake' ? a : a + (b - a) * k;
  }
  return f;
}

/** Largest value of a channel over the run (optionally from a time on). */
export function peak(s: Series, c: Channel, from = 0): number {
  let m = -Infinity;
  const d = s.data[c];
  for (let i = Math.max(0, Math.floor(from / s.dt)); i < s.n; i++) if (d[i] > m) m = d[i];
  return m;
}
