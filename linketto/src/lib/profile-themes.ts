// Темите на публичния профил — ЕДИНСТВЕНОТО място (валидация в action-а,
// избор в таблото, рендиране в ProfileScreen). Theme е String в схемата (без
// миграция): новa тема = ред тук. Непознато ID → безопасното подразбиране.
//
// Всяка тема е пълен набор токени. Профилът ги слага като CSS променливи на
// корена (themeVars) — затова няма второ копие в CSS и няма JS на клиента.
// „auto“ носи два комплекта и ги комбинира през light-dark() — следва
// prefers-color-scheme на посетителя (colorScheme: 'light dark').
//
// Контрастът (WCAG AA ≥ 4.5:1) се пази от тестовете в
// __tests__/profile-themes.test.ts за всяка тема, включително с най-лошите
// акцентни цветове (бяло/черно), с които създателят може да смеси повърхността.

import type { CSSProperties } from 'react';

export const PROFILE_THEMES = [
  'aurora',
  'mono',
  'dusk',
  'editorial',
  'midnight',
  'sand',
  'cobalt',
  'chrome',
  'acid',
  'auto',
] as const;

export type ProfileThemeId = (typeof PROFILE_THEMES)[number];

/** Подразбиране за непознато/старо ID (както досега: aurora). */
export const DEFAULT_PROFILE_THEME: ProfileThemeId = 'aurora';

export function isProfileTheme(value: string): value is ProfileThemeId {
  return (PROFILE_THEMES as readonly string[]).includes(value);
}

export function resolveProfileTheme(raw: string | null | undefined): ProfileThemeId {
  return raw && isProfileTheme(raw) ? raw : DEFAULT_PROFILE_THEME;
}

export type ThemeTokens = {
  /** Фон отгоре → отдолу (еднакви = плътен). */
  bg1: string;
  bg2: string;
  /** Меко петно светлина горе (rgba, по избор) — само за тъмни теми. */
  glow?: string;
  fg: string;
  /** Второстепенен текст (био, бележки) — AA върху фона и върху картата. */
  muted: string;
  /** Карта около съдържанието (на телефон картата няма рамка). */
  card: string;
  cardBorder: string;
  /** Бутон: фон, текст, рамка, hover фон. */
  surface: string;
  surfaceFg: string;
  surfaceBorder: string;
  surfaceHover: string;
  field: string;
  /** Текст за грешка. */
  danger: string;
};

export type ThemeDef = {
  id: ProfileThemeId;
  scheme: 'light' | 'dark' | 'auto';
  /** Името на създателя в serif display (само ако шрифтът е подразбиращият). */
  displayName?: 'serif';
  /** Конусен ореол в акцента зад картата (спокойните теми — без). */
  aura: boolean;
  /** Анимирана CSS сцена зад всичко (само градиенти и transform/opacity —
   *  без SVG). Текстът стои върху картата, не върху сцената. */
  scene?: 'chrome' | 'acid';
  /** Картата е с фон и на телефон (при сцените — гарантира контраста). */
  cardAlways?: boolean;
  /** Най-светлите/най-тъмните цветове на сцената — за теста на контраста. */
  sceneColors?: string[];
  /** Фон на мини превюто в таблото (CSS). */
  previewBg?: string;
  tokens: ThemeTokens;
  /** Само за „auto“: тъмният комплект (tokens е светлият). */
  dark?: ThemeTokens;
};

const GLASS_DARK = {
  card: '#ffffff1a',
  cardBorder: '#ffffff26',
  surface: '#ffffff14',
  surfaceFg: '#ffffff',
  surfaceBorder: '#ffffff38',
  surfaceHover: '#ffffff26',
  field: '#ffffff12',
  danger: '#fca5a5',
} as const;

