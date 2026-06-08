import Phaser from 'phaser';
import { COLORS, HEX, FONT } from '../theme.ts';
import { t } from '../i18n/index.ts';
import type { MechanicController, MechanicOptions } from './types.ts';

// Глава 1 — Лагерът в Плоещ: тап-обучение. Шест дружини; докосни всяка, за да
// я обучиш и екипираш. Когато всичките шест са готови → успех.

const UNITS = 6;

export function createTutorialMechanic(
  opts: MechanicOptions,
): MechanicController {
  const { scene, layer, area, onResult, setStatus } = opts;
  let trained = 0;
  let finished = false;

  setStatus(t('ch.ploesti.mechanic.hint'));

  const cols = 2;
  const rows = 3;
  const cellW = area.width / cols;
  const cellH = area.height / rows;

  for (let i = 0; i < UNITS; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = area.x + cellW * col + cellW / 2;
    const y = area.y + cellH * row + cellH / 2;

    const ring = scene.add.graphics();
    ring.lineStyle(4, COLORS.bgPanelLight, 1);
    ring.strokeCircle(x, y, 70);
    layer.add(ring);

    const sprite = scene.add.image(x, y - 6, 'volunteer').setScale(1.3);
    sprite.setTint(0x8a8a8a); // необучена = сива
    layer.add(sprite);

    const label = scene.add
      .text(x, y + 70, `${t('ch.ploesti.mechanic.unit')} ${i + 1}`, {
        fontFamily: FONT.body,
        fontSize: '24px',
        color: HEX.textMuted,
      })
      .setOrigin(0.5);
    layer.add(label);

    let done = false;
    const hit = scene.add
      .circle(x, y, 78, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    layer.add(hit);

    hit.on(Phaser.Input.Events.POINTER_UP, () => {
      if (done || finished) return;
      done = true;
      trained++;
      sprite.clearTint();
      scene.tweens.add({
        targets: sprite,
        scale: 1.5,
        yoyo: true,
        duration: 120,
      });
      ring.clear();
      ring.lineStyle(4, COLORS.gold, 1);
      ring.strokeCircle(x, y, 70);
      label.setColor(HEX.gold);
      hit.disableInteractive();

      if (trained >= UNITS && !finished) {
        finished = true;
        setStatus(t('ch.ploesti.mechanic.done'));
        scene.time.delayedCall(700, () => onResult(true));
      }
    });
  }

  return {
    destroy() {
      /* обектите се чистят чрез унищожаване на layer от ChapterScene */
    },
  };
}
