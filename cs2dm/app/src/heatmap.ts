/**
 * Heatmap на de_dust2 (CONTRACT.md §4). Константите са от `resource/overviews/de_dust2.txt` на
 * играта: `pos_x = -2476`, `pos_y = 3239`, `scale = 4.4`, радар 1024×1024.
 * Пиксел: `px = (x − pos_x) / scale`, `py = (pos_y − y) / scale`.
 *
 * Показват се САМО агрегати по клетки, за период със закъснение — никога позиции на живо (иначе
 * страницата е радар за читъри). Радарната картинка на Valve не се ползва: рамката и решетката
 * са наши.
 */
export const DUST2_OVERVIEW = { posX: -2476, posY: 3239, scale: 4.4, size: 1024 } as const;

/** Клетка от 32 px на радара (≈ 141 единици в играта) → решетка 32 × 32. */
export const CELL_PX = 32;
export const GRID = DUST2_OVERVIEW.size / CELL_PX;

/** Прозорецът на данните: последните 30 дни, без последния час (закъснението). */
export const HEATMAP_WINDOW_DAYS = 30;
export const HEATMAP_DELAY_MS = 60 * 60 * 1000;

export function heatmapWindow(now: Date): { since: Date; until: Date } {
  const until = new Date(now.getTime() - HEATMAP_DELAY_MS);
  const since = new Date(now.getTime() - HEATMAP_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return { since, until };
}

export function worldToRadar(x: number, y: number): { px: number; py: number } {
  return {
    px: (x - DUST2_OVERVIEW.posX) / DUST2_OVERVIEW.scale,
    py: (DUST2_OVERVIEW.posY - y) / DUST2_OVERVIEW.scale,
  };
}

export interface HeatCell {
  cx: number;
  cy: number;
  n: number;
}

/** Клетката на световна точка; извън радара → null (такава точка не се рисува). */
export function cellOf(x: number, y: number): { cx: number; cy: number } | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const { px, py } = worldToRadar(x, y);
  const cx = Math.floor(px / CELL_PX);
  const cy = Math.floor(py / CELL_PX);
  if (cx < 0 || cy < 0 || cx >= GRID || cy >= GRID) return null;
  return { cx, cy };
}

/** Агрегира точки в клетки (същото, което прави SQL заявката — тук за тестове и резерв). */
export function aggregate(points: ReadonlyArray<{ x: number; y: number }>): HeatCell[] {
  const counts = new Map<string, HeatCell>();
  for (const point of points) {
    const cell = cellOf(point.x, point.y);
    if (!cell) continue;
    const key = `${cell.cx}:${cell.cy}`;
    const found = counts.get(key);
    if (found) found.n += 1;
    else counts.set(key, { ...cell, n: 1 });
  }
  return [...counts.values()].sort((a, b) => a.cy - b.cy || a.cx - b.cx);
}

/** Пази само валидни клетки (в решетката, положителен брой) — данните идват от SQL. */
export function cleanCells(cells: ReadonlyArray<HeatCell>): HeatCell[] {
  return cells.filter(
    (cell) =>
      Number.isInteger(cell.cx) &&
      Number.isInteger(cell.cy) &&
      cell.cx >= 0 &&
      cell.cy >= 0 &&
      cell.cx < GRID &&
      cell.cy < GRID &&
      Number.isInteger(cell.n) &&
      cell.n > 0,
  );
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SECTORS = 8;
const SECTOR_PX = DUST2_OVERVIEW.size / SECTORS;
const COLUMNS = 'ABCDEFGH';

export interface HeatmapSvgOptions {
  id: string;
  kind: 'kills' | 'deaths';
  cells: ReadonlyArray<HeatCell>;
  title: string;
  description: string;
}

/**
 * Сървърно рендериран SVG без нито един външен ресурс: рамка, решетка 8 × 8 с подписи A–H / 1–8
 * (за да може човек да каже „най-много в C4“) и клетките с плътност по логаритмична скала —
 * иначе една гореща клетка изгася всички останали.
 */
export function renderHeatmapSvg(options: HeatmapSvgOptions): string {
  const cells = cleanCells(options.cells);
  const max = cells.reduce((m, cell) => Math.max(m, cell.n), 0);
  const id = options.id.replace(/[^a-z0-9-]/gi, '');
  const size = DUST2_OVERVIEW.size;
  const pad = 56;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" class="heatmap heatmap-${options.kind}" viewBox="${-pad} ${-pad} ${size + pad * 2} ${size + pad * 2}" width="512" height="512" role="img" aria-labelledby="${id}-t ${id}-d" focusable="false">`,
  );
  parts.push(`<title id="${id}-t">${escapeXml(options.title)}</title>`);
  parts.push(`<desc id="${id}-d">${escapeXml(options.description)}</desc>`);
  parts.push(`<rect class="hm-bg" x="0" y="0" width="${size}" height="${size}"/>`);
  for (let i = 1; i < SECTORS; i += 1) {
    const at = i * SECTOR_PX;
    parts.push(`<line class="hm-grid" x1="${at}" y1="0" x2="${at}" y2="${size}"/>`);
    parts.push(`<line class="hm-grid" x1="0" y1="${at}" x2="${size}" y2="${at}"/>`);
  }
  for (const cell of cells) {
    const weight = max > 0 ? Math.log1p(cell.n) / Math.log1p(max) : 0;
    const opacity = (0.18 + 0.82 * weight).toFixed(2);
    parts.push(
      `<rect class="hm-cell" x="${cell.cx * CELL_PX}" y="${cell.cy * CELL_PX}" width="${CELL_PX}" height="${CELL_PX}" fill-opacity="${opacity}"/>`,
    );
  }
  parts.push(`<rect class="hm-frame" x="0" y="0" width="${size}" height="${size}"/>`);
  for (let i = 0; i < SECTORS; i += 1) {
    const mid = i * SECTOR_PX + SECTOR_PX / 2;
    parts.push(`<text class="hm-label" x="${mid}" y="${-pad / 2}">${COLUMNS[i]}</text>`);
    parts.push(`<text class="hm-label" x="${-pad / 2}" y="${mid}">${i + 1}</text>`);
  }
  parts.push('</svg>');
  return parts.join('');
}

/** Най-гъстата клетка като „C4“ (сектор 8 × 8) — за текстовото резюме до картата. */
export function hottestSector(cells: ReadonlyArray<HeatCell>): string | null {
  const sectors = new Map<string, number>();
  const per = GRID / SECTORS;
  for (const cell of cleanCells(cells)) {
    const key = `${COLUMNS[Math.floor(cell.cx / per)]}${Math.floor(cell.cy / per) + 1}`;
    sectors.set(key, (sectors.get(key) ?? 0) + cell.n);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [key, count] of sectors) {
    if (count > bestCount || (count === bestCount && best !== null && key < best)) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}
