import { engine, type DrawingMeta, type EngineModel, type EngineSheet } from './engine.js';
import { labelSpot, type Hole, type Stroke } from './sheet-labels.js';

/**
 * Листът от разкроя за витрината и брошурата: детайлите, пътят на фрезата по реда на рязане, отворите и номерата
 * на детайлите — от G-кода на двигателя, нищо не е рисувано на ръка.
 */
interface Move {
  type: string;
  tool?: string;
  at?: [number, number];
  from?: { X: number; Y: number; Z: number };
  to?: { X: number; Y: number; Z: number };
  center?: [number, number];
}

interface Tool {
  id: string;
  kind: string;
  d: number;
}

interface Placement {
  x: number;
  y: number;
  w: number;
  h: number;
  partId: string;
}

export interface SheetLike extends EngineSheet {
  w: number;
  h: number;
  placements: Placement[];
}

/** Пътят на фрезата се изрисува на вълни в реда на рязане (класовете w1…w6 в site.css). */
const WAVES = 6;
/** Инструментът по вид — същото правило като в редактора: фрезата за каналите е `GROOVE_MILL` на двигателя. */
function toolClass(tool: Tool | undefined): 'tdrill' | 'tgroove' | 'tcontour' {
  if (!tool || tool.kind === 'drill') return 'tdrill';
  return tool.id === engine().grooveToolId ? 'tgroove' : 'tcontour';
}

export function sheetArt(model: EngineModel, sheet: SheetLike, meta: DrawingMeta) {
  const g = engine().toGcode(model, sheet, meta) as unknown as {
    text: string;
    moves: Move[];
    tools: Tool[];
  };
  const tools = new Map(g.tools.map((t) => [t.id, t]));
  const fy = (y: number) => sheet.h - y;
  const cuts: string[] = [];
  const holes: Array<Hole & { cls: string }> = [];
  // правите линии на фрезата: номерата ги заобикалят (половината от stroke-width 5 в CSS)
  const strokes: Stroke[] = [];
  for (const m of g.moves) {
    const tool = m.tool ? tools.get(m.tool) : undefined;
    if (m.type === 'drill' && m.at) {
      holes.push({
        x: m.at[0],
        y: fy(m.at[1]),
        r: Math.max((tool?.d ?? 5) / 2, 5),
        cls: toolClass(tool),
      });
      continue;
    }
    if (m.type === 'rapid' || !m.from || !m.to || !tool) continue;
    if (m.from.X === m.to.X && m.from.Y === m.to.Y) continue;
    if (m.type !== 'arc')
      strokes.push({ x0: m.from.X, y0: fy(m.from.Y), x1: m.to.X, y1: fy(m.to.Y), half: 2.5 });
    const r = m.center ? Math.hypot(m.from.X - m.center[0], m.from.Y - m.center[1]) : 0;
    const d =
      m.type === 'arc' && m.center
        ? `M${m.from.X} ${fy(m.from.Y)}A${r} ${r} 0 0 1 ${m.to.X} ${fy(m.to.Y)}`
        : `M${m.from.X} ${fy(m.from.Y)}L${m.to.X} ${fy(m.to.Y)}`;
    cuts.push(`<path d="${d}" pathLength="1" class="cut ${toolClass(tool)} w{wave}"/>`);
  }
  const paths = cuts
    .map((path, i) => path.replace('{wave}', String(Math.floor((i * WAVES) / cuts.length) + 1)))
    .join('');
  const drills = holes
    .map((h) => `<circle cx="${h.x}" cy="${h.y}" r="${h.r}" class="hole ${h.cls}"/>`)
    .join('');
  let parts = '';
  let labels = '';
  for (const p of sheet.placements) {
    const box = { x: p.x, y: fy(p.y + p.h), w: p.w, h: p.h };
    parts += `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" class="part"/>`;
    const at = labelSpot(box, p.partId, holes, strokes);
    labels += `<text x="${at.x}" y="${at.y}" font-size="${at.size}" class="pid">${p.partId}</text>`;
  }
  const svg = `<svg viewBox="-30 -30 ${sheet.w + 60} ${sheet.h + 60}" class="sheet-art" aria-hidden="true" focusable="false"><rect x="10" y="22" width="${sheet.w}" height="${sheet.h}" class="board-shadow"/><rect x="0" y="0" width="${sheet.w}" height="${sheet.h}" class="board"/>${parts}<g class="paths">${paths}</g>${labels}<g>${drills}</g></svg>`;
  const used = new Set(
    g.moves.map((m) => m.tool).filter((id): id is string => typeof id === 'string'),
  );
  const usedTools = g.tools.filter((t) => used.has(t.id));
  const lines = g.text.split('\n');
  return {
    svg,
    holes: holes.length,
    gcode: lines.slice(0, 16),
    // движение, не настройка: същото правило като реда с G-кода в landing/story.js
    firstMove: lines.find((line) => /^(G[0-3]|G8[0-9])\b/.test(line)) ?? '',
    tools: {
      contour: usedTools.find((t) => toolClass(t) === 'tcontour')?.d ?? null,
      groove: usedTools.find((t) => toolClass(t) === 'tgroove')?.d ?? null,
      drills: usedTools.filter((t) => t.kind === 'drill').map((t) => t.d),
    },
  };
}
