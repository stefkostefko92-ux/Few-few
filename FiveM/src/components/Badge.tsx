import { existsSync } from 'node:fs';
import path from 'node:path';

import Image from 'next/image';

import { Icon, type IconGroup } from '@/components/Icon';

/**
 * Обемните икони (`public/icons/badges/`) са РАСТЕРНИ, цветни и със сенки.
 * Файловете са 128×128 с рисунка, вписана в 112 px и центрирана (широките
 * лога — в цялата ширина); прави ги `npm run brand:badges` (виж
 * `scripts/rebuild-badges.mjs`). При 24 px свиването е още чисто — под това
 * стават каша, и точно затова има долен праг.
 *
 * Разделението не е вкус: растерът не наследява `currentColor`, значи не
 * реагира на hover и не се пребоядисва по бранда — там, където иконата трябва
 * да следва текста, се ползва `Icon`, не този компонент.
 */
const MIN_SIZE = 24;

const ICON_ROOT = path.join(process.cwd(), 'public', 'icons');
const BADGE_ROOT = path.join(ICON_ROOT, 'badges');
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Проверките са веднъж на име за целия живот на процеса. */
const rasterCache = new Map<string, boolean>();
const vectorCache = new Map<string, IconGroup | null>();
const reported = new Set<string>();

function hasRaster(name: string): boolean {
  const cached = rasterCache.get(name);
  if (cached !== undefined) return cached;
  const ok = NAME.test(name) && existsSync(path.join(BADGE_ROOT, `${name}.png`));
  rasterCache.set(name, ok);
  return ok;
}

/**
 * Групите на векторните икони, в реда, по който се търси съответствие.
 * Редът има значение само при съвпадащи имена в две групи; днес няма такива.
 */
const VECTOR_GROUPS: IconGroup[] = ['status', 'framework', 'tag', 'ui', 'brand'];

function vectorGroup(name: string): IconGroup | null {
  const cached = vectorCache.get(name);
  if (cached !== undefined) return cached;
  const group = NAME.test(name)
    ? (VECTOR_GROUPS.find((candidate) => existsSync(path.join(ICON_ROOT, candidate, `${name}.svg`))) ?? null)
    : null;
  vectorCache.set(name, group);
  return group;
}

type Props = {
  name: string;
  size?: number;
  /** Достъпно име. `null` (по подразбиране) значи чиста декорация. */
  title?: string | null;
  className?: string;
};

/**
 * Растерът Е дизайнът — цветните 3D значки носят бранда. Векторът е РЕЗЕРВА
 * само за имената, за които верен растер няма (`news`, `kick`, `discovered`,
 * `menu` днес). Разликата между „има“ и „верен“ я решава
 * `scripts/rebuild-badges.mjs`, не този компонент: изрязаните накриво файлове
 * от пакета вече ги няма в папката, затова тук не трябва черен списък.
 * Липсват ли и двете, значката просто не се рисува — счупена картинка е по-лошо.
 */
export function Badge({ name, size = 40, title = null, className }: Props) {
  if (hasRaster(name)) {
    const side = Math.max(size, MIN_SIZE);
    return (
      <Image
        src={`/icons/badges/${name}.png`}
        alt={title ?? ''}
        aria-hidden={title ? undefined : true}
        width={side}
        height={side}
        // `shrink-0`: значката е flex елемент до текст, и до дълго заглавие
        // браузърът я смачкваше до 18–22 px вместо 40 (измерено на 390 px).
        className={`shrink-0${className ? ` ${className}` : ''}`}
        unoptimized
      />
    );
  }

  const vector = vectorGroup(name);
  if (vector) return <Icon group={vector} name={name} size={size} title={title} className={className} />;

  if (!reported.has(name)) {
    reported.add(name);
    console.error(`[badge] няма нито растер, нито вектор: ${name}`);
  }
  return null;
}
