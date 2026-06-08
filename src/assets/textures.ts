import Phaser from 'phaser';
import { COLORS } from '../theme.ts';

// Генерира опростени, оригинални векторни текстури по време на изпълнение.
// Това НЕ са placeholder активи — те са целенасочената стилистика на v1
// (силуетна графика). Истински илюстрации/спрайтове се добавят във Фаза 5
// без промяна на имената на текстурите.

function makeTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

/** Опълченец — силует с шапка и пушка. */
function drawVolunteer(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x3a4a2e, 1); // тъмнозелена униформа
  g.fillRect(14, 26, 20, 30); // тяло
  g.fillStyle(0xd9c2a3, 1); // лице
  g.fillCircle(24, 18, 11);
  g.fillStyle(0x2a3320, 1); // калпак
  g.fillRect(13, 6, 22, 9);
  g.fillRoundedRect(11, 12, 26, 5, 2);
  g.fillStyle(0x6b5a3a, 1); // пушка
  g.fillRect(34, 22, 26, 4);
  g.fillStyle(0x2a3320, 1);
  g.fillRect(18, 54, 7, 18); // крак
  g.fillRect(27, 54, 7, 18); // крак
}

/** Вражески войник — силует в червеникаво-кафяво. */
function drawEnemy(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x6b3f2a, 1);
  g.fillRect(14, 26, 20, 30);
  g.fillStyle(0xc9a98a, 1);
  g.fillCircle(24, 18, 11);
  g.fillStyle(0x8a1c1c, 1); // фес
  g.fillRoundedRect(15, 4, 18, 12, 3);
  g.fillStyle(0x5a3320, 1);
  g.fillRect(-12, 22, 26, 4); // пушка наляво
  g.fillStyle(0x4a2e1c, 1);
  g.fillRect(18, 54, 7, 18);
  g.fillRect(27, 54, 7, 18);
}

/** Самарско знаме — триколор на пилон. */
function drawFlag(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x6b5a3a, 1); // пилон
  g.fillRect(6, 0, 6, 120);
  g.fillStyle(COLORS.flagRed, 1);
  g.fillRect(12, 6, 84, 24);
  g.fillStyle(COLORS.flagWhite, 1);
  g.fillRect(12, 30, 84, 24);
  g.fillStyle(COLORS.flagGreen, 1);
  g.fillRect(12, 54, 84, 24);
  g.fillStyle(COLORS.gold, 1); // връх
  g.fillTriangle(2, 0, 16, 0, 9, -12);
}

/** Лодка — проста гондола. */
function drawBoat(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x5a4327, 1);
  g.beginPath();
  g.moveTo(4, 14);
  g.lineTo(76, 14);
  g.lineTo(66, 34);
  g.lineTo(14, 34);
  g.closePath();
  g.fillPath();
  g.fillStyle(0x3a4a2e, 1); // фигура в лодката
  g.fillCircle(40, 10, 7);
}

/** Камък. */
function drawStone(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x7a7065, 1);
  g.fillCircle(14, 14, 13);
  g.fillStyle(0x968b7d, 1);
  g.fillCircle(10, 10, 5);
}

/** Куршум/искра. */
function drawSpark(g: Phaser.GameObjects.Graphics, color: number): void {
  g.fillStyle(color, 1);
  g.fillCircle(6, 6, 6);
}

export function generateTextures(scene: Phaser.Scene): void {
  makeTexture(scene, 'volunteer', 52, 74, drawVolunteer);
  makeTexture(scene, 'enemy', 52, 74, drawEnemy);
  makeTexture(scene, 'flag', 100, 132, drawFlag);
  makeTexture(scene, 'boat', 80, 38, drawBoat);
  makeTexture(scene, 'stone', 28, 28, drawStone);
  makeTexture(scene, 'spark_gold', 12, 12, (g) => drawSpark(g, COLORS.goldLight));
  makeTexture(scene, 'spark_red', 12, 12, (g) => drawSpark(g, COLORS.danger));
}
