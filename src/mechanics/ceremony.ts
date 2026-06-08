import Phaser from 'phaser';
import { COLORS } from '../theme.ts';
import { t } from '../i18n/index.ts';
import { Button } from '../ui/Button.ts';
import type { MechanicController, MechanicOptions } from './types.ts';

// Глава 2 — Самарското знаме: подреди триколора. Три цветни ленти, разбъркани;
// докосни две, за да ги размениш. Правилен ред (червено, бяло, зелено) →
// активира бутона „Издигни знамето“ → успех.

const ORDER = [COLORS.flagRed, COLORS.flagWhite, COLORS.flagGreen];

export function createCeremonyMechanic(
  opts: MechanicOptions,
): MechanicController {
  const { scene, layer, area, onResult, setStatus } = opts;
  let finished = false;

  setStatus(t('ch.samara_flag.mechanic.hint'));

  // Разбъркано начално подреждане (гарантирано различно от целевото).
  const current = [COLORS.flagGreen, COLORS.flagRed, COLORS.flagWhite];

  const bandW = area.width * 0.7;
  const bandH = 90;
  const gap = 24;
  const startX = area.x + area.width / 2;
  const totalH = ORDER.length * bandH + (ORDER.length - 1) * gap;
  const startY = area.y + (area.height - totalH) / 2 - 40;

  // Пилон отляво.
  const pole = scene.add.graphics();
  pole.fillStyle(0x6b5a3a, 1);
  pole.fillRect(startX - bandW / 2 - 16, startY - 20, 12, totalH + 40);
  layer.add(pole);

  const bands: Phaser.GameObjects.Rectangle[] = [];
  let selected = -1;

  const bandY = (i: number) => startY + i * (bandH + gap) + bandH / 2;

  const raiseBtn = new Button(
    scene,
    startX,
    startY + totalH + 90,
    t('ch.samara_flag.mechanic.raise'),
    () => {
      if (finished) return;
      finished = true;
      setStatus(t('ch.samara_flag.mechanic.oath'));
      scene.tweens.add({
        targets: bands,
        x: `+=${10}`,
        yoyo: true,
        repeat: 3,
        duration: 80,
      });
      scene.time.delayedCall(900, () => onResult(true));
    },
    { fill: COLORS.flagGreen },
  );
  raiseBtn.setEnabled(false);
  layer.add(raiseBtn);

  const isSolved = () => current.every((c, i) => c === ORDER[i]);

  const refresh = () => {
    bands.forEach((b, i) => {
      b.setFillStyle(current[i], 1);
      b.setY(bandY(i));
      b.setStrokeStyle(selected === i ? 6 : 3, COLORS.gold);
    });
    raiseBtn.setEnabled(isSolved());
  };

  for (let i = 0; i < ORDER.length; i++) {
    const rect = scene.add
      .rectangle(startX, bandY(i), bandW, bandH, current[i], 1)
      .setStrokeStyle(3, COLORS.gold)
      .setInteractive({ useHandCursor: true });
    layer.add(rect);
    bands.push(rect);

    const index = i;
    rect.on(Phaser.Input.Events.POINTER_UP, () => {
      if (finished) return;
      if (selected === -1) {
        selected = index;
      } else if (selected === index) {
        selected = -1;
      } else {
        const tmp = current[selected];
        current[selected] = current[index];
        current[index] = tmp;
        selected = -1;
      }
      refresh();
    });
  }

  // Езиково-неутрална легенда с целевия ред (три малки мостри).
  const legendW = 40;
  const legendGap = 14;
  const legendTotal = ORDER.length * legendW + (ORDER.length - 1) * legendGap;
  ORDER.forEach((color, i) => {
    const lx = startX - legendTotal / 2 + i * (legendW + legendGap) + legendW / 2;
    layer.add(
      scene.add
        .rectangle(lx, startY - 56, legendW, 26, color, 1)
        .setStrokeStyle(2, COLORS.gold),
    );
  });

  refresh();

  return {
    destroy() {
      /* layer се унищожава от ChapterScene */
    },
  };
}
