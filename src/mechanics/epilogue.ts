import Phaser from 'phaser';
import { HEX, FONT } from '../theme.ts';
import { t } from '../i18n/index.ts';
import type { MechanicController, MechanicOptions } from './types.ts';

// Глава 8 — Освобождението: финален епилог. Поредица кратки текстове, които се
// сменят при докосване, завършващи с „3 март 1878 — Освобождение“.

const LINES = [
  'ch.liberation.mechanic.epilogue1',
  'ch.liberation.mechanic.epilogue2',
  'ch.liberation.mechanic.epilogue3',
];

export function createEpilogueMechanic(
  opts: MechanicOptions,
): MechanicController {
  const { scene, layer, area, onResult, setStatus } = opts;
  let index = 0;
  let finished = false;

  setStatus(t('common.tapToStart'));

  // Знамето в центъра, осветено.
  const flag = scene.add
    .image(area.x + area.width / 2, area.y + 160, 'flag')
    .setScale(1.6);
  layer.add(flag);
  scene.tweens.add({
    targets: flag,
    angle: { from: -2, to: 2 },
    yoyo: true,
    repeat: -1,
    duration: 1400,
  });

  const text = scene.add
    .text(area.x + area.width / 2, area.y + area.height / 2 + 40, '', {
      fontFamily: FONT.body,
      fontSize: '32px',
      color: HEX.text,
      align: 'center',
      lineSpacing: 10,
      wordWrap: { width: area.width - 60 },
    })
    .setOrigin(0.5);
  layer.add(text);

  const showLine = () => {
    text.setAlpha(0);
    text.setText(t(LINES[index]));
    scene.tweens.add({ targets: text, alpha: 1, duration: 500 });
  };
  showLine();

  const advance = () => {
    if (finished) return;
    index++;
    if (index >= LINES.length) {
      finished = true;
      setStatus(t('ch.liberation.mechanic.end'));
      scene.time.delayedCall(400, () => onResult(true));
      return;
    }
    showLine();
  };

  const tap = scene.add
    .rectangle(area.x, area.y, area.width, area.height, 0xffffff, 0.001)
    .setOrigin(0)
    .setInteractive({ useHandCursor: true });
  layer.add(tap);
  tap.on(Phaser.Input.Events.POINTER_DOWN, advance);

  return {
    destroy() {},
  };
}
