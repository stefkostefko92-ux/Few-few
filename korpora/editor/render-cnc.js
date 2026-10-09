// CNC tab: per-sheet G-code and DXF, the tool table, time estimate and the toolpath simulation.
import { $, esc, fmt, pct, stat, reduceMotion, setHtml } from './dom.js';
import { toGcode, POSTS, GROOVE_MILL, CLEAR } from '../engine/cam.js';
import { toDxf } from '../engine/dxf.js';
import { sheetSvg, sheetTitle } from './render-nest.js';

const RAPID_MM_MIN = 30000; // assumption for the time estimate
const TOOL_CHANGE_S = 15; // assumption for the time estimate
const HOLE_EXTRA_S = 0.4; // assumption for the time estimate: positioning and dwell per hole
// simulation pace: a hole counts as this many mm of path, a rapid at this share of its length; the whole run takes SIM_MS
const SIM_HOLE_MM = 30;
const SIM_RAPID_SHARE = 0.25;
const SIM_MS = 14000;
// tool colours are classes (.tc1 … .tc8 set --c in editor.css): no style attributes under the CSP
const PALETTE = ['tc1', 'tc2', 'tc3', 'tc4', 'tc5', 'tc6', 'tc7', 'tc8'];

let sim = { raf: 0, playing: false };

function moveLength(m) {
  if (m.type === 'arc')
    return (Math.PI / 2) * Math.hypot(m.from.X - m.center[0], m.from.Y - m.center[1]);
  if (m.type === 'drill') return 0;
  return Math.hypot(m.to.X - m.from.X, m.to.Y - m.from.Y, m.to.Z - m.from.Z);
}

function estimate(g) {
  let cut = 0;
  let rapid = 0;
  let seconds = 0;
  let drills = 0;
  const drillFeed = new Map(g.tools.filter((t) => t.kind === 'drill').map((t) => [t.id, t.feed]));
  for (const m of g.moves) {
    // GRBL writes the plunge of every hole as a feed move: the drill move below already counts it
    if (m.type === 'feed' && drillFeed.has(m.tool)) continue;
    const len = moveLength(m);
    if (m.type === 'rapid') {
      rapid += len;
      seconds += (len / RAPID_MM_MIN) * 60;
    } else if (m.type === 'drill') {
      drills += 1;
      // in from the R plane and back out, at the drill's feed
      seconds += (((m.depth + CLEAR) * 2) / drillFeed.get(m.tool)) * 60 + HOLE_EXTRA_S;
    } else {
      cut += len;
      seconds += (len / (m.F || 3000)) * 60;
    }
  }
  return { cut, rapid, seconds: seconds + g.tools.length * TOOL_CHANGE_S, drills };
}

function pointOn(m, frac) {
  if (m.type === 'arc') {
    const [cx, cy] = m.center;
    const a0 = Math.atan2(m.from.Y - cy, m.from.X - cx);
    let a1 = Math.atan2(m.to.Y - cy, m.to.X - cx);
    if (a1 > a0) a1 -= 2 * Math.PI; // clockwise
    const a = a0 + (a1 - a0) * frac;
    const r = Math.hypot(m.from.X - cx, m.from.Y - cy);
    return { X: cx + r * Math.cos(a), Y: cy + r * Math.sin(a) };
  }
  return { X: m.from.X + (m.to.X - m.from.X) * frac, Y: m.from.Y + (m.to.Y - m.from.Y) * frac };
}

function segPath(m, fy, frac) {
  const a = m.from;
  const p = frac >= 1 ? m.to : pointOn(m, frac);
  if (m.type === 'arc') {
    const r = Math.hypot(a.X - m.center[0], a.Y - m.center[1]);
    return `M${a.X} ${fy(a.Y)}A${r} ${r} 0 0 1 ${p.X} ${fy(p.Y)}`;
  }
  return `M${a.X} ${fy(a.Y)}L${p.X} ${fy(p.Y)}`;
}

function pathsFor(g, progress) {
  const fy = (y) => g.sheetH - y;
  const limit = (g.lengths.at(-1) || 1) * progress;
  const cache = !g.faint;
  let faint = g.faint || '';
  let done = '';
  let marks = '';
  let tool = null;
  g.moves.forEach((m, i) => {
    const start = i ? g.lengths[i - 1] : 0;
    const end = g.lengths[i];
    const c = g.color.get(m.tool) ?? 'tc0';
    if (m.type === 'drill') {
      marks += `<circle cx="${m.at[0]}" cy="${fy(m.at[1])}" r="${Math.max(g.dia.get(m.tool) / 2, 3)}" class="drill ${c}${end <= limit ? ' on' : ''}"/>`;
      if (start < limit && end > limit) tool = { X: m.at[0], Y: m.at[1] }; // the tool stays over the hole it drills
      return;
    }
    if (cache)
      faint +=
        m.type === 'rapid'
          ? `<path d="${segPath(m, fy, 1)}" class="rapid"/>`
          : `<path d="${segPath(m, fy, 1)}" class="feed ${c}"/>`;
    if (start >= limit) return;
    const frac = end <= limit ? 1 : (limit - start) / Math.max(end - start, 1e-6);
    if (m.type !== 'rapid') done += `<path d="${segPath(m, fy, frac)}" class="done ${c}"/>`;
    if (end > limit || i === g.moves.length - 1) tool = pointOn(m, frac);
  });
  if (cache) g.faint = faint;
  const marker =
    tool && progress < 1
      ? `<g class="toolmark" transform="translate(${tool.X} ${fy(tool.Y)})"><circle r="16"/><circle r="4" class="dot"/></g>`
      : '';
  return `<g>${faint}</g><g>${done}</g><g>${marks}</g>${marker}`;
}

