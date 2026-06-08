import Phaser from 'phaser';
import { COLORS } from '../theme.ts';
import { t } from '../i18n/index.ts';
import type { MechanicController, MechanicOptions } from './types.ts';

// Глава 5 — Шипка: wave-defense. Враговете се изкачват към билото. Докосни ги,
// за да стреляш (харчиш патрони). Когато патроните свършат — хвърляш камъни
// (по-бавно). Удържи до пристигането на подкрепленията. Ако позицията падне →
// провал.

const START_AMMO = 18;
const HOLD_MAX = 100;
const SURVIVE_MS = 32000;
const STONE_COOLDOWN = 420;

interface Foe {
  sprite: Phaser.GameObjects.Image;
  speed: number;
  alive: boolean;
}

export function createDefenseMechanic(opts: MechanicOptions): MechanicController {
  const { scene, layer, area, onResult, setStatus } = opts;
  let finished = false;
  let ammo = START_AMMO;
  let hold = HOLD_MAX;
  let elapsed = 0;
  let lastStone = -9999;

  const lineY = area.y + 90;

  // Билото/позицията горе с няколко опълченци.
  const ridge = scene.add.graphics();
  ridge.fillStyle(0x2a3320, 1);
  ridge.fillRect(area.x, area.y, area.width, lineY - area.y + 20);
  layer.add(ridge);
  for (let i = 0; i < 4; i++) {
    const v = scene.add
      .image(area.x + 70 + i * (area.width - 140) / 3, lineY - 10, 'volunteer')
      .setScale(1.0);
    layer.add(v);
  }

  const foes: Foe[] = [];

  const updateStatus = () => {
    const secs = Math.max(0, Math.ceil((SURVIVE_MS - elapsed) / 1000));
    const ammoLine =
      ammo > 0
        ? `${t('ch.shipka.mechanic.ammo')}: ${ammo}`
        : `${t('ch.shipka.mechanic.stones')}: ∞`;
    setStatus(
      `${ammoLine}   ${t('ch.shipka.mechanic.hold')}: ${Math.ceil(hold)}%   ⏳ ${secs}s`,
    );
  };
  setStatus(t('ch.shipka.mechanic.hint'));
  scene.time.delayedCall(1600, () => {
    if (!finished) updateStatus();
  });

  const killFoe = (foe: Foe, withStone: boolean) => {
    foe.alive = false;
    const spark = scene.add.image(
      foe.sprite.x,
      foe.sprite.y,
      withStone ? 'stone' : 'spark_gold',
    );
    layer.add(spark);
    scene.tweens.add({
      targets: spark,
      alpha: 0,
      scale: 2,
      duration: 250,
      onComplete: () => spark.destroy(),
    });
    scene.tweens.add({
      targets: foe.sprite,
      alpha: 0,
      y: foe.sprite.y + 20,
      duration: 200,
      onComplete: () => foe.sprite.destroy(),
    });
  };

  const tapFoe = (foe: Foe) => {
    if (finished || !foe.alive) return;
    if (ammo > 0) {
      ammo--;
      killFoe(foe, false);
    } else {
      // Камъни: с кратък презареждащ интервал.
      if (elapsed - lastStone < STONE_COOLDOWN) return;
      lastStone = elapsed;
      killFoe(foe, true);
    }
    updateStatus();
  };

  const spawnFoe = () => {
    if (finished) return;
    const x = Phaser.Math.Between(area.x + 40, area.x + area.width - 40);
    const y = area.y + area.height - 20;
    const sprite = scene.add
      .image(x, y, 'enemy')
      .setScale(1.1)
      .setInteractive({ useHandCursor: true });
    layer.add(sprite);
    const foe: Foe = {
      sprite,
      speed: Phaser.Math.FloatBetween(0.018, 0.03) + elapsed / 4_000_000,
      alive: true,
    };
    sprite.on(Phaser.Input.Events.POINTER_DOWN, () => tapFoe(foe));
    foes.push(foe);
  };

  // Прираст на враговете: ускоряваща се вълна.
  const spawnTimer = scene.time.addEvent({
    delay: 900,
    loop: true,
    callback: () => {
      spawnFoe();
      if (Math.random() < Math.min(0.6, elapsed / SURVIVE_MS)) spawnFoe();
    },
  });

  const finish = (success: boolean) => {
    if (finished) return;
    finished = true;
    spawnTimer.remove();
    setStatus(
      success
        ? t('ch.shipka.mechanic.reinforcements')
        : t('ch.shipka.mechanic.fallen'),
    );
    scene.time.delayedCall(900, () => onResult(success));
  };

  const breach = scene.add.graphics().setDepth(50);
  layer.add(breach);

  return {
    update(_time, delta) {
      if (finished) return;
      elapsed += delta;

      for (const foe of foes) {
        if (!foe.alive) continue;
        foe.sprite.y -= foe.speed * delta;
        if (foe.sprite.y <= lineY) {
          foe.alive = false;
          hold -= 8;
          foe.sprite.destroy();
          // Кратко проблясване при пробив.
          breach.clear();
          breach.fillStyle(COLORS.danger, 0.35);
          breach.fillRect(area.x, area.y, area.width, lineY - area.y + 20);
          scene.time.delayedCall(140, () => breach.clear());
        }
      }

      if (hold <= 0) {
        finish(false);
        return;
      }
      if (elapsed >= SURVIVE_MS) {
        finish(true);
        return;
      }

      if (Math.floor(elapsed / 250) !== Math.floor((elapsed - delta) / 250)) {
        updateStatus();
      }
    },
    destroy() {},
  };
}
