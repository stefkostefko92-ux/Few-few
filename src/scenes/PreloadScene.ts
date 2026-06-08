import Phaser from 'phaser';
import { SCENES, COLORS, HEX, FONT, GAME_WIDTH, GAME_HEIGHT } from '../theme.ts';
import { generateTextures } from '../assets/textures.ts';

/**
 * PreloadScene: показва прогрес-лента и подготвя текстурите. Реалните активи
 * (Фаза 5) ще се зареждат тук през this.load.* — структурата вече го поддържа.
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SCENES.Preload);
  }

  preload(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    this.add
      .text(cx, cy - 80, 'Опълченците · 1877', {
        fontFamily: FONT.display,
        fontSize: '44px',
        color: HEX.gold,
      })
      .setOrigin(0.5);

    const barW = 420;
    const barH = 28;
    const border = this.add.graphics();
    border.lineStyle(3, COLORS.gold, 1);
    border.strokeRect(cx - barW / 2, cy - barH / 2, barW, barH);

    const fill = this.add.graphics();
    this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => {
      fill.clear();
      fill.fillStyle(COLORS.gold, 1);
      fill.fillRect(cx - barW / 2 + 3, cy - barH / 2 + 3, (barW - 6) * p, barH - 6);
    });

    // Тук в бъдеще: this.load.image(...), this.load.audio(...) от Фаза 5.
  }

  create(): void {
    generateTextures(this);
    this.scene.start(SCENES.Menu);
  }
}