export function renderCnc(state, meta) {
  stopSim();
  // fail closed: with an error in the construction there is no G-code, no DXF and no simulation, only the reasons
  const blocked = state.blockers.length > 0;
  $('#cnc-blocked').hidden = !blocked;
  $('#cnc-body').hidden = blocked;
  if (blocked) {
    $('#cnc-reasons').innerHTML = state.blockers.map((r) => `<li>${esc(r)}</li>`).join('');
    state.gcode = null;
    state.dxf = null;
    return;
  }
  const sheets = state.nesting.sheets;
  if (!sheets.length) return;
  state.sheet = Math.min(state.sheet, sheets.length - 1);
  $('#cnc-sheet').innerHTML = sheets
    .map(
      (sh) => `<option value="${sh.index - 1}">Лист ${sh.index} — ${esc(sheetTitle(sh))}</option>`,
    )
    .join('');
  $('#cnc-sheet').value = String(state.sheet);
  const sh = sheets[state.sheet];
  const g = toGcode(state.model, sh, { ...meta, sheetCount: sheets.length });
  const dxf = toDxf(state.model, sh);
  g.sheetH = sh.h;
  g.color = new Map(g.tools.map((t, i) => [t.id, PALETTE[i % PALETTE.length]]));
  g.dia = new Map(g.tools.map((t) => [t.id, t.d]));
  g.lengths = [];
  let acc = 0;
  for (const m of g.moves) {
    acc +=
      m.type === 'drill' ? SIM_HOLE_MM : moveLength(m) * (m.type === 'rapid' ? SIM_RAPID_SHARE : 1);
    g.lengths.push(acc);
  }
  state.gcode = g;
  state.dxf = dxf;
  state.progress = 1;
  const est = estimate(g);
  $('#cnc-stats').innerHTML = [
    stat('Инструменти', fmt(g.tools.length)),
    stat('Отвори', fmt(est.drills)),
    stat('Рязане', `${fmt(est.cut / 1000, 1)} m`),
    stat('Празен ход', `${fmt(est.rapid / 1000, 1)} m`),
    stat('Време (оценка)', `≈ ${fmt(Math.max(1, Math.round(est.seconds / 60)))} мин`),
  ].join('');
  setHtml(
    $('#cnc-tools'),
    g.tools
      .map(
        (t) =>
          `<span class="${g.color.get(t.id)}">${t.id} ${esc(t.kind === 'drill' ? `свредло Ø${String(t.d).replace('.', ',')}` : t.id === GROOVE_MILL.id ? `фреза Ø${t.d}, канали` : `фреза Ø${t.d}, контур`)}</span>`,
      )
      .join(''),
  );
  $('#cnc-manual').innerHTML = g.ops.manual.length
    ? `<p class="err">${g.ops.manual.length} отвора без свредло в библиотеката: ${[...new Set(g.ops.manual.map((h) => `Ø${h.d}`))].join(', ')} — пробиват се ръчно.</p>`
    : '';
  $('#gcode').textContent = g.text;
  $('#dxf').textContent = dxf.text;
  $('#gcode-meta').textContent =
    `${POSTS[state.spec.post].name} · ${g.text.split('\n').length - 1} реда · list-${sh.index}.nc`;
  $('#dxf-meta').textContent = `DXF R12 · ${dxf.layers.length} слоя · list-${sh.index}.dxf`;
  $('#dxf-layers').innerHTML = dxf.layers.map((l) => `<code>${esc(l)}</code>`).join(' ');
  drawToolpath(state);
}

export function drawToolpath(state) {
  const sh = state.nesting.sheets[state.sheet];
  if (!sh || !state.gcode) return;
  setHtml($('#toolpath'), sheetSvg(sh, { paths: pathsFor(state.gcode, state.progress) }));
  const slider = $('#sim-progress');
  slider.value = String(Math.round(state.progress * Number(slider.max)));
  $('#sim-label').textContent = pct(Math.round(state.progress * 100));
}

export function stopSim() {
  sim.playing = false;
  cancelAnimationFrame(sim.raf);
  const b = $('#sim-play');
  if (b) {
    b.textContent = 'Симулирай';
    b.setAttribute('aria-pressed', 'false');
  }
}

export function toggleSim(state) {
  if (sim.playing) {
    stopSim();
    return;
  }
  if (reduceMotion.matches) {
    state.progress = 1;
    drawToolpath(state);
    return;
  }
  sim = { playing: true, raf: 0 };
  $('#sim-play').textContent = 'Пауза';
  $('#sim-play').setAttribute('aria-pressed', 'true');
  if (state.progress >= 1) state.progress = 0;
  let last = performance.now();
  const step = (now) => {
    if (!sim.playing) return;
    state.progress = Math.min(1, state.progress + (now - last) / SIM_MS);
    last = now;
    drawToolpath(state);
    if (state.progress >= 1) stopSim();
    else sim.raf = requestAnimationFrame(step);
  };
  sim.raf = requestAnimationFrame(step);
}
