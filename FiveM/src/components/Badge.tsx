import { existsSync } from 'node:fs';
import path from 'node:path';

import Image from 'next/image';

import { Icon, type IconGroup } from '@/components/Icon';

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

/**
 * Групите на векторните икони, в реда, по който се търси съответствие.
 * Редът има значение само при съвпадащи имена в две групи; днес няма такива.
 */
const VECTOR_GROUPS: IconGroup[] = ['status', 'framework', 'tag', 'ui', 'brand'];

/**
 * Растерните значки, изрязани от общия лист с ГРЕШНО отместване — само те
 * падат към вектор.
 *
 * Списъкът е curated, не изчислен, и това е нарочно: „съдържа парче от
 * съседната икона“ не се мери с код. Всяко име тук е гледано на контактен лист
 * (`scripts/fix-badges.py` + рендер на 71-те) и носи или ЧУЖД текстов етикет
 * („UPLOAD“ в `profile`, „FFLINE HIDD“ в `promoted`, „UNREACHAI“ в
 * `discovered`), или направо чужд предмет (`tuning` показва куфарчето на
 * `jobs`, `court` — гумата на `drift`).
 *
 * ВНИМАНИЕ при добавяне: това е ЧЕРЕН списък, не бял. Първата версия правеше
 * обратното — предпочиташе вектор за ВСИЧКО, за което има SVG — и заради
 * трийсетина счупени изхвърли и всички изрядни: брандираните 3D значки на
 * рамките и статусите се смениха с плоски линейни глифове. Наличието на вектор
 * НЕ е причина да не се ползва растерът.
 */
const MISCUT = new Set([
  '18plus',
  '18plus-badge',
  'arrow-down',
  'arrow-left',
  'arrow-right',
  'calendar',
  'close',
  'court',
  'crafting',
  'discovered',
  'download',
  'drift',
  'economy',
  'heavy-rp',
  'housing',
  'jobs',
  'light-rp',
  'menu',
  'notification',
  'offline-badge',
  'profile',
  'promoted',
  'racing',
  'settings',
  'slots',
  'success',
  'transport',
  'tuning',
  'upload',
  'verified-badge',
  'vip',
  'warning',
]);

/**
 * Има ли ЧИСТ вектор със същото име — и ако да, в коя група.
 *
 * ЗАЩО ВЕКТОРЪТ ПОБЕЖДАВА. Растерният пакет е изрязан от общ лист с грешно
 * отместване: измерено, 67 от 71 файла нямаха алфа изобщо (бяха върху плътен
 * `ink-950`, тоест на по-светлата карта се виждаха като тъмни правоъгълници), а
 * след като фонът беше премахнат, се показа и по-лошото — вътре в значките
 * стоят парчета от СЪСЕДНАТА икона заедно с текстовия ѝ етикет („UPLOAD“ в
 * `profile`, „UNREACHAI“ в `discovered“). Грешката е в доставения пакет, а
 * листът-източник не е в репото, значи пре-рязване е невъзможно.
 *
 * Затова изборът се прави ТУК, а не в 29-те места, които викат `Badge`: всяко
 * име, за което имаме вектор, се рисува с вектора — остър на всякакъв размер,
 * следва `currentColor` и няма как да носи чуждо парче. Растерът остава само
 * там, където вектор липсва.
 */
function vectorGroup(name: string): IconGroup | null {
  const cached = vectorCache.get(name);
  if (cached !== undefined) return cached;
  const group = VECTOR_GROUPS.find((candidate) =>
    existsSync(path.join(ICON_ROOT, candidate, `${name}.svg`)),
  );
  const resolved = group ?? null;
  vectorCache.set(name, resolved);
  return resolved;
}
const vectorCache = new Map<string, IconGroup | null>();
const ICON_ROOT = path.join(process.cwd(), 'public', 'icons');

export function Badge({ name, size = 40, title = null, className }: Props) {
  // Растерът Е дизайнът — цветните 3D значки са доставеният пакет и те носят
  // бранда. Векторът е РЕЗЕРВА за две положения: значката е доказано изрязана
  // накриво, или изобщо липсва като растер.
  const useVector = MISCUT.has(name) || !exists(name);
  if (useVector) {
    const vector = NAME.test(name) ? vectorGroup(name) : null;
    if (vector) {
      return <Icon group={vector} name={name} size={size} title={title} className={className} />;
    }
  }

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
