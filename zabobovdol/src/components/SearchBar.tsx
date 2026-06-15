"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SearchBar({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const query = q.trim();
        if (query.length >= 2) router.push(`/tarsene?q=${encodeURIComponent(query)}`);
      }}
      className="flex items-center gap-2"
    >
      <label htmlFor="site-search" className="sr-only">
        Търсене в сайта
      </label>
      <input
        id="site-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Търсете услуга, телефон, обява…"
        className="input"
        autoComplete="off"
        enterKeyHint="search"
      />
      <button
        type="submit"
        className={compact ? "btn-secondary px-3" : "btn-primary"}
        aria-label="Търси"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path
            d="M20 20l-3.5-3.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        {!compact && <span>Търси</span>}
      </button>
    </form>
  );
}
