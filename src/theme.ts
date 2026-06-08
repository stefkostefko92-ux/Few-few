// Централна тема/палитра за играта „Опълченците · 1877“.
// Цветовете са в исторически дух: военен зелен, тъмно дърво, златисто и
// червено-бяло-зелено за Самарското знаме.

export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 1280;

export const COLORS = {
  // Фонове
  bgDark: 0x0d0a07,
  bgPanel: 0x1a1410,
  bgPanelLight: 0x2a2018,

  // Акценти
  gold: 0xc9a227,
  goldLight: 0xe8c84a,
  parchment: 0xe6d3a3,

  // Текст
  text: 0xf2e9d8,
  textMuted: 0x9c8d72,
  textDark: 0x2a2018,

  // Знаме на опълчението / триколор
  flagRed: 0xb01c2e,
  flagWhite: 0xf4f1e8,
  flagGreen: 0x1f6b3a,

  // Състояния
  locked: 0x4a4038,
  success: 0x3f8f4f,
  danger: 0xa33126,
  enemy: 0x6b3f2a,
} as const;

// Шестнадесетични низове за CSS/HTML текст в Phaser.
export const HEX = {
  bgDark: '#0d0a07',
  bgPanel: '#1a1410',
  gold: '#c9a227',
  goldLight: '#e8c84a',
  parchment: '#e6d3a3',
  text: '#f2e9d8',
  textMuted: '#9c8d72',
  textDark: '#2a2018',
  flagRed: '#b01c2e',
  flagGreen: '#1f6b3a',
  success: '#3f8f4f',
  danger: '#a33126',
} as const;

// Основен шрифт. Вграждаме свободен шрифт с пълна кирилица в Фаза 5;
// дотогава ползваме безопасен системен стек с кирилично покритие.
export const FONT = {
  body: 'Georgia, "DejaVu Serif", "Times New Roman", serif',
  display: 'Georgia, "DejaVu Serif", "Times New Roman", serif',
} as const;

export const SCENES = {
  Boot: 'BootScene',
  Preload: 'PreloadScene',
  Menu: 'MenuScene',
  Map: 'MapScene',
  Chapter: 'ChapterScene',
  Credits: 'CreditsScene',
} as const;
