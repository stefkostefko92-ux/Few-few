import type { IconName } from './icon-names';

export type { IconName } from './icon-names';

type IconProps = {
  /** One of the painted icons (src/components/icon-names.ts, built by scripts/icons-build.py). */
  name: IconName;
  /** Rendered width and height in CSS pixels (default 20). */
  size?: number;
  /** The icon's meaning when it stands alone (an icon-only link or button names itself through it); without one the
   *  icon is decorative and hidden from assistive technology. */
  label?: string;
  className?: string;
  /** Load it with the page (above the fold); otherwise the browser fetches it when it comes near the viewport. */
  priority?: boolean;
};

/** A painted icon of the LiftPilot Premium pack: a fixed-colour picture made for dark surfaces, served as WebP at 48 and
 *  96 px; the browser picks the one the size and the screen's density need. */
export default function Icon({ name, size = 20, label, className, priority = false }: IconProps) {
  const base = `/icons/${name}`;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- prebuilt WebP pair (scripts/icons-build.py), nothing to optimise
    <img
      src={`${base}-96.webp`}
      srcSet={`${base}-48.webp 48w, ${base}-96.webp 96w`}
      sizes={`${size}px`}
      width={size}
      height={size}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      className={className ? `icon ${className}` : 'icon'}
      decoding="async"
      loading={priority ? undefined : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      draggable={false}
    />
  );
}
