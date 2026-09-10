import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Иконите живеят като отделни файлове в `public/icons/<име>.svg` — дизайнер ги сменя,
 * без да пипа код. При старт ги слепваме веднъж в един `<symbol>` спрайт, който шаблоните
 * инжектират в тялото; после всяко ползване е `<use href="#i-<име>">` (нула допълнителни заявки,
 * оцветяване през `currentColor`).
 *
 * Правилото за файл: `viewBox="0 0 24 24"`, щрих `currentColor`, без твърди цветове.
 */
const ICON_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const NAME_RE = /^[a-z][a-z0-9-]{1,40}$/;
const SVG_BODY_RE = /<svg\b[^>]*>([\s\S]*?)<\/svg>/i;

export class IconError extends Error {}

function readIcons(): Map<string, string> {
  const icons = new Map<string, string>();
  const files = readdirSync(ICON_DIR)
    .filter((file) => file.endsWith('.svg'))
    .sort();
  for (const file of files) {
    const name = file.slice(0, -4);
    if (!NAME_RE.test(name)) {
      throw new IconError(`Име на икона „${name}“ не е kebab-case (a-z, 0-9, тире).`);
    }
    const body = SVG_BODY_RE.exec(readFileSync(join(ICON_DIR, file), 'utf8'))?.[1]?.trim();
    if (!body) throw new IconError(`Иконата „${name}“ не съдържа валиден <svg> елемент.`);
    icons.set(name, body);
  }
  return icons;
}

let cache: Map<string, string> | null = null;

function icons(): Map<string, string> {
  cache ??= readIcons();
  return cache;
}

export function iconNames(): string[] {
  return [...icons().keys()];
}

export function hasIcon(name: string): boolean {
  return icons().has(name);
}

/** Спрайтът — веднъж в тялото на страницата, скрит и невидим за екранни четци. */
export function iconSprite(): string {
  const symbols = [...icons().entries()]
    .map(
      ([name, body]) =>
        `<symbol id="i-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${body}</symbol>`,
    )
    .join('');
  return `<svg class="sprite" aria-hidden="true" focusable="false" width="0" height="0">${symbols}</svg>`;
}

export interface IconOptions {
  /** Клас върху `<svg>` — размерът идва от CSS (`ic`, `ic-lg`, …). */
  class?: string;
  /** Смислово име за екранен четец; без него иконата е декоративна. */
  label?: string;
}

/**
 * Липсваща икона НЕ чупи страницата — рисува нищо и оставя следа в разметката,
 * за да се хване при преглед (тестът `icons.test.ts` гейтва набора).
 */
export function renderIcon(name: string, options: IconOptions = {}): string {
  if (!NAME_RE.test(name) || !icons().has(name))
    return `<!-- липсва икона: ${name.slice(0, 40)} -->`;
  const className = ['ic', options.class].filter(Boolean).join(' ');
  const a11y = options.label
    ? ` role="img" aria-label="${options.label.replace(/[<>&"]/g, '')}"`
    : ' aria-hidden="true" focusable="false"';
  return `<svg class="${className}"${a11y}><use href="#i-${name}"></use></svg>`;
}
