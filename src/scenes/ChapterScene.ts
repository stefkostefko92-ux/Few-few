import Phaser from 'phaser';
import { SCENES, COLORS, HEX, FONT, GAME_WIDTH, GAME_HEIGHT } from '../theme.ts';
import { t } from '../i18n/index.ts';
import { getChapter, type Chapter } from '../config/chapters.ts';
import { completeChapter, isUnlocked } from '../state/progress.ts';
import { TOTAL_CHAPTERS } from '../config/chapters.ts';
import { MECHANIC_FACTORIES } from '../mechanics/index.ts';
import type { MechanicController } from '../mechanics/types.ts';
import { Button } from '../ui/Button.ts';
import { Dialog } from '../ui/Dialog.ts';
import { drawBackground } from '../ui/scenery.ts';

type Phase = 'intro' | 'play' | 'end';

/**
 * ChapterScene: оркестрира една глава — разказ (intro) → механика → факти
 * („Знаеше ли?“) → завършване. Самата механика идва от регистъра според
 * данните в chapters.ts.
 */
export class ChapterScene extends Phaser.Scene {
  private chapter!: Chapter;
  private phase: Phase = 'intro';
  private controller: MechanicController | null = null;
  private playLayer: Phaser.GameObjects.Container | null = null;
  private statusText!: Phaser.GameObjects.Text;
  private uiLayer!: Phaser.GameObjects.Container;

  constructor() {
    super(SCENES.Chapter);
  }

  init(data: { chapterId: number }): void {
    const ch = getChapter(data.chapterId);
    if (!ch) throw new Error(`Непозната глава: ${data.chapterId}`);
    this.chapter = ch;
    this.phase = 'intro';
    this.controller = null;
    this.playLayer = null;
  }

  create(): void {
    drawBackground(this, this.chapter.accent & 0x3f3f3f, COLORS.bgDark);
    this.drawHud();
    this.uiLayer = this.add.container(0, 0);
    this.showIntro();
  }

  private drawHud(): void {
    const top = this.add.graphics();
    top.fillStyle(COLORS.bgPanel, 0.9);
    top.fillRect(0, 0, GAME_WIDTH, 150);
    top.lineStyle(3, COLORS.gold, 0.7);
    top.lineBetween(0, 150, GAME_WIDTH, 150);

    this.add.text(28, 24, `${t('common.chapter')} ${this.chapter.id}`, {
      fontFamily: FONT.body,
      fontSize: '24px',
      color: HEX.textMuted,
    });
    this.add.text(28, 54, t(this.chapter.titleKey), {
      fontFamily: FONT.display,
      fontSize: '40px',
      color: HEX.gold,
    });
    const dateOld = t(this.chapter.dateOldKey);
    const dateNew = t(this.chapter.dateNewKey);
    this.add.text(28, 106, `${dateOld} / ${dateNew}  (${t('common.dateLabel')})`, {
      fontFamily: FONT.body,
      fontSize: '22px',
      color: HEX.parchment,
    });

    this.statusText = this.add
      .text(GAME_WIDTH / 2, 170, '', {
        fontFamily: FONT.body,
        fontSize: '26px',
        color: HEX.text,
        align: 'center',
        wordWrap: { width: GAME_WIDTH - 60 },
      })
      .setOrigin(0.5, 0);
  }

  private playArea(): Phaser.Geom.Rectangle {
    const top = 260;
    return new Phaser.Geom.Rectangle(40, top, GAME_WIDTH - 80, GAME_HEIGHT - top - 60);
  }

  private setStatus(text: string): void {
    this.statusText.setText(text);
  }

