import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Иконите се ВГРАЖДАТ, не се зареждат през `<img>`. Причината е една:
 * `currentColor` работи само когато SVG-то е част от документа — през `<img>`
 * иконата остава с цвета, зашит във файла, и не реагира на hover, на фокус,
 * нито на светла тема. Цената е няколкостотин байта на икона в HTML-а;
 * ползата е, че цветът се управлява от CSS, както иска и спецификацията в
 * `docs/ICONS.md`.
 *
 * Файловете са НАШИ (в `public/icons/`), не потребителски вход — затова
 * вграждането им е безопасно. Името все пак минава през allowlist регекс:
 * компонентът никога не бива да може да прочете произволен файл, дори ако
 * утре някой му подаде стойност отвън.
 */

const ICON_ROOT = path.join(process.cwd(), 'public', 'icons');
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Четенето от диска е веднъж на икона за целия живот на процеса. */
const cache = new Map<string, string | null>();

export type IconGroup = 'status' | 'framework' | 'tag' | 'ui' | 'brand';

function load(group: IconGroup, name: string): string | null {
  const key = `${group}/${name}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let markup: string | null = null;
  if (NAME.test(name)) {
    try {
      const raw = readFileSync(path.join(ICON_ROOT, group, `${name}.svg`), 'utf8');
      // Само вътрешността: обвивката се пише тук, за да носи размера и
      // достъпните атрибути еднакво за всички икони.
      markup = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    } catch {
      // Липсваща икона не е причина страницата да падне — виж `docs/ICONS.md`
      // за пълния списък имена.
      console.error(`[icon] липсва ${key}.svg`);
      markup = null;
    }
  }

  cache.set(key, markup);
  return markup;
}

type Props = {
  group: IconGroup;
  name: string;
  size?: number;
  /** Достъпно име. `null` (по подразбиране) значи чиста декорация. */
  title?: string | null;
  className?: string;
};

export function Icon({ group, name, size = 16, title = null, className }: Props) {
  const markup = load(group, name);
  if (!markup) return null;

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title ?? undefined}
      className={className}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
