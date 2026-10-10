import React from 'react';

/**
 * Ключовият арт на „Dominion“ (дадения от собственика) като <picture>: AVIF → WebP,
 * два размера. `priority` = LCP картина (fetchpriority high, без lazy).
 * Ширината/височината са реалните (1672×941) — нула CLS.
 */
export function KeyArt({ className, alt, priority = false }: { className?: string; alt: string; priority?: boolean }): React.ReactElement {
  return (
    <picture className={className}>
      <source type="image/avif" srcSet="/assets/landing/dominion-key-960.avif 960w, /assets/landing/dominion-key.avif 1672w" sizes="100vw" />
      <source type="image/webp" srcSet="/assets/landing/dominion-key-960.webp 960w, /assets/landing/dominion-key.webp 1672w" sizes="100vw" />
      <img
        src="/assets/landing/dominion-key.webp"
        alt={alt}
        width={1672}
        height={941}
        decoding="async"
        loading={priority ? 'eager' : 'lazy'}
        // React 18 не познава camelCase `fetchPriority` (предупреждение в конзолата) —
        // атрибутът отива в DOM-а с малки букви, както го чете браузърът.
        {...{ fetchpriority: priority ? 'high' : 'auto' }}
      />
    </picture>
  );
}
