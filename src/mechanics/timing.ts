import Phaser from 'phaser';
import { COLORS } from '../theme.ts';
import { t } from '../i18n/index.ts';
import type { MechanicController, MechanicOptions } from './types.ts';

// Глава 3 — Дунав при Свищов: тайминг. Стрелка се движи напред-назад по лента
// със зелена зона в средата. Докосни в зелената зона, за да преведеш лодка.
// Преведи нужния брой лодки → успех.

const BOATS_NEEDED = 5;

export function createTimingMechanic(opts: MechanicOptions): MechanicController {
  const { scene, layer, area, onResult, setStatus } = opts;
  let crossed = 0;
  let finished = false;
  let canTap = true;

  const barW = area.width * 0.86;
  const barH = 56;
  const barX = area.x + (area.width - barW) / 2;
  const barY = area.y + area.height - 160;
  const greenW = barW * 0.22;
  const greenX = barX + (barW - greenW) / 2;

  // Река като фон.
  const river = scene.add.graphics();
  river.fillStyle(0x2f5a6b, 0.5);
  river.fillRect(area.x, area.y, area.width, area.height - 220);
  layer.add(river);

  // Брегове: цел горе.
  const targetY = area.y + 40;
  const startY = barY - 80;

  // Лента + зелена зона.
  const bar = scene.add.graphics();
  bar.fillStyle(COLORS.bgPanelLight, 1);
  bar.fillRoundedRect(barX, barY, barW, barH, 10);
  bar.fillStyle(COLORS.success, 0.85);
  bar.fillRect(greenX, barY, greenW, barH);
  layer.add(bar);

  const marker = scene.add
    .rectangle(barX, barY + barH / 2, 10, barH + 16, COLORS.goldLight)
    .setOrigin(0.5);
  layer.add(marker);

  const statusText = () =>
    `${t('ch.danube.mechanic.crossed')}: ${crossed}/${BOATS_NEEDED}`;
  setStatus(`${t('ch.danube.mechanic.hint')}\n${statusText()}`);

  let dir = 1;
  let pos = 0; // 0..1 along bar
  let speed = 0.0011;

  const tapZone = scene.add
    .rectangle(area.x, area.y, area.width, area.height, 0xffffff, 0.001)
    .setOrigin(0)
    .setInteractive();
  layer.add(tapZone);

  tapZone.on(Phaser.Input.Events.POINTER_DOWN, () => {
    if (finished || !canTap) return;
    const markerX = barX + pos * barW;
    const inZone = markerX >= greenX && markerX <= greenX + greenW;
    canTap = false;
    scene.time.delayedCall(160, () => (canTap = true));

    const boat = scene.add.image(barX + barW / 2, startY, 'boat');
    layer.add(boat);

    if (inZone) {
      scene.tweens.add({
        targets: boat,
        y: targetY,
        duration: 500,
        onComplete: () => {
          crossed++;
          speed += 0.00012; // леко по-трудно с всяка лодка
          if (crossed >= BOATS_NEEDED && !finished) {
            finished = true;
            setStatus(t('ch.danube.mechanic.done'));
            scene.time.delayedCall(600, () => onResult(true));
          } else {
            setStatus(`${t('ch.danube.mechanic.hint')}\n${statusText()}`);
          }
        },
      });
    } else {
      // Пропуск: лодката се връща/потъва, без наказание по брой.
      scene.tweens.add({
        targets: boat,
        y: startY + 40,
        alpha: 0,
        angle: 20,
        duration: 450,
        onComplete: () => boat.destroy(),
      });
    }
  });

  return {
    update(_time, delta) {
      if (finished) return;
      pos += dir * speed * delta;
      if (pos >= 1) {
        pos = 1;
        dir = -1;
      } else if (pos <= 0) {
        pos = 0;
        dir = 1;
      }
      marker.x = barX + pos * barW;
      const markerX = marker.x;
      const inZone = markerX >= greenX && markerX <= greenX + greenW;
      marker.setFillStyle(inZone ? COLORS.goldLight : COLORS.text);
    },
    destroy() {},
  };
}