const MIDNIGHT: ThemeTokens = {
  bg1: '#0d0f14',
  bg2: '#0d0f14',
  glow: 'rgba(120,140,200,0.10)',
  fg: '#f2f3f5',
  muted: '#a3aab6',
  card: '#14171e',
  cardBorder: '#ffffff17',
  surface: '#1b1f28',
  surfaceFg: '#f2f3f5',
  surfaceBorder: '#ffffff24',
  surfaceHover: '#232834',
  field: '#10131a',
  danger: '#fca5a5',
};

export const THEME_DEFS: Record<ProfileThemeId, ThemeDef> = {
  // Старите три — същият характер, но с токени (по-четливи, по-ясни).
  aurora: {
    id: 'aurora',
    aura: true,
    scheme: 'dark',
    tokens: {
      bg1: '#1e1b4b',
      bg2: '#020617',
      glow: 'rgba(129,140,248,0.22)',
      fg: '#ffffff',
      muted: '#c9cdee',
      ...GLASS_DARK,
    },
  },
  mono: {
    id: 'mono',
    aura: false,
    scheme: 'light',
    tokens: {
      bg1: '#ffffff',
      bg2: '#eef1f6',
      fg: '#0f172a',
      muted: '#475569',
      card: '#ffffffcc',
      cardBorder: '#0f172a1a',
      surface: '#ffffff',
      surfaceFg: '#0f172a',
      surfaceBorder: '#0f172a26',
      surfaceHover: '#f1f4f9',
      field: '#f4f6fa',
      danger: '#b91c1c',
    },
  },
  dusk: {
    id: 'dusk',
    aura: true,
    scheme: 'dark',
    tokens: {
      bg1: '#4c0519',
      bg2: '#020617',
      glow: 'rgba(251,113,133,0.20)',
      fg: '#ffffff',
      muted: '#f1ccd3',
      ...GLASS_DARK,
    },
  },
  // Редакционна: без карта, серифно име, хайрлайн бутони върху чист лист.
  editorial: {
    id: 'editorial',
    aura: false,
    scheme: 'light',
    displayName: 'serif',
    tokens: {
      bg1: '#f7f7f4',
      bg2: '#f7f7f4',
      fg: '#111111',
      muted: '#55554f',
      card: '#00000000',
      cardBorder: '#00000000',
      surface: '#ffffff',
      surfaceFg: '#111111',
      surfaceBorder: '#1111112e',
      surfaceHover: '#f0f0ec',
      field: '#ffffff',
      danger: '#b91c1c',
    },
  },
  // Графит: непрозрачна карта, спокойни повърхности, акцентът свети сам.
  midnight: {
    id: 'midnight',
    aura: true,
    scheme: 'dark',
    tokens: MIDNIGHT,
  },
  // Пясък: топъл камък, без карта; подчертава снимки и ръчна работа.
  sand: {
    id: 'sand',
    aura: false,
    scheme: 'light',
    tokens: {
      bg1: '#e6dfd0',
      bg2: '#d9d0bc',
      fg: '#26241d',
      muted: '#554f40',
      card: '#f6f1e5b3',
      cardBorder: '#26241d1f',
      surface: '#f8f4ea',
      surfaceFg: '#26241d',
      surfaceBorder: '#26241d2e',
      surfaceHover: '#efe9da',
      field: '#f8f4ea',
      danger: '#9f1239',
    },
  },
  // Кобалт: наситен син фон, бели бутони — ярка, но с ясна йерархия.
  cobalt: {
    id: 'cobalt',
    aura: false,
    scheme: 'dark',
    tokens: {
      bg1: '#2b3dff',
      bg2: '#1a24b0',
      fg: '#ffffff',
      muted: '#e0e4ff',
      card: '#00000000',
      cardBorder: '#00000000',
      surface: '#ffffff',
      surfaceFg: '#10165a',
      surfaceBorder: '#ffffff',
      surfaceHover: '#eceeff',
      field: '#ffffff1f',
      danger: '#ffd1d1',
    },
  },
  // Хром: течен холографски метал — пастелни ивици се въртят зад матова карта.
  chrome: {
    id: 'chrome',
    scheme: 'light',
    aura: true,
    scene: 'chrome',
    cardAlways: true,
    sceneColors: ['#ff9bd8', '#8fe3ff', '#b49bff', '#ffe58a', '#8cffc8', '#7f95ff'],
    previewBg:
      'conic-gradient(from 30deg, #ff9bd8, #8fe3ff, #b49bff, #ffe58a, #8cffc8, #ff9bd8)',
    tokens: {
      bg1: '#e4d6ff',
      bg2: '#cfe9ff',
      fg: '#0b0b14',
      muted: '#363648',
      card: '#ffffffb8',
      cardBorder: '#ffffffaa',
      surface: '#ffffffee',
      surfaceFg: '#0b0b14',
      surfaceBorder: '#0b0b1a33',
      surfaceHover: '#ffffff',
      field: '#ffffffcc',
      danger: '#b91c1c',
    },
  },
  // Киселина: неонов розов, лимон и кобалт се носят върху черно.
  acid: {
    id: 'acid',
    scheme: 'dark',
    aura: true,
    scene: 'acid',
    cardAlways: true,
    sceneColors: ['#ff2e9a', '#d6ff2e', '#2433ff', '#7b2cff'],
    previewBg:
      'radial-gradient(circle at 18% 22%, #ff2e9a, transparent 55%), radial-gradient(circle at 82% 78%, #d6ff2e, transparent 52%), #2433ff',
    tokens: {
      bg1: '#12001f',
      bg2: '#050514',
      fg: '#ffffff',
      muted: '#d4d6f5',
      card: '#0a0a14e8',
      cardBorder: '#ffffff33',
      surface: '#181829',
      surfaceFg: '#ffffff',
      surfaceBorder: '#ffffff40',
      surfaceHover: '#242439',
      field: '#0f0f1c',
      danger: '#ff9db0',
    },
  },
  // Авто: светъл лист с бяла карта през деня, графит нощем (системната тема).
  auto: {
    id: 'auto',
    aura: true,
    scheme: 'auto',
    tokens: {
      bg1: '#eceef2',
      bg2: '#f6f7f9',
      fg: '#111827',
      muted: '#4b5565',
      card: '#ffffff',
      cardBorder: '#11182717',
      surface: '#f4f5f8',
      surfaceFg: '#111827',
      surfaceBorder: '#11182724',
      surfaceHover: '#e9ecf2',
      field: '#f4f5f8',
      danger: '#b91c1c',
    },
    dark: MIDNIGHT,
  },
};

