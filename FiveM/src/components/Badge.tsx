import { existsSync } from 'node:fs';
import path from 'node:path';

import Image from 'next/image';

/**
 * Обемните икони (`public/icons/badges/`) са РАСТЕРНИ, цветни и със сенки —
 * рисувани за 40–64 px. Изходните файлове са 256 px, затова свиване до 24 px е
 * още чисто — под това стават каша, и точно затова има долен праг.
 *
 * Разделението не е вкус: растерът не наследява `currentColor`, значи не
 * реагира на hover и не се пребоядисва по бранда — там, където иконата трябва
 * да следва текста, се ползва `Icon`, не този компонент.
 */
const MIN_SIZE = 24;

const BADGE_ROOT = path.join(process.cwd(), 'public', 'icons', 'badges');
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Проверката е веднъж на име за целия живот на процеса. */
const known = new Map<string, boolean>();

/**
 * Липсваща значка НЕ се рендира. Без тази проверка `<Image>` сочи към файл,
 * който го няма, и браузърът показва счупена картинка — а част от значките
 * още се рисуват (виж списъка в `docs/ICONS.md`). Същото поведение като
 * `Icon`, който отдавна пада меко при липсващ SVG.
 */
function exists(name: string): boolean {
  const cached = known.get(name);
  if (cached !== undefined) return cached;
  const ok = NAME.test(name) && existsSync(path.join(BADGE_ROOT, `${name}.png`));
  if (!ok) console.error(`[badge] липсва ${name}.png`);
  known.set(name, ok);
  return ok;
}

type Props = {
  name: string;
  size?: number;
  /** Достъпно име. `null` (по подразбиране) значи чиста декорация. */
  title?: string | null;
  className?: string;
};

export function Badge({ name, size = 40, title = null, className }: Props) {
  if (!exists(name)) return null;
  const side = Math.max(size, MIN_SIZE);
  return (
    <Image
      src={`/icons/badges/${name}.png`}
      alt={title ?? ''}
      aria-hidden={title ? undefined : true}
      width={side}
      height={side}
      className={className}
      unoptimized
    />
  );
}
