/**
 * Визуална идентичност на „Помагам Бобов дол".
 * Топла, гражданска палитра с висок контраст и едри размери — пригодена
 * за по-възрастна и селска аудитория. Не е генеричен шаблон.
 */

export const colors = {
  background: '#FBF7EF',
  surface: '#FFFFFF',
  surfaceMuted: '#F1EADc',
  border: '#E2D9C6',

  text: '#1F2421',
  textMuted: '#5B6159',
  textInverse: '#FFFFFF',

  primary: '#15795C',
  primaryDark: '#0F5C45',
  primarySoft: '#E2F0EA',

  accent: '#C77B26',
  accentSoft: '#F7E9D5',

  danger: '#B23A3A',
  dangerSoft: '#F6E2E2',

  success: '#2E7D5B',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const fontSize = {
  small: 16,
  body: 19,
  lead: 22,
  title: 28,
  display: 34,
} as const;

export const shadow = {
  card: {
    shadowColor: '#1F2421',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
} as const;

/** Минимална височина за докосваеми зони — достъпност за едри пръсти. */
export const minTouch = 56;
