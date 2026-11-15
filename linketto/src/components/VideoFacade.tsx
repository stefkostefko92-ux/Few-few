'use client';

import { useState } from 'react';

// „Click-to-load“: докато посетителят не натисне Play, към YouTube/Vimeo не
// се праща нито една заявка (обещание: без трети страни без действие).
export function VideoFacade({
  src,
  title,
  playLabel,
  accent,
  className,
}: {
  src: string;
  title: string;
  playLabel: string;
  accent: string;
  className?: string;
}) {
  const [active, setActive] = useState(false);
  if (active) {
    return (
      <iframe
        src={`${src}${src.includes('?') ? '&' : '?'}autoplay=1`}
        title={title}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        className={`aspect-video w-full ${className ?? ''}`}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setActive(true)}
      aria-label={`${playLabel}: ${title}`}
      className={`group relative flex aspect-video w-full items-center justify-center overflow-hidden ${className ?? ''}`}
      style={{
        background: `radial-gradient(120% 120% at 20% 10%, color-mix(in srgb, ${accent} 55%, #0b1020), #0b1020 70%)`,
      }}
    >
      <span
        aria-hidden
        className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 shadow-xl transition duration-200 group-hover:scale-110"
      >
        <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7" fill="#0b1020">
          <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
        </svg>
      </span>
      <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-4 pb-3 pt-8 text-start text-sm font-semibold text-white">
        {title}
      </span>
    </button>
  );
}
