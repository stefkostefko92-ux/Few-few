// The app's painted icon in the standalone page: the same <img>, its files beside the page (icons/, copied by
// scripts/build-artifact.mjs for every icon name the bundle carries) instead of the site's /icons/.
import type { IconName } from '@/components/icon-names';

export type { IconName } from '@/components/icon-names';

export default function Icon({ name, size = 20, label, className, priority = false }: {
  name: IconName; size?: number; label?: string; className?: string; priority?: boolean;
}) {
  const base = `icons/${name}`;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a plain page without Next: the prebuilt WebP pair as is
    <img src={`${base}-96.webp`} srcSet={`${base}-48.webp 48w, ${base}-96.webp 96w`} sizes={`${size}px`} width={size} height={size}
      alt={label ?? ''} aria-hidden={label ? undefined : true} className={className ? `icon ${className}` : 'icon'} decoding="async"
      loading={priority ? undefined : 'lazy'} fetchPriority={priority ? 'high' : undefined} draggable={false} />
  );
}
