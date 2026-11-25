// Прогнозата във времето на <canvas>: геометрията идва готова от сървъра (логически единици
// width × height), тук само се мащабира до ширината на картата. Посочването (или ← → при фокус)
// показва процента на всяка партида в избрания момент — първо най-ниските. Текстът влиза само през
// textContent.
import type { ChartData, ChartSeriesData } from './data.js';

const MAX_ROWS = 8;
const COLORS = { grid: '#2b352e', axis: '#95a399', surface: '#171d19' } as const;

function el(tag: string, cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function mountChart(root: HTMLElement, data: ChartData): void {
  const canvas = root.querySelector('canvas');
  const tip = root.querySelector<HTMLElement>('.chart-tip');
  const ctx = canvas?.getContext('2d');
  if (!canvas || !tip || !ctx) return;

  const { start, end, plot, width, height, timezone, series } = data;
  const font = getComputedStyle(document.body).fontFamily;
  const fmtTime = new Intl.DateTimeFormat('bg-BG', {
    timeZone: timezone,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const fmtPct = new Intl.NumberFormat('bg-BG', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    useGrouping: false,
  });
  let cross: number | null = null; // x в логически единици

  const line = (x0: number, y0: number, x1: number, y1: number) => {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  };
  const text = (s: string, x: number, y: number, align: CanvasTextAlign) => {
    ctx.textAlign = align;
    ctx.fillText(s, x, y);
  };

  function draw(): void {
    if (!canvas || !ctx) return;
    const cssW = canvas.clientWidth;
    if (cssW < 1) return;
    const k = cssW / width; // височината идва от CSS (aspect-ratio = width / height)
    const cssH = height * k;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'round';
    ctx.font = `13px ${font}`;

    const right = plot.x + plot.w;
    const bottom = plot.y + plot.h;
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.fillStyle = COLORS.axis;
    for (const t of data.yTicks) {
      line(plot.x, t.y, right, t.y);
      text(t.label, plot.x - 8, t.y + 4, 'right');
    }
    for (const t of data.xTicks) {
      line(t.x, plot.y, t.x, bottom);
      if (t.label) text(t.label, t.x, bottom + 22, 'center');
    }
    text('сега', plot.x, bottom + 22, 'left');

    ctx.strokeStyle = COLORS.axis;
    ctx.setLineDash([4, 4]);
    for (const t of data.thresholds) {
      line(plot.x, t.y, right, t.y);
      text(t.label, right + 6, t.y + 4, 'left');
    }
    ctx.setLineDash([]);

    ctx.lineWidth = 2;
    for (const s of series) {
      ctx.strokeStyle = s.color;
      line(s.x0, s.y0, s.x1, s.y1);
    }
    for (const s of series) {
      if (!s.endsInside) continue;
      ctx.beginPath();
      ctx.arc(s.x1, s.y1, 4, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.strokeStyle = COLORS.surface;
      ctx.stroke();
    }
    if (cross !== null) {
      ctx.strokeStyle = COLORS.axis;
      ctx.lineWidth = 1;
      line(cross, plot.y, cross, bottom);
    }
  }

  const percentAt = (s: ChartSeriesData, t: number) =>
    t >= s.exp ? 0 : Math.max(0, s.p0 - s.slope * (t - start));

  function show(x: number): void {
    if (!canvas || !tip) return;
    cross = Math.min(plot.x + plot.w, Math.max(plot.x, x));
    const t = start + ((cross - plot.x) / plot.w) * (end - start);
    draw();

    // Първо живите партиди с най-нисък %; изтеклите до този момент — само като брой накрая.
    const all = series.map((s) => ({ s, p: percentAt(s, t) }));
    const rows = all.filter((r) => r.p > 0).sort((a, b) => a.p - b.p);
    const gone = all.length - rows.length;
    tip.replaceChildren(el('div', 'tip-time', fmtTime.format(new Date(t))));
    for (const { s, p } of rows.slice(0, MAX_ROWS)) {
      const row = el('div', 'tip-row');
      const key = el('span', 'tip-key');
      key.style.background = s.color; // CSSOM — CSP го позволява, style="" в разметката не
      row.append(key, el('strong', '', `${fmtPct.format(p)}%`));
      row.append(el('span', 'muted', ` #${s.id} ${s.label} ×${s.count}`));
      tip.append(row);
    }
    if (rows.length > MAX_ROWS) tip.append(el('div', 'muted', `+${rows.length - MAX_ROWS} още`));
    if (gone > 0) tip.append(el('div', 'muted', `изтекли до тогава: ${gone}`));
    tip.hidden = false;

    // Подсказката е до линията, от страната с повече място.
    const px = (cross / width) * canvas.getBoundingClientRect().width;
    const box = root.getBoundingClientRect().width;
    const left = px + 14 + tip.offsetWidth > box ? px - 14 - tip.offsetWidth : px + 14;
    tip.style.left = `${Math.max(0, left)}px`;
  }

  function hide(): void {
    if (!tip) return;
    cross = null;
    tip.hidden = true;
    draw();
  }

  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    show(((e.clientX - r.left) / r.width) * width);
  });
  canvas.addEventListener('pointerleave', hide);
  canvas.addEventListener('blur', hide);
  canvas.addEventListener('keydown', (e) => {
    const step = plot.w / 48;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      show((cross ?? plot.x) + (e.key === 'ArrowRight' ? step : -step));
    } else if (e.key === 'Escape') {
      hide();
    }
  });
  // Графиката е в сгънат <details>: рисува се, щом стане видима, и при всяка смяна на ширината.
  new ResizeObserver(() => draw()).observe(canvas);
}
