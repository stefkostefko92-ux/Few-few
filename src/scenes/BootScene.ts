import Phaser from 'phaser';
import { SCENES } from '../theme.ts';
import { loadProgress } from '../state/progress.ts';

/**
 * BootScene: зарежда минимума и прогреса от нативното хранилище, после
 * предава на PreloadScene. Тук не се рисува нищо съществено.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENES.Boot);
  }

  async create(): Promise<void> {
    await loadProgress();
    this.scene.start(SCENES.Preload);
  }
}
