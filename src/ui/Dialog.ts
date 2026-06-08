import Phaser from 'phaser';
import { COLORS, HEX, FONT, GAME_WIDTH, GAME_HEIGHT } from '../theme.ts';
import { Button } from './Button.ts';
import { t } from '../i18n/index.ts';

export interface DialogButton {
  textKey: string;
  onClick: () => void;
  fill?: number;
}

/**
 * Модален диалог: затъмнен фон, панел с заглавие/текст и един или повече
 * бутона. Използва се за потвърждения и за екраните „Знаеше ли?“.
 */
export class Dialog extends Phaser.GameObjects.Container {
  constructor(
    scene: Phaser.Scene,
    opts: {
      title?: string;
      body: string;
      buttons: DialogButton[];
    },
  ) {
    super(scene, 0, 0);
    this.setDepth(1000);

    const overlay = scene.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, COLORS.bgDark, 0.82)
      .setOrigin(0)
      .setInteractive();
    this.add(overlay);

    const panelW = GAME_WIDTH - 120;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    const titleText = opts.title
      ? scene.add
          .text(cx, 0, opts.title, {
            fontFamily: FONT.display,
            fontSize: '40px',
            color: HEX.gold,
            align: 'center',
            wordWrap: { width: panelW - 80 },
          })
          .setOrigin(0.5, 0)
      : null;

    const bodyText = scene.add
      .text(cx, 0, opts.body, {
        fontFamily: FONT.body,
        fontSize: '30px',
        color: HEX.text,
        align: 'center',
        lineSpacing: 8,
        wordWrap: { width: panelW - 80 },
      })
      .setOrigin(0.5, 0);

    const btnH = 96;
    const btnGap = 24;
    const titleH = titleText ? titleText.height + 30 : 0;
    const buttonsH = opts.buttons.length * (btnH + btnGap);
    const contentH = titleH + bodyText.height + 40 + buttonsH;
    const panelH = contentH + 80;
    const panelTop = cy - panelH / 2;

    const panel = scene.add.graphics();
    panel.fillStyle(COLORS.bgPanel, 1);
    panel.lineStyle(4, COLORS.gold, 1);
    panel.fillRoundedRect(cx - panelW / 2, panelTop, panelW, panelH, 20);
    panel.strokeRoundedRect(cx - panelW / 2, panelTop, panelW, panelH, 20);
    this.add(panel);

    let yCursor = panelTop + 40;
    if (titleText) {
      titleText.setY(yCursor);
      this.add(titleText);
      yCursor += titleH;
    }
    bodyText.setY(yCursor);
    this.add(bodyText);
    yCursor += bodyText.height + 40;

    for (const b of opts.buttons) {
      const btn = new Button(
        scene,
        cx,
        yCursor + btnH / 2,
        t(b.textKey),
        () => {
          this.close();
          b.onClick();
        },
        { width: panelW - 80, height: btnH, fill: b.fill ?? COLORS.bgPanelLight },
      );
      this.add(btn);
      yCursor += btnH + btnGap;
    }

    scene.add.existing(this);
  }

  close(): void {
    this.destroy();
  }
}
