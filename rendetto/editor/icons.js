// Line icons for the furniture types (32 × 32, stroke = currentColor) and small handle sketches by handle type.
const P = {
  base: 'M5 9h22v17H5zM16 9v17M13 15v4M19 15v4M7 26v3M25 26v3M4 9h24',
  wall: 'M5 6h22v16H5zM16 6v16M13 17v3M19 17v3M3 4h26',
  tall: 'M10 3h12v26H10zM10 22h12M19 9v5M19 24v2',
  kitchen: 'M3 4h26v8H3zM16 4v8M3 16h26v12H3zM12 16v12M20 16v12M2 15h28M7 9v1M25 9v1',
  wardrobe: 'M4 3h24v26H4zM12 3v26M20 3v26M10 14v4M14 14v4M22 14v4M4 29v1M28 29v1',
  chest:
    'M6 6h20v21H6zM6 11h20M6 16h20M6 21h20M14 8.5h4M14 13.5h4M14 18.5h4M14 24h4M7 27v2M25 27v2',
  nightstand: 'M8 10h16v14H8zM8 17h16M14 13.5h4M14 20.5h4M9 24v4M23 24v4',
  bed: 'M3 8v18M3 14h4v4h20v4H3M7 14c0-2 2-3 4-3h10c3 0 6 1 6 4v3M27 18v8M3 22h24',
  bookcase: 'M6 3h20v26H6zM6 10h20M6 16h20M16 16v13M6 22h20M9 7v3M12 6v4M20 13v3M23 12v4',
  tv: 'M3 17h26v9H3zM11 17v9M21 17v9M5 21.5h4M23 21.5h4M9 4h14v10H9zM16 14v3',
  desk: 'M3 11h26M5 11v16M19 11v16h8V11M19 16h8M19 21h8M22 13.5h2M22 18.5h2M22 23.5h2',
  wallunit: 'M3 4h7v24H3zM22 4h7v24h-7zM10 20h12v8H10zM10 9h12v4H10zM12 13v-1M14 23.5h4',
};

export function typeIcon(type) {
  return `<svg viewBox="0 0 32 32" aria-hidden="true" class="ticon"><path d="${P[type] ?? P.base}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// Handle sketch: bar (two posts), knob, profile/edge pull, shell (cup), other.
export function handleIcon(h) {
  const t = h?.type ?? 'other';
  const path =
    {
      bar: 'M3 12h26M7 12v4M25 12v4',
      knob: 'M16 9a5 5 0 1 0 0.01 0M16 19v3',
      profile: 'M4 10h24v4H4zM4 14h24',
      edge: 'M4 12h24M4 12v5h24v-5',
      shell: 'M6 11h20c0 6-4 9-10 9s-10-3-10-9z',
      other: 'M8 12h16M8 12v4M24 12v4',
    }[t] ?? 'M8 12h16M8 12v4M24 12v4';
  return `<svg viewBox="0 0 32 24" aria-hidden="true" class="hicon"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
