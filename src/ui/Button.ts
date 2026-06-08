import Phaser from 'phaser';
import { COLORS, HEX, FONT } from '../theme.ts';

export interface ButtonOptions {
  width?: number;
  height?: number;
  fontSize?: number;
  fill?: number;
  textColor?: string;
  disabled?: boolean;
}

/**
 * Многократно използваем бутон: заоблен правоъгълник + центриран текст,
 * с обратна връзка при докосване. Една отговорност — клик-цел с надпис.
 */
export class Button extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly btnW: number;
  private readonly btnH: number;
  private readonly fillColor: number;
  private enabledState = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    onClick: () => void,
    opts: ButtonOptions = {},
  ) {
    super(scene, x, y);

    this.btnW = opts.width ?? 440;
    this.btnH = opts.height ?? 96;
    this.fillColor = opts.fill ?? COLORS.bgPanelLight;

    this.bg = scene.add.graphics();
    this.add(this.bg);

    this.label = scene.add
      .text(0, 0, text, {
        fontFamily: FONT.display,
        fontSize: `${opts.fontSize ?? 34}px`,
        color: opts.textColor ?? HEX.text,
        align: 'center',
        wordWrap: { width: this.btnW - 40 },
      })
      .setOrigin(0.5);
    this.add(this.label);

    this.drawBg(this.fillColor);

    this.setSize(this.btnW, this.btnH);
    this.setInteractive(
      new Phaser.Geom.Rectangle(-this.btnW / 2, -this.btnH / 2, this.btnW, this.btnH),
      Phaser.Geom.Rectangle.Contains,
    );

    this.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (!this.enabledState) return;
      this.setScale(0.96);
      this.drawBg(COLORS.gold);
      this.label.setColor(HEX.textDark);
    });
    this.on(Phaser.Input.Events.POINTER_UP, () => {
      if (!this.enabledState) return;
      this.setScale(1);
      this.drawBg(this.fillColor);
      this.label.setColor(opts.textColor ?? HEX.text);
      onClick();
    });
    this.on(Phaser.Input.Events.POINTER_OUT, () => {
      if (!this.enabledState) return;
      this.setScale(1);
      this.drawBg(this.fillColor);
      this.label.setColor(opts.textColor ?? HEX.text);
    });

    if (opts.disabled) this.setEnabled(false);

    scene.add.existing(this);
  }

  private drawBg(fill: number): void {
    this.bg.clear();
    this.bg.fillStyle(fill, 1);
    this.bg.lineStyle(3, COLORS.gold, this.enabledState ? 1 : 0.3);
    this.bg.fillRoundedRect(-this.btnW / 2, -this.btnH / 2, this.btnW, this.btnH, 14);
    this.bg.strokeRoundedRect(-this.btnW / 2, -this.btnH / 2, this.btnW, this.btnH, 14);
  }

  setEnabled(enabled: boolean): this {
    this.enabledState = enabled;
    this.label.setAlpha(enabled ? 1 : 0.4);
    this.drawBg(this.fillColor);
    if (enabled) {
      this.setInteractive();
    } else {
      this.disableInteractive();
    }
    return this;
  }

  setText(text: string): this {
    this.label.setText(text);
    return this;
  }
}
