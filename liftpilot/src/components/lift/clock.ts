// The playback clock of a simulation run, shared by the 3D stage, the charts and the controls: the time runs from
// performance.now() while playing, so every reader gets the same instant without a ticking loop; state changes
// (run, play, pause, seek, speed, end) reach the subscribers.
import { duration, frameAt, type Frame, type SimRun } from '@/sim';

export interface SimClock {
  readonly run: SimRun | null;
  readonly playing: boolean;
  readonly speed: number;
  /** current time [s] */
  time(): number;
  /** the state of the run at the current time */
  frame(): Frame | null;
  setRun(run: SimRun | null, play: boolean): void;
  play(): void;
  pause(): void;
  seek(t: number): void;
  setSpeed(k: number): void;
  subscribe(fn: () => void): () => void;
}

export function createClock(): SimClock {
  let run: SimRun | null = null, playing = false, speed = 1, t0 = 0, start = 0;
  const subs = new Set<() => void>();
  const notify = (): void => { for (const fn of subs) fn(); };
  const end = (): number => (run ? duration(run.series) : 0);
  const time = (): number => {
    if (!playing) return t0;
    const t = t0 + ((performance.now() - start) / 1000) * speed;
    if (t >= end()) {
      playing = false;
      t0 = end();
      queueMicrotask(notify);
      return t0;
    }
    return t;
  };
  const clock: SimClock = {
    get run() { return run; },
    get playing() { return playing; },
    get speed() { return speed; },
    time,
    frame: () => (run ? frameAt(run.series, time()) : null),
    setRun(next, play) {
      run = next;
      t0 = 0;
      start = performance.now();
      playing = play && !!next;
      notify();
    },
    play() {
      if (!run) return;
      if (t0 >= end() - 1e-6) t0 = 0;
      start = performance.now();
      playing = true;
      notify();
    },
    pause() {
      t0 = time();
      playing = false;
      notify();
    },
    seek(t) {
      t0 = Math.min(Math.max(t, 0), end());
      start = performance.now();
      notify();
    },
    setSpeed(k) {
      t0 = time();
      start = performance.now();
      speed = k;
      notify();
    },
    subscribe(fn) {
      subs.add(fn);
      return () => { subs.delete(fn); };
    },
  };
  return clock;
}
