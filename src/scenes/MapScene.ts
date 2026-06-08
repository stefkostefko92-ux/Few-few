import Phaser from 'phaser';
import { SCENES, COLORS, HEX, FONT, GAME_WIDTH, GAME_HEIGHT } from '../theme.ts';
import { t } from '../i18n/index.ts';
import { CHAPTERS, type Chapter } from '../config/chapters.ts';
import { isUnlocked, isCompleted } from '../state/progress.ts';
import { Button } from '../ui/Button.ts';
import { drawBackground } from '../ui/scenery.ts';

/**
 * MapScene: карта-хъб с осемте глави по виещ се път. Заключените глави са
 * затъмнени; докосването на отключена стартира ChapterScene.
 */
export class MapScene extends Phaser.Scene {
  constructor() {
    super(SCENES.Map);
  }

  create(): void {
    drawBackground(this, 0x1c2418, COLORS.bgDark);

    this.add
      .text(GAME_WIDTH / 2, 70, t('map.title'), {
        fontFamily: FONT.display,
        fontSize: '46px',
        color: HEX.gold,
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 118, t('map.subtitle'), {
        fontFamily: FONT.body,
        fontSize: '26px',
        color: HEX.textMuted,
      })
      .setOrigin(0.5);

    const nodes = this.computeNodes();
    this.drawPath(nodes);
    nodes.forEach((pos, i) => this.drawNode(CHAPTERS[i], pos));

    new Button(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT - 70,
      t('common.back'),
      () => this.scene.start(SCENES.Menu),
      { width: 280, height: 72, fontSize: 28, fill: COLORS.bgPanel },
    );
  }

  /** Изчислява зигзагообразни позиции за всяка глава отгоре надолу. */
  private computeNodes(): Phaser.Math.Vector2[] {
    const top = 200;
    const bottom = GAME_HEIGHT - 200;
    const n = CHAPTERS.length;
    const stepY = (bottom - top) / (n - 1);
    const leftX = GAME_WIDTH * 0.28;
    const rightX = GAME_WIDTH * 0.72;
    return CHAPTERS.map((_, i) => {
      const x = i % 2 === 0 ? leftX : rightX;
      return new Phaser.Math.Vector2(x, top + stepY * i);
    });
  }

  private drawPath(nodes: Phaser.Math.Vector2[]): void {
    const g = this.add.graphics();
    g.lineStyle(8, COLORS.bgPanelLight, 1);
    g.beginPath();
    g.moveTo(nodes[0].x, nodes[0].y);
    for (let i = 1; i < nodes.length; i++) {
      g.lineTo(nodes[i].x, nodes[i].y);
    }
    g.strokePath();

    // Пунктир-акцент върху изминатия (отключен) участък.
    g.lineStyle(4, COLORS.gold, 0.6);
    g.beginPath();
    g.moveTo(nodes[0].x, nodes[0].y);
    for (let i = 1; i < nodes.length; i++) {
      if (isUnlocked(CHAPTERS[i].id)) {
        g.lineTo(nodes[i].x, nodes[i].y);
      } else {
        break;
      }
    }
    g.strokePath();
  }

  private drawNode(chapter: Chapter, pos: Phaser.Math.Vector2): void {
    const unlocked = isUnlocked(chapter.id);
    const done = isCompleted(chapter.id);
    const r = 46;

    const circle = this.add.graphics();
    circle.fillStyle(unlocked ? chapter.accent : COLORS.locked, 1);
    circle.lineStyle(5, done ? COLORS.gold : COLORS.bgPanelLight, 1);
    circle.fillCircle(pos.x, pos.y, r);
    circle.strokeCircle(pos.x, pos.y, r);

    // Номер или катинар.
    const symbol = unlocked ? String(chapter.id) : '🔒';
    this.add
      .text(pos.x, pos.y, symbol, {
        fontFamily: FONT.display,
        fontSize: unlocked ? '44px' : '34px',
        color: unlocked ? HEX.text : HEX.textMuted,
      })
      .setOrigin(0.5);

    if (done) {
      this.add
        .text(pos.x + r - 6, pos.y - r + 6, '✓', {
          fontFamily: FONT.display,
          fontSize: '32px',
          color: HEX.goldLight,
        })
        .setOrigin(0.5);
    }

    // Заглавие на главата отстрани на възела.
    const onLeft = pos.x < GAME_WIDTH / 2;
    const labelX = onLeft ? pos.x + r + 18 : pos.x - r - 18;
    this.add
      .text(labelX, pos.y, t(chapter.titleKey), {
        fontFamily: FONT.body,
        fontSize: '28px',
        color: unlocked ? HEX.text : HEX.textMuted,
        wordWrap: { width: 240 },
      })
      .setOrigin(onLeft ? 0 : 1, 0.5);

    if (unlocked) {
      const hit = this.add
        .circle(pos.x, pos.y, r + 6, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });
      hit.on(Phaser.Input.Events.POINTER_UP, () => {
        this.scene.start(SCENES.Chapter, { chapterId: chapter.id });
      });
    }
  }
}
