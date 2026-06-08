import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../theme.ts';

/**
 * Рисува споделен фон: вертикален градиент + лека винетка. Връща контейнера,
 * за да може сцената да го постави най-отзад.
 */
export function drawBackground(
  scene: Phaser.Scene,
  topColor: number = COLORS.bgPanel,
  bottomColor: number = COLORS.bgDark,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.setDepth(-100);
  const steps = 32;
  const top = Phaser.Display.Color.IntegerToColor(topColor);
  const bottom = Phaser.Display.Color.IntegerToColor(bottomColor);
  for (let i = 0; i < steps; i++) {
    const tt = i / (steps - 1);
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(top, bottom, 1, tt);
    const color = Phaser.Display.Color.GetColor(c.r, c.g, c.b);
    g.fillStyle(color, 1);
    g.fillRect(0, (GAME_HEIGHT / steps) * i, GAME_WIDTH, GAME_HEIGHT / steps + 1);
  }
  return g;
}

/** Рисува хоризонтален терен/хълм като силует. */
export function drawHills(
  scene: Phaser.Scene,
  y: number,
  color: number,
  amplitude = 60,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(color, 1);
  g.beginPath();
  g.moveTo(0, GAME_HEIGHT);
  g.lineTo(0, y);
  const segs = 8;
  for (let i = 0; i <= segs; i++) {
    const x = (GAME_WIDTH / segs) * i;
    const yy = y + Math.sin(i * 1.3) * amplitude;
    g.lineTo(x, yy);
  }
  g.lineTo(GAME_WIDTH, GAME_HEIGHT);
  g.closePath();
  g.fillPath();
  return g;
}
