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

type Props = {
  name: string;
  size?: number;
  /** Достъпно име. `null` (по подразбиране) значи чиста декорация. */
  title?: string | null;
  className?: string;
};

export function Badge({ name, size = 40, title = null, className }: Props) {
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
