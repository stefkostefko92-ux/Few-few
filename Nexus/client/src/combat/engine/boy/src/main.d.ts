// .d.ts фасада (4a.2) за main.js — виж choreo-gen.d.ts за обяснение на подхода.
import type { GeneratedChoreography } from './choreo-gen';

export interface BootOpts {
  /** Генерирана хореография (choreo-gen.js); без нея тръгва фиксираното демо на boy. */
  choreography?: GeneratedChoreography;
  reducedMotion?: boolean;
  /** false спира на последния кадър вместо да зацикля (реални битки не зацикляй). */
  loop?: boolean;
  onEnd?: () => void;
  /** Извиква се ТОЧНО в кадъра на всеки контактен/roundmark EVENTS запис (choreo-gen.js). */
  onImpact?: (ev: { type: string; roundIndex?: number; by?: 'A' | 'B'; against?: 'A' | 'B' }) => void;
  /** Прекъсва РАНО (преди buildWorld/compileAsync), ако React StrictMode вече е cleanup-нал. */
  signal?: AbortSignal;
  /** 4a.4: клас-специфичен тон/оръжие на героя — виж loadout.js weaponKit(). */
  heroClass?: 'warrior' | 'ranger' | 'mage' | 'rogue' | null;
  /** 4a.4: тема на противника по регион (combat-stage data-region) — виж loadout.js. */
  region?: string;
  /** 4a.4 (кръг 2): свободния текст на foe.name — оръжие на противника (loadout.js weaponKit()). */
  foeName?: string;
}

export interface BootHandle {
  dispose(): void;
  togglePlay?(): void;
  setSpeed?(v: number): void;
  toggleSound?(): void;
  skip?(): void;
}

export function bootDuel(canvas: HTMLCanvasElement, opts?: BootOpts): Promise<BootHandle>;
