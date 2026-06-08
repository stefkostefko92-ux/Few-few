import Phaser from 'phaser';
import { COLORS, HEX, FONT } from '../theme.ts';
import { t } from '../i18n/index.ts';
import { Button } from '../ui/Button.ts';
import type { MechanicController, MechanicOptions } from './types.ts';

// Глава 6 — Плевен и зимният поход: кинематична карта + избор по маршрута.
// На всяко разклонение играчът избира път; колоната напредва през Балкана.
// Няма провал — това е разказвателен преход. След N избора → пристигане.

const FORKS = 3;

export function createMarchMechanic(opts: MechanicOptions): MechanicController {
  const { scene, layer, area, onResult, setStatus } = opts;
  let fork = 0;
  let finished = false;

  setStatus(t('ch.pleven_march.mechanic.hint'));

  // Заснежен фон.
  const snow = scene.add.graphics();
  snow.fillStyle(0x3a4452, 1);
  snow.fillRect(area.x, area.y, area.width, area.height);
  layer.add(snow);
  for (let i = 0; i < 40; i++) {
    layer.add(
      scene.add.circle(
        Phaser.Math.Between(area.x, area.x + area.width),
        Phaser.Math.Between(area.y, area.y + area.height),
        Phaser.Math.Between(2, 4),
        0xffffff,
        0.7,
      ),
    );
  }

  // Колоната — низ от опълченци, която придвижваме нагоре с всеки избор.
  const colX = area.x + area.width / 2;
  const baseY = area.y + area.height - 80;
  const column = scene.add.image(colX, baseY, 'volunteer').setScale(1.3);
  layer.add(column);
  const flag = scene.add.image(colX - 50, baseY, 'flag').setScale(0.5);
  layer.add(flag);

  const stepY = (area.height - 220) / FORKS;

  let buttons: Button[] = [];
  const clearButtons = () => {
    buttons.forEach((b) => b.destroy());
    buttons = [];
  };

  const advance = () => {
    const targetY = baseY - stepY * (fork + 1);
    scene.tweens.add({
      targets: [column, flag],
      y: targetY,
      duration: 600,
      onComplete: () => {
        fork++;
        if (fork >= FORKS) {
          finished = true;
          setStatus(t('ch.pleven_march.mechanic.arrived'));
          scene.time.delayedCall(800, () => onResult(true));
        } else {
          showChoice();
        }
      },
    });
  };

  const showChoice = () => {
    clearButtons();
    const y = area.y + area.height - 60;
    const safe = new Button(
      scene,
      area.x + area.width / 2,
      y - 70,
      t('ch.pleven_march.mechanic.choiceSafe'),
      () => {
        clearButtons();
        advance();
      },
      { width: area.width - 60, height: 80, fontSize: 26, fill: COLORS.flagGreen },
    );
    const fast = new Button(
      scene,
      area.x + area.width / 2,
      y + 30,
      t('ch.pleven_march.mechanic.choiceFast'),
      () => {
        clearButtons();
        advance();
      },
      { width: area.width - 60, height: 80, fontSize: 26, fill: COLORS.bgPanelLight },
    );
    layer.add(safe);
    layer.add(fast);
    buttons.push(safe, fast);

    layer.add(
      scene.add
        .text(area.x + area.width / 2, area.y + 30, `${fork + 1} / ${FORKS}`, {
          fontFamily: FONT.display,
          fontSize: '30px',
          color: HEX.gold,
        })
        .setOrigin(0.5),
    );
  };

  showChoice();

  return {
    destroy() {
      if (!finished) clearButtons();
    },
  };
}