const COLOR_KEYS = [
  'fg',
  'muted',
  'card',
  'cardBorder',
  'surface',
  'surfaceFg',
  'surfaceBorder',
  'surfaceHover',
  'field',
  'danger',
] as const satisfies readonly (keyof ThemeTokens)[];

const VAR_NAMES: Record<(typeof COLOR_KEYS)[number], string> = {
  fg: '--pf-fg',
  muted: '--pf-muted',
  card: '--pf-card',
  cardBorder: '--pf-card-bd',
  surface: '--pf-surface',
  surfaceFg: '--pf-surface-fg',
  surfaceBorder: '--pf-surface-bd',
  surfaceHover: '--pf-hover',
  field: '--pf-field',
  danger: '--pf-danger',
};

function pick(
  def: ThemeDef,
  key: keyof ThemeTokens,
  force?: 'light' | 'dark',
): string | undefined {
  const light = def.tokens[key];
  if (force === 'dark' && def.dark) return def.dark[key];
  if (force === 'light' || !def.dark) return light;
  const dark = def.dark[key];
  if (light === undefined && dark === undefined) return undefined;
  return `light-dark(${light ?? 'transparent'}, ${dark ?? 'transparent'})`;
}

/** CSS променливите на темата + фонът и colorScheme — слагат се на корена. */
export function themeVars(
  id: ProfileThemeId,
  force?: 'light' | 'dark',
): CSSProperties {
  const def = THEME_DEFS[id];
  const vars: Record<string, string> = {};
  for (const key of COLOR_KEYS) vars[VAR_NAMES[key]] = pick(def, key, force) as string;
  const bg1 = pick(def, 'bg1', force) as string;
  const bg2 = pick(def, 'bg2', force) as string;
  const glow = pick(def, 'glow', force);
  const base = `linear-gradient(to bottom, ${bg1}, ${bg2})`;
  const backgroundImage = glow
    ? `radial-gradient(70rem 36rem at 50% -8%, ${glow}, transparent 62%), ${base}`
    : base;
  // Прозрачна карта (editorial, cobalt) → без сянка на празното.
  if (def.tokens.card.toLowerCase().endsWith('00')) vars['--pf-card-sh'] = 'none';
  return {
    ...vars,
    backgroundColor: bg2,
    backgroundImage,
    colorScheme:
      def.scheme === 'auto' ? (force ?? 'light dark') : def.scheme,
    color: 'var(--pf-fg)',
  } as CSSProperties;
}