  // --- Разказ ---
  private showIntro(): void {
    this.phase = 'intro';
    this.uiLayer.removeAll(true);

    const area = this.playArea();
    const cx = GAME_WIDTH / 2;

    // Илюстрация-акцент.
    const banner = this.add.graphics();
    banner.fillStyle(this.chapter.accent, 1);
    banner.fillRoundedRect(area.x, area.y, area.width, 150, 14);
    this.uiLayer.add(banner);
    const icon = this.add.image(cx, area.y + 75, 'flag').setScale(0.9);
    this.uiLayer.add(icon);

    const intro = this.add
      .text(cx, area.y + 180, t(this.chapter.introKey), {
        fontFamily: FONT.body,
        fontSize: '29px',
        color: HEX.text,
        align: 'left',
        lineSpacing: 9,
        wordWrap: { width: area.width - 20 },
      })
      .setOrigin(0.5, 0);
    this.uiLayer.add(intro);

    const startBtn = new Button(
      this,
      cx,
      area.y + area.height - 60,
      t('common.start'),
      () => this.startMechanic(),
      { fill: COLORS.flagGreen },
    );
    this.uiLayer.add(startBtn);

    const backBtn = new Button(
      this,
      cx,
      area.y + area.height + 10,
      t('common.toMap'),
      () => this.scene.start(SCENES.Map),
      { width: 280, height: 64, fontSize: 24, fill: COLORS.bgPanel },
    );
    this.uiLayer.add(backBtn);
  }

  // --- Механика ---
  private startMechanic(): void {
    this.phase = 'play';
    this.uiLayer.removeAll(true);
    this.setStatus('');

    this.playLayer = this.add.container(0, 0);
    const factory = MECHANIC_FACTORIES[this.chapter.mechanic];
    this.controller = factory({
      scene: this,
      chapter: this.chapter,
      layer: this.playLayer,
      area: this.playArea(),
      onResult: (success) => this.onMechanicResult(success),
      setStatus: (text) => this.setStatus(text),
    });
  }

  private teardownMechanic(): void {
    this.controller?.destroy();
    this.controller = null;
    this.playLayer?.destroy();
    this.playLayer = null;
  }

  private onMechanicResult(success: boolean): void {
    if (this.phase !== 'play') return;
    this.phase = 'end';
    this.teardownMechanic();
    if (success) {
      this.showFacts();
    } else {
      this.showRetry();
    }
  }

  private showRetry(): void {
    new Dialog(this, {
      title: `${t('common.chapter')} ${this.chapter.id}`,
      body: t(this.chapter.titleKey),
      buttons: [
        {
          textKey: 'common.retry',
          fill: COLORS.flagGreen,
          onClick: () => this.startMechanic(),
        },
        {
          textKey: 'common.toMap',
          onClick: () => this.scene.start(SCENES.Map),
        },
      ],
    });
  }

  private showFacts(): void {
    const facts = this.chapter.factKeys.map((k) => t(k)).join('\n\n');
    new Dialog(this, {
      title: t('common.didYouKnow'),
      body: facts,
      buttons: [
        {
          textKey: 'common.continue',
          fill: COLORS.flagGreen,
          onClick: () => {
            void this.finishChapter();
          },
        },
      ],
    });
  }

  private async finishChapter(): Promise<void> {
    await completeChapter(this.chapter.id);
    this.showCompletion();
  }

  private showCompletion(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    this.uiLayer.removeAll(true);

    this.uiLayer.add(
      this.add
        .text(cx, cy - 160, '✓', {
          fontFamily: FONT.display,
          fontSize: '120px',
          color: HEX.goldLight,
        })
        .setOrigin(0.5),
    );
    this.uiLayer.add(
      this.add
        .text(cx, cy - 40, t('common.completed'), {
          fontFamily: FONT.display,
          fontSize: '46px',
          color: HEX.gold,
        })
        .setOrigin(0.5),
    );

    const nextId = this.chapter.id + 1;
    const hasNext = nextId <= TOTAL_CHAPTERS;
    if (hasNext && isUnlocked(nextId)) {
      this.uiLayer.add(
        new Button(this, cx, cy + 80, t('common.next'), () =>
          this.scene.start(SCENES.Chapter, { chapterId: nextId }),
        ),
      );
    } else if (!hasNext) {
      // Последна глава → към кредитите.
      this.uiLayer.add(
        new Button(this, cx, cy + 80, t('menu.credits'), () =>
          this.scene.start(SCENES.Credits),
        ),
      );
    }

    this.uiLayer.add(
      new Button(
        this,
        cx,
        cy + 200,
        t('common.toMap'),
        () => this.scene.start(SCENES.Map),
        { width: 320, height: 80, fontSize: 28, fill: COLORS.bgPanel },
      ),
    );
  }

  override update(time: number, delta: number): void {
    if (this.phase === 'play' && this.controller?.update) {
      this.controller.update(time, delta);
    }
  }
}
