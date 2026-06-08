import Phaser from 'phaser';
import { SCENES, COLORS, HEX, FONT, GAME_WIDTH, GAME_HEIGHT } from '../theme.ts';
import { t } from '../i18n/index.ts';
import { Button } from '../ui/Button.ts';
import { drawBackground } from '../ui/scenery.ts';

export class CreditsScene extends Phaser.Scene {
  constructor() {
    super(SCENES.Credits);
  }

  create(): void {
    drawBackground(this);
    const cx = GAME_WIDTH / 2;

    this.add
      .text(cx, 90, t('credits.title'), {
        fontFamily: FONT.display,
        fontSize: '52px',
        color: HEX.gold,
      })
      .setOrigin(0.5);

    this.add.image(cx, 230, 'flag').setScale(1.2);

    const blocks: Array<[string, string]> = [
      [t('credits.role.dev'), t('credits.role.studio')],
      [t('credits.role.history'), t('credits.history.text')],
      [t('credits.role.tech'), t('credits.tech.text')],
    ];

    let y = 360;
    for (const [role, value] of blocks) {
      this.add
        .text(cx, y, role, {
          fontFamily: FONT.body,
          fontSize: '24px',
          color: HEX.textMuted,
        })
        .setOrigin(0.5, 0);
      const valText = this.add
        .text(cx, y + 32, value, {
          fontFamily: FONT.display,
          fontSize: '28px',
          color: HEX.text,
          align: 'center',
          lineSpacing: 6,
          wordWrap: { width: GAME_WIDTH - 120 },
        })
        .setOrigin(0.5, 0);
      y += 60 + valText.height + 30;
    }

    this.add
      .text(cx, y + 10, t('credits.dedication'), {
        fontFamily: FONT.body,
        fontSize: '26px',
        color: HEX.parchment,
        fontStyle: 'italic',
        align: 'center',
        wordWrap: { width: GAME_WIDTH - 120 },
      })
      .setOrigin(0.5, 0);

    new Button(
      this,
      cx,
      GAME_HEIGHT - 90,
      t('common.back'),
      () => this.scene.start(SCENES.Menu),
      { width: 300, height: 76, fontSize: 28, fill: COLORS.bgPanel },
    );
  }
}
