import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * Темата „Personalizzato“ (собственикът, 30 октомври 2026: „l'utente possa modificare i colori della
 * pagina, del menu, del testo“): всеки човек избира шест цвята — фон, текст, лента на менюто и текстът
 * ѝ, акцент (главните бутони, избраното) и линии. Останалите цветове на портала се извеждат от тях така,
 * че да се четат (WCAG 2.1 AA: текст 4,5:1, рамки и бутони 3:1). Нечетима двойка не се записва.
 * Пазят се в `User.colori`; записаното се чете с недоверие — грешно поле значи „няма свои цветове“.
 */

export const CAMPI_COLORE = ['sfondo', 'testo', 'menu', 'menuTesto', 'accento', 'linee'] as const;
export type CampoColore = (typeof CAMPI_COLORE)[number];
export type Colori = Record<CampoColore, string>;

/** Началото на формата — светлата тема на портала. */
export const COLORI_PREDEFINITI: Colori = {
  sfondo: '#ffffff',
  testo: '#000000',
  menu: '#000000',
  menuTesto: '#ffffff',
  accento: '#000000',
  linee: '#d6d6d6',
};

const hex = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^#[0-9a-f]{6}$/, 'colore');

const schema = z.object(Object.fromEntries(CAMPI_COLORE.map((k) => [k, hex]))).strict();

type Rgb = [number, number, number];

const rgb = (value: string): Rgb =>
  [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as Rgb;
const toHex = ([r, g, b]: Rgb): string =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** Относителната яркост по WCAG 2.1. */
export function luminanza(value: string): number {
  const [r, g, b] = rgb(value).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Контрастът по WCAG 2.1 (1–21). */
export function contrasto(a: string, b: string): number {
  const [hi, lo] = [luminanza(a), luminanza(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** `a` към `b` с дял `t` от `b` (0 — само `a`). */
function mix(a: string, b: string, t: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  return toHex([0, 1, 2].map((i) => x[i]! * (1 - t) + y[i]! * t) as Rgb);
}

/** Най-бледият смес на `fg` към `bg`, който още стига `min` спрямо `bg`. */
function sbiadito(fg: string, bg: string, from: number, min: number): string {
  for (let t = from; t > 0; t -= 0.02) {
    const c = mix(fg, bg, t);
    if (contrasto(c, bg) >= min) return c;
  }
  return fg;
}

/** Черно или бяло — което се чете по-добре върху `bg`. */
const sopra = (bg: string): string =>
  contrasto('#000000', bg) >= contrasto('#ffffff', bg) ? '#000000' : '#ffffff';

/** Светла или тъмна основа (формите на браузъра, червеното за грешки). */
export const schemaDi = (colori: Colori): 'light' | 'dark' =>
  sopra(colori.sfondo) === '#000000' ? 'light' : 'dark';

export type ErroriColori = Partial<Record<CampoColore, 'colore' | 'contrasto'>>;

/** Формата: шест цвята #rrggbb и двойките, които трябва да се четат. */
export function parseColori(
  body: Record<string, unknown>,
): { ok: true; data: Colori } | { ok: false; errors: ErroriColori } {
  const parsed = schema.safeParse(Object.fromEntries(CAMPI_COLORE.map((k) => [k, body[k]])));
  if (!parsed.success) {
    const errors: ErroriColori = {};
    for (const issue of parsed.error.issues) errors[issue.path[0] as CampoColore] = 'colore';
    return { ok: false, errors };
  }
  const c = parsed.data as Colori;
  const errors: ErroriColori = {};
  if (contrasto(c.testo, c.sfondo) < 4.5) errors.testo = 'contrasto';
  if (contrasto(c.menuTesto, c.menu) < 4.5) errors.menuTesto = 'contrasto';
  if (contrasto(c.accento, c.sfondo) < 3) errors.accento = 'contrasto';
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data: c };
}

/** Записаното в базата — само ако е цялото и четимо; иначе null (темата пада на автоматичната). */
export function coloriSalvati(value: unknown): Colori | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const parsed = parseColori(value as Record<string, unknown>);
  return parsed.ok ? parsed.data : null;
}

/** Версията на стила — адресът се сменя с цветовете, кешът на браузъра — не. */
export const versioneColori = (colori: Colori): string =>
  createHash('sha256').update(JSON.stringify(colori)).digest('hex').slice(0, 12);

/** Стилът на темата: токените на base.css, изведени от шестте цвята. */
export function cssColori(c: Colori): string {
  const scuro = schemaDi(c) === 'dark';
  const danger = scuro ? '#ff8b80' : '#b3261e';
  const accentoTesto = sopra(c.accento);
  const tokens: Record<string, string> = {
    '--bg': c.sfondo,
    '--fg': c.testo,
    '--muted': sbiadito(c.testo, c.sfondo, 0.45, 4.5),
    '--line': c.linee,
    '--line-strong': c.testo,
    '--wash': mix(c.sfondo, c.testo, 0.05),
    '--field': c.sfondo,
    '--field-line': sbiadito(c.testo, c.sfondo, 0.6, 3),
    '--hover': mix(c.sfondo, c.testo, 0.07),
    '--mark-bg': c.accento,
    '--mark-fg': accentoTesto,
    '--primary-bg': c.accento,
    '--primary-fg': accentoTesto,
    '--danger': contrasto(danger, c.sfondo) >= 4.5 ? danger : c.testo,
    '--danger-fg': sopra(contrasto(danger, c.sfondo) >= 4.5 ? danger : c.testo),
    '--bar': c.menu,
    '--bar-fg': c.menuTesto,
    '--bar-muted': sbiadito(c.menuTesto, c.menu, 0.4, 4.5),
    '--bar-line': mix(c.menu, c.menuTesto, 0.2),
    '--bar-edge': c.linee,
    '--bar-hover': mix(c.menu, c.menuTesto, 0.06),
    '--bar-current': mix(c.menu, c.menuTesto, 0.12),
  };
  const body = Object.entries(tokens)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  return `/* Темата „Personalizzato“ на човека (src/http/colori.ts). */\nhtml:root.tema-personale {\n${body}\n  color-scheme: ${scuro ? 'dark' : 'light'};\n}\n`;
}
