import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Иконите идват от два слоя и дизайнер ги сменя, без да пипа код.
 *
 * 1. `public/icons/<име>.svg` — едноцветната геометрия. Слепва се веднъж в `<symbol>`
 *    спрайт, ползва се с `<use href="#i-<име>">`: нула допълнителни заявки, оцветяване
 *    през `currentColor`. Правилото за файл: `viewBox="0 0 24 24"`, щрих `currentColor`,
 *    без твърди цветове. Този слой определя КОИ имена съществуват.
 * 2. `public/icons-neon/<име>.webp` — рисуваният неонов набор. Има ли файл тук, той бие
 *    SVG-то. Носи собствен градиент, значи НЕ се оцветява от контекста; в Piuma това
 *    минава, защото всяка повърхност е тъмна (чиповете са тинтове върху стъкло, не
 *    плътен цвят) — мерено, 35–53% от мастилото държи ≥3:1. Върху светла повърхност
 *    същата икона пада под 15% и не бива да се ползва.
 *
 * Слоят е ЦЯЛОСТЕН или никакъв: смесица от рисувани и контурни икони в един изглед
 * изглежда като счупени изображения, затова `assertNeonComplete` пази пълнотата.
 */
const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
/** Едноцветната геометрия — източникът на имената и резервата. */
const ICON_DIR = join(PUBLIC_DIR, 'icons');
/** Рисуваният неонов набор. Има ли файл тук, той бие едноцветната от спрайта. */
const NEON_DIR = join(PUBLIC_DIR, 'icons-neon');
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

let neonCache: Set<string> | null = null;

function neonIcons(): Set<string> {
  if (!neonCache) {
    neonCache = new Set(
      existsSync(NEON_DIR)
        ? readdirSync(NEON_DIR)
            .filter((file) => file.endsWith('.webp'))
            .map((file) => file.slice(0, -5))
        : [],
    );
  }
  return neonCache;
}

export function neonIconNames(): string[] {
  return [...neonIcons()].sort();
}

/**
 * Или всички имена имат рисувана икона, или нито едно. Половин набор дава изглед, в
 * който част от иконите светят, а част са бледи контури — това не е стил, а дефект.
 */
export function assertNeonComplete(): void {
  const neon = neonIcons();
  if (neon.size === 0) return;
  const missing = [...icons().keys()].filter((name) => !neon.has(name));
  if (missing.length > 0) {
    throw new IconError(
      `Неоновият набор е непълен — липсват ${missing.length}: ${missing.join(', ')}.`,
    );
  }
}

export function iconNames(): string[] {
  return [...icons().keys()];
}

export function hasIcon(name: string): boolean {
  return icons().has(name);
}

/**
 * Спрайтът — веднъж в тялото на страницата, скрит и невидим за екранни четци.
 * При пълен неонов набор нито един `<use>` не се рендира, затова спрайтът отпада:
 * иначе всяка страница носи няколко килобайта мъртва разметка.
 */
export function iconSprite(): string {
  if (neonIcons().size > 0 && [...icons().keys()].every((name) => neonIcons().has(name))) {
    return '';
  }
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
  if (neonIcons().has(name)) {
    // Растер, значи `alt` вместо `aria-label`: празно за декоративната икона.
    const alt = options.label ? options.label.replace(/[<>&"]/g, '') : '';
    return `<img class="${className}" src="/static/icons-neon/${name}.webp" alt="${alt}" decoding="async">`;
  }
  const a11y = options.label
    ? ` role="img" aria-label="${options.label.replace(/[<>&"]/g, '')}"`
    : ' aria-hidden="true" focusable="false"';
  return `<svg class="${className}"${a11y}><use href="#i-${name}"></use></svg>`;
}
