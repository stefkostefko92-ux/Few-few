// Посочване в графиката на дашборда: вертикална линия следва показалеца (или ← → при фокус) и
// показва процента на всяка партида в този момент — първо най-ниските. Без JavaScript графиката и
// таблицата под нея носят същите данни. Текстът влиза само през textContent.
(() => {
  const root = document.getElementById('chart');
  const dataEl = document.getElementById('chart-data');
  if (!root || !dataEl) return;
  const svg = root.querySelector('svg');
  const cross = root.querySelector('.crosshair');
  const tip = root.querySelector('.chart-tip');
  if (!svg || !cross || !tip) return;

  let data;
  try {
    data = JSON.parse(dataEl.textContent || '');
  } catch {
    return;
  }
  const { start, end, plot, width, timezone, series } = data;
  const MAX_ROWS = 8;
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

  let current = null; // x във viewBox единици

  function percentAt(s, t) {
    return t >= s.exp ? 0 : Math.max(0, s.p0 - s.slope * (t - start));
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function show(x) {
    current = Math.min(plot.x + plot.w, Math.max(plot.x, x));
    const t = start + ((current - plot.x) / plot.w) * (end - start);
    cross.setAttribute('x1', String(current));
    cross.setAttribute('x2', String(current));
    cross.setAttribute('visibility', 'visible');

    // Първо живите партиди с най-нисък %; изтеклите до този момент — само като брой накрая.
    const all = series.map((s) => ({ s, p: percentAt(s, t) }));
    const rows = all.filter((r) => r.p > 0).sort((a, b) => a.p - b.p);
    const gone = all.length - rows.length;
    tip.replaceChildren();
    tip.append(el('div', 'tip-time', fmtTime.format(new Date(t))));
    for (const { s, p } of rows.slice(0, MAX_ROWS)) {
      const row = el('div', 'tip-row');
      const key = el('span', 'tip-key');
      key.style.background = s.color; // CSSOM — CSP разрешава, за разлика от style="" в разметката
      row.append(key, el('strong', '', `${fmtPct.format(p)}%`));
      row.append(el('span', 'muted', ` #${s.id} ${s.label} ×${s.count}`));
      tip.append(row);
    }
    if (rows.length > MAX_ROWS) tip.append(el('div', 'muted', `+${rows.length - MAX_ROWS} още`));
    if (gone > 0) tip.append(el('div', 'muted', `изтекли до тогава: ${gone}`));
    tip.hidden = false;

    // Подсказката е до линията, от страната с повече място.
    const px = (current / width) * svg.getBoundingClientRect().width;
    const box = root.getBoundingClientRect().width;
    const left = px + 14 + tip.offsetWidth > box ? px - 14 - tip.offsetWidth : px + 14;
    tip.style.left = `${Math.max(0, left)}px`;
  }

  function hide() {
    cross.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  }

  svg.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    show(((e.clientX - r.left) / r.width) * width);
  });
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('blur', hide);
  svg.addEventListener('keydown', (e) => {
    const step = plot.w / 48;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      show((current ?? plot.x) + (e.key === 'ArrowRight' ? step : -step));
    } else if (e.key === 'Escape') {
      hide();
    }
  });
})();
