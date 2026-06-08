import Phaser from 'phaser';
import type { Chapter } from '../config/chapters.ts';

/** Опции, подавани на всяка механика от ChapterScene. */
export interface MechanicOptions {
  scene: Phaser.Scene;
  chapter: Chapter;
  /** Контейнер, в който механиката добавя обектите си (за лесно почистване). */
  layer: Phaser.GameObjects.Container;
  /** Игрова площ, в която механиката трябва да се побере. */
  area: Phaser.Geom.Rectangle;
  /** Извиква се точно веднъж, когато механиката приключи. */
  onResult: (success: boolean) => void;
  /** Обновява статус-реда в HUD-а (точки, време, подсказка). */
  setStatus: (text: string) => void;
}

/** Контролер на стартирала механика. */
export interface MechanicController {
  /** Извиква се от ChapterScene.update, ако присъства. */
  update?(time: number, delta: number): void;
  /** Освобождава ресурси. ChapterScene унищожава и слоя след това. */
  destroy(): void;
}

export type MechanicFactory = (opts: MechanicOptions) => MechanicController;
