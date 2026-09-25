// .d.ts фасада (4a.2) за main.js — виж choreo-gen.d.ts за обяснение на подхода.
import type { GeneratedChoreography } from './choreo-gen';

export interface BootOpts {
  /** Генерирана хореография (choreo-gen.js); без нея тръгва фиксираното демо на boy. */
  choreography?: GeneratedChoreography;
  reducedMotion?: boolean;
  /** false спира на последния кадър вместо да зацикля (реални битки не зацикляй). */
  loop?: boolean;
  onEnd?: () => void;
}

export interface BootHandle {
  dispose(): void;
}

export function bootDuel(canvas: HTMLCanvasElement, opts?: BootOpts): Promise<BootHandle>;