/** Променливи за профил със собствен фон (solid/gradient/image) — същото
 *  именуване, получено от избрания/изчисления цвят на текста. */
export function customVars(opts: {
  fg: string;
  light: boolean;
  accent: string;
}): CSSProperties {
  const { fg, light, accent } = opts;
  return {
    '--pf-fg': fg,
    '--pf-muted': `color-mix(in srgb, ${fg} 76%, transparent)`,
    '--pf-card': light ? '#ffffffb3' : '#ffffff1a',
    '--pf-card-bd': light ? '#0000001a' : '#ffffff26',
    '--pf-surface': `color-mix(in srgb, ${accent} 13%, transparent)`,
    '--pf-surface-fg': fg,
    '--pf-surface-bd': accent,
    '--pf-hover': `color-mix(in srgb, ${accent} 22%, transparent)`,
    '--pf-field': `color-mix(in srgb, ${fg} 7%, transparent)`,
    '--pf-danger': light ? '#b91c1c' : '#fca5a5',
    colorScheme: light ? 'light' : 'dark',
  } as CSSProperties;
}

/** Валиден hex6 акцент, иначе подразбиращият се. */
export function safeAccent(value: string | null | undefined): string {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#3b82c4';
}

/** Променливи на един бутон/панел (--b-*) според fill режима и акцента.
 *  `themed` = профилът ползва тема (а не собствен фон). */
export function buttonVars(
  fill: 'soft' | 'solid' | 'outline',
  accent: string,
  themed: boolean,
  solidInk: string,
): CSSProperties {
  switch (fill) {
    case 'solid':
      return {
        '--b-bg': accent,
        '--b-fg': solidInk,
        '--b-bd': accent,
        '--b-hbg': accent,
        '--b-hbd': accent,
      } as CSSProperties;
    case 'outline':
      return {
        '--b-bg': 'transparent',
        '--b-fg': 'var(--pf-fg)',
        '--b-bd': accent,
        '--b-hbg': `color-mix(in srgb, ${accent} 12%, transparent)`,
        '--b-hbd': accent,
      } as CSSProperties;
    default:
      return themed
        ? ({
            '--b-bg': `color-mix(in srgb, ${accent} 4%, var(--pf-surface))`,
            '--b-fg': 'var(--pf-surface-fg)',
            '--b-bd': `color-mix(in srgb, ${accent} 30%, var(--pf-surface-bd))`,
            '--b-hbg': `color-mix(in srgb, ${accent} 9%, var(--pf-hover))`,
            '--b-hbd': accent,
          } as CSSProperties)
        : ({
            '--b-bg': 'var(--pf-surface)',
            '--b-fg': 'var(--pf-surface-fg)',
            '--b-bd': accent,
            '--b-hbg': 'var(--pf-hover)',
            '--b-hbd': accent,
          } as CSSProperties);
  }
}
