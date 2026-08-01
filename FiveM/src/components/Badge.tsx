import Image from 'next/image';

/**
 * Обемните икони (`public/icons/badges/`) са РАСТЕРНИ, цветни и със сенки —
 * направени за 40–64 px. Под ~32 px стават сива каша, затова компонентът има
 * долен праг и линейните SVG (`Icon`) остават за чиповете и навигацията.
 *
 * Разделението не е вкус: растерът не наследява `currentColor`, значи не
 * реагира на hover и не се пребоядисва по бранда — там, където иконата трябва
 * да следва текста, се ползва `Icon`, не този компонент.
 */
const MIN_SIZE = 28;

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
