import Phaser from 'phaser';
import { SCENES, COLORS, HEX, FONT, GAME_WIDTH, GAME_HEIGHT } from '../theme.ts';
import { t, getLang, type Lang } from '../i18n/index.ts';
import {
  hasAnyProgress,
  setLanguage,
  resetProgress,
} from '../state/progress.ts';
import { Button } from '../ui/Button.ts';
import { Dialog } from '../ui/Dialog.ts';
import { drawBackground, drawHills } from '../ui/scenery.ts';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super(SCENES.Menu);
  }

  create(): void {
    drawBackground(this);
    drawHills(this, GAME_HEIGHT - 360, 0x141d12, 50);
    drawHills(this, GAME_HEIGHT - 240, COLORS.bgDark, 70);

    const cx = GAME_WIDTH / 2;

    // Знаме като герб над заглавието.
    this.add.image(cx, 250, 'flag').setScale(1.4);

    this.add
      .text(cx, 430, t('app.title'), {
        fontFamily: FONT.display,
        fontSize: '78px',
        color: HEX.gold,
      })
      .setOrigin(0.5);
    this.add
      .text(cx, 500, t('app.subtitle'), {
        fontFamily: FONT.display,
        fontSize: '54px',
        color: HEX.parchment,
      })
      .setOrigin(0.5);
    this.add
      .text(cx, 560, t('app.tagline'), {
        fontFamily: FONT.body,
        fontSize: '26px',
        color: HEX.textMuted,
        align: 'center',
        wordWrap: { width: GAME_WIDTH - 120 },
      })
      .setOrigin(0.5);

    const playLabel = hasAnyProgress() ? t('menu.continue') : t('menu.play');
    new Button(this, cx, 720, playLabel, () => this.scene.start(SCENES.Map), {
      fill: COLORS.flagGreen,
    });

    new Button(this, cx, 840, t('menu.credits'), () =>
      this.scene.start(SCENES.Credits),
    );

    if (hasAnyProgress()) {
      new Button(
        this,
        cx,
        960,
        t('menu.reset'),
        () => this.confirmReset(),
        { fill: COLORS.bgPanel, fontSize: 28 },
      );
    }

    this.buildLanguageToggle();
  }

  private buildLanguageToggle(): void {
    const y = GAME_HEIGHT - 90;
    this.add
      .text(GAME_WIDTH / 2, y - 56, t('menu.language'), {
        fontFamily: FONT.body,
        fontSize: '24px',
        color: HEX.textMuted,
      })
      .setOrigin(0.5);

    const langs: Lang[] = ['bg', 'en'];
    const gap = 220;
    langs.forEach((lang, i) => {
      const x = GAME_WIDTH / 2 + (i === 0 ? -gap / 2 : gap / 2);
      const active = getLang() === lang;
      new Button(
        this,
        x,
        y,
        lang === 'bg' ? t('menu.lang.bg') : t('menu.lang.en'),
        () => {
          void this.changeLang(lang);
        },
        {
          width: 200,
          height: 64,
          fontSize: 26,
          fill: active ? COLORS.gold : COLORS.bgPanel,
          textColor: active ? HEX.textDark : HEX.text,
        },
      );
    });
  }

  private async changeLang(lang: Lang): Promise<void> {
    if (getLang() === lang) return;
    await setLanguage(lang);
    this.scene.restart();
  }

  private confirmReset(): void {
    new Dialog(this, {
      body: t('menu.reset.confirm'),
      buttons: [
        {
          textKey: 'common.yes',
          fill: COLORS.danger,
          onClick: () => {
            void resetProgress().then(() => this.scene.restart());
          },
        },
        { textKey: 'common.no', onClick: () => {} },
      ],
    });
  }
}
