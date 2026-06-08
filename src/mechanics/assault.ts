import Phaser from 'phaser';
import { COLORS, HEX, FONT } from '../theme.ts';
import { t } from '../i18n/index.ts';
import type { MechanicController, MechanicOptions } from './types.ts';

// Глава 7 — Шейново: тайминг-щурм с трите колони. Всяка колона има индикатор,
// който се движи; изстреляй я, когато е в зелено. Трите трябва да ударят
// съгласувано (в близък времеви прозорец), за да разгромят лагера.

const COORD_WINDOW = 2200; // ms — максимален разлив между трите изстрелвания

interface Column {
  key: string;
  x: number;
  pos: number;
  dir: number;
  speed: number;
  launched: boolean;
  launchTime: number;
  marker: Phaser.GameObjects.Rectangle;
  check: Phaser.GameObjects.Text;
  zoneTop: number;
  zoneBot: number;
  trackTop: number;
  trackBot: number;
}

export function createAssaultMechanic(opts: MechanicOptions): MechanicController {
  const { scene, layer, area, onResult, setStatus } = opts;
  let finished = false;
  let elapsed = 0;

  setStatus(t('ch.sheynovo.mechanic.hint'));

  // Укрепен лагер горе (целта).
  const camp = scene.add.graphics();
  camp.fillStyle(COLORS.enemy, 1);
  camp.fillRoundedRect(area.x + area.width / 2 - 130, area.y, 260, 70, 10);
  layer.add(camp);

  const keys = [
    'ch.sheynovo.mechanic.left',
    'ch.sheynovo.mechanic.center',
    'ch.sheynovo.mechanic.right',
  ];
  const trackTop = area.y + 120;
  const trackBot = area.y + area.height - 130;
  const zoneTop = trackTop;
  const zoneBot = trackTop + (trackBot - trackTop) * 0.18;

  const columns: Column[] = keys.map((key, i) => {
    const x = area.x + area.width * (0.22 + 0.28 * i);

    // Писта.
    const track = scene.add.graphics();
    track.fillStyle(COLORS.bgPanelLight, 1);
    track.fillRoundedRect(x - 26, trackTop, 52, trackBot - trackTop, 10);
    track.fillStyle(COLORS.success, 0.85);
    track.fillRect(x - 26, zoneTop, 52, zoneBot - zoneTop);
    layer.add(track);

    const marker = scene.add.rectangle(x, trackBot, 64, 16, COLORS.goldLight);
    layer.add(marker);

    layer.add(
      scene.add
        .text(x, trackBot + 36, t(key), {
          fontFamily: FONT.body,
          fontSize: '22px',
          color: HEX.text,
          align: 'center',
          wordWrap: { width: 170 },
        })
        .setOrigin(0.5, 0),
    );

    const check = scene.add
      .text(x, trackTop - 30, '', {
        fontFamily: FONT.display,
        fontSize: '40px',
        color: HEX.goldLight,
      })
      .setOrigin(0.5);
    layer.add(check);

    return {
      key,
      x,
      pos: i / 3, // различни фази
      dir: 1,
      speed: 0.0009 + i * 0.0002,
      launched: false,
      launchTime: 0,
      marker,
      check,
      zoneTop,
      zoneBot,
      trackTop,
      trackBot,
    };
  });

  const evaluate = () => {
    const times = columns.map((c) => c.launchTime);
    const spread = Math.max(...times) - Math.min(...times);
    finished = true;
    if (spread <= COORD_WINDOW) {
      setStatus(t('ch.sheynovo.mechanic.won'));
      columns.forEach((c) =>
        scene.tweens.add({
          targets: c.marker,
          y: area.y + 35,
          duration: 350,
        }),
      );
      scene.time.delayedCall(900, () => onResult(true));
    } else {
      setStatus(t('ch.sheynovo.mechanic.hint'));
      scene.time.delayedCall(600, () => onResult(false));
    }
  };

  const launch = (c: Column) => {
    if (finished || c.launched) return;
    const y = c.marker.y;
    const inZone = y >= c.zoneTop && y <= c.zoneBot;
    if (!inZone) {
      // Пропуск — кратко разклащане.
      scene.tweens.add({
        targets: c.marker,
        x: c.x + 8,
        yoyo: true,
        repeat: 2,
        duration: 50,
      });
      return;
    }
    c.launched = true;
    c.launchTime = elapsed;
    c.check.setText('✓');
    c.marker.setFillStyle(COLORS.success);

    if (columns.every((col) => col.launched)) {
      evaluate();
    }
  };

  // Цяла писта = клик-цел.
  columns.forEach((c) => {
    const hit = scene.add
      .rectangle(c.x, (trackTop + trackBot) / 2, 90, trackBot - trackTop, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    layer.add(hit);
    hit.on(Phaser.Input.Events.POINTER_DOWN, () => launch(c));
  });

  return {
    update(_time, delta) {
      if (finished) return;
      elapsed += delta;
      for (const c of columns) {
        if (c.launched) continue;
        c.pos += c.dir * c.speed * delta;
        if (c.pos >= 1) {
          c.pos = 1;
          c.dir = -1;
        } else if (c.pos <= 0) {
          c.pos = 0;
          c.dir = 1;
        }
        // pos 0 = долу (старт), 1 = горе (зелена зона е горе).
        c.marker.y = c.trackBot + (c.trackTop - c.trackBot) * c.pos;
        const inZone = c.marker.y >= c.zoneTop && c.marker.y <= c.zoneBot;
        c.marker.setFillStyle(inZone ? COLORS.goldLight : COLORS.text);
      }
    },
    destroy() {},
  };
}
