import Phaser from 'phaser';
import { COLORS } from '../theme.ts';
import { t } from '../i18n/index.ts';
import type { MechanicController, MechanicOptions } from './types.ts';

// Глава 4 — Стара Загора: защити знаменосеца. Влачи знаменосеца нагоре към
// своите линии, избягвайки преследващите вражески войници. Достигни върха →
// знамето е спасено. Допир от враг → застигнат (повтори).

interface Enemy {
  sprite: Phaser.GameObjects.Image;
  speed: number;
}

export function createProtectMechanic(opts: MechanicOptions): MechanicController {
  const { scene, layer, area, onResult, setStatus } = opts;
  let finished = false;

  const goalY = area.y + 60;
  const startY = area.y + area.height - 90;
  const startX = area.x + area.width / 2;

  setStatus(t('ch.stara_zagora.mechanic.hint'));

  // Линия на своите (целта) горе.
  const goalLine = scene.add.graphics();
  goalLine.lineStyle(4, COLORS.flagGreen, 0.9);
  goalLine.lineBetween(area.x, goalY, area.x + area.width, goalY);
  layer.add(goalLine);

  const bearer = scene.add.image(startX, startY, 'flag').setScale(0.8);
  layer.add(bearer);

  // Влачене на знаменосеца.
  bearer.setInteractive({ draggable: true, useHandCursor: true });
  scene.input.setDraggable(bearer);
  let dragging = false;
  bearer.on(Phaser.Input.Events.DRAG_START, () => (dragging = true));
  bearer.on(Phaser.Input.Events.DRAG_END, () => (dragging = false));
  bearer.on(
    Phaser.Input.Events.DRAG,
    (_p: Phaser.Input.Pointer, dx: number, dy: number) => {
      if (finished) return;
      bearer.x = Phaser.Math.Clamp(dx, area.x + 30, area.x + area.width - 30);
      bearer.y = Phaser.Math.Clamp(dy, goalY, startY + 10);
    },
  );

  const enemies: Enemy[] = [];
  const spawnEnemy = () => {
    if (finished) return;
    const fromLeft = Math.random() < 0.5;
    const ex = fromLeft ? area.x + 20 : area.x + area.width - 20;
    const ey = Phaser.Math.Between(area.y + 120, area.y + area.height - 160);
    const sprite = scene.add.image(ex, ey, 'enemy').setScale(1.1);
    if (!fromLeft) sprite.setFlipX(true);
    layer.add(sprite);
    enemies.push({ sprite, speed: Phaser.Math.FloatBetween(0.05, 0.085) });
  };

  // Първоначални врагове + периодичен прираст.
  for (let i = 0; i < 3; i++) spawnEnemy();
  const spawnTimer = scene.time.addEvent({
    delay: 1400,
    loop: true,
    callback: spawnEnemy,
  });

  const distanceLabel = () => {
    const total = startY - goalY;
    const left = Phaser.Math.Clamp((bearer.y - goalY) / total, 0, 1);
    return `${t('ch.stara_zagora.mechanic.distance')}: ${Math.ceil(left * 100)}`;
  };

  const fail = () => {
    if (finished) return;
    finished = true;
    spawnTimer.remove();
    setStatus(t('ch.stara_zagora.mechanic.caught'));
    bearer.setTint(0xff6666);
    scene.time.delayedCall(700, () => onResult(false));
  };

  const win = () => {
    if (finished) return;
    finished = true;
    spawnTimer.remove();
    setStatus(t('ch.stara_zagora.mechanic.saved'));
    scene.tweens.add({ targets: bearer, scale: 1.1, yoyo: true, duration: 150 });
    scene.time.delayedCall(700, () => onResult(true));
  };

  return {
    update(_time, delta) {
      if (finished) return;

      for (const e of enemies) {
        const ang = Phaser.Math.Angle.Between(
          e.sprite.x,
          e.sprite.y,
          bearer.x,
          bearer.y,
        );
        e.sprite.x += Math.cos(ang) * e.speed * delta;
        e.sprite.y += Math.sin(ang) * e.speed * delta;
        e.sprite.setFlipX(bearer.x < e.sprite.x);

        const d = Phaser.Math.Distance.Between(
          e.sprite.x,
          e.sprite.y,
          bearer.x,
          bearer.y,
        );
        if (d < 48) {
          fail();
          return;
        }
      }

      if (bearer.y <= goalY + 6) {
        win();
        return;
      }

      if (!dragging) setStatus(distanceLabel());
    },
    destroy() {},
  };
}
