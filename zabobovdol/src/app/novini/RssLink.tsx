"use client";

import { track } from "@/lib/events";

// Видима връзка към RSS абонамента. Брои се само натискането (без бисквитки и
// без идентификатор) — за да знаем дали каналът изобщо се ползва.
export function RssLink() {
  return (
    <a
      href="/novini/rss.xml"
      type="application/rss+xml"
      onClick={() => track("rss_click")}
      className="btn-secondary min-h-[44px]"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <circle cx="6" cy="18" r="2.2" />
        <path d="M4 10.5v3a6.5 6.5 0 0 1 6.5 6.5h3A9.5 9.5 0 0 0 4 10.5Z" />
        <path d="M4 4.5v3A12.5 12.5 0 0 1 16.5 20h3A15.5 15.5 0 0 0 4 4.5Z" />
      </svg>
      Абонирай се (RSS)
    </a>
  );
}
