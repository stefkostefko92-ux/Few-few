import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from './theme.ts';
import { BootScene } from './scenes/BootScene.ts';
import { PreloadScene } from './scenes/PreloadScene.ts';
import { MenuScene } from './scenes/MenuScene.ts';
import { MapScene } from './scenes/MapScene.ts';
import { ChapterScene } from './scenes/ChapterScene.ts';
import { CreditsScene } from './scenes/CreditsScene.ts';

// Phaser.Game конфиг — портретен 9:16, мащабиране FIT (центрирано).
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: COLORS.bgDark,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  render: {
    antialias: true,
    roundPixels: false,
  },
  scene: [
    BootScene,
    PreloadScene,
    MenuScene,
    MapScene,
    ChapterScene,
    CreditsScene,
  ],
};

new Phaser.Game(config);
