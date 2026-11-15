"use client";

import { track } from "@/lib/events";

// Видима връзка към RSS абонамента; броим само колко пъти е натисната
// (без бисквитка и без идентификатор — виж src/lib/events.ts).
export function RssLink() {
  return (
    <a
      href="/prekysvaniya/rss.xml"
      onClick={() => track("rss_click")}
      className="btn-secondary"
      type="application/rss+xml"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M5 3a16 16 0 0 1 16 16h-3A13 13 0 0 0 5 6V3Zm0 6a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7V9Zm2 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"
          fill="currentColor"
        />
      </svg>
      Абонамент през RSS
    </a>
  );
}
