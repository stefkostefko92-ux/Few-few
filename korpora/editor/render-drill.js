// Пробиване tab: hardware cards (where every hinge, handle and slide goes and which holes it needs), the drilling
// map of the selected part and its full hole table.
import { $, esc, fmt, mm, stat, inlineSvg } from './dom.js';
import { hardwareCards, partHoles, edgeOpName, edgePurposeOf } from '../engine/drill.js';
import { drawingPart, holeLetters } from '../engine/drawing-part.js';
import { edgeLabels } from '../engine/panel.js';
import { tx, words } from './text.js';

const ROLE_GROUP = ['door', 'drawer-front', 'side', 'partition'];

export function renderDrill(state, meta) {
  const { model } = state;
  const drillable = model.parts.filter(
    (p) => p.features.some((f) => f.type === 'hole' || f.type === 'mark') || p.edgeOps.length,
  );
  if (!drillable.some((p) => p.id === state.drillPart))
    state.drillPart = (drillable.find((p) => p.role === 'door') ?? drillable[0])?.id;
  const sel = $('#drill-part');
  const groups = ROLE_GROUP.map((role) => [
    tx(`drill.group.${role}`),
    drillable.filter((p) => p.role === role),
  ]);
  const rest = drillable.filter((p) => !ROLE_GROUP.includes(p.role));
  sel.innerHTML = [...groups, [tx('drill.group.other'), rest]]
    .filter(([, ps]) => ps.length)
    .map(
      ([label, ps]) =>
        `<optgroup label="${esc(label)}">${ps.map((p) => `<option value="${p.id}">${p.id} · ${esc(p.name)}</option>`).join('')}</optgroup>`,
    )
    .join('');
  sel.value = state.drillPart ?? '';
  const all = model.parts.flatMap((p) => p.features.filter((f) => f.type === 'hole'));
  const key = (k) => all.filter((f) => f.kind === k).length;
  const edge = model.parts.reduce((a, p) => a + p.edgeOps.reduce((b, o) => b + o.count, 0), 0);
  $('#drill-summary').innerHTML = [
    stat(tx('drill.top'), fmt(all.length)),
    stat(tx('drill.cups'), fmt(key('cup'))),
    stat(tx('drill.plates'), fmt(key('plate'))),
    stat(tx('drill.handles'), fmt(key('handle'))),
    stat(tx('drill.slides'), fmt(key('slide'))),
    stat(tx('drill.inEdges'), fmt(edge)),
  ].join('');
  $('#drill-cards').innerHTML =
    hardwareCards(model).map(cardHtml).join('') ||
    `<p class="note">${esc(tx('drill.noHardware'))}</p>`;
  renderDrillPart(state, meta);
}

function cardHtml(c) {
  const title = tx(`drill.card.${c.type}`);
  const lines = c.parts.map((p) => {
    if (p.cup) {
      return `<li><span><b>${p.partId}</b> ${esc(p.name)}<small>${esc(tx(`drill.cup.${p.cup.side === 'left' ? 'left' : 'right'}`, { d: mm(p.cup.d), depth: mm(p.cup.depth), boring: mm(p.cup.boring), centre: mm(p.cup.boring + p.cup.d / 2) }))}</small></span><span class="vals">${p.cup.heights.map(mm).join(' · ')}<small>${esc(tx('drill.heightsFrom', { edge: p.edges.u0 }))}</small></span></li>`;
    }
    if (p.handle) {
      const h = p.holes.filter((x) => x.kind === 'handle' || x.kind === 'handle-mark');
      const what = p.handle.template
        ? tx('drill.byTemplate')
        : tx('drill.handleThrough', { n: p.handle.count, d: mm(p.handle.d) });
      const spacing = p.handle.spacing
        ? `, ${tx('drill.spacing', { s: mm(p.handle.spacing) })}`
        : '';
      return `<li><span><b>${p.partId}</b> ${esc(p.name)}<small>${esc(what + spacing)}</small></span><span class="vals">${h.map((x) => `${mm(x.u)} ; ${mm(x.v)}`).join(' · ')}<small>${esc(tx('drill.uvFrom', { u0: p.edges.u0, v0: p.edges.v0 }))}</small></span></li>`;
    }
    const hs = p.holes.filter((x) => x.kind === 'plate' || x.kind === 'slide');
    const kind = hs[0]?.kind === 'slide' ? 'drill.pilots' : 'drill.plateHoles';
    const size = { d: mm(hs[0]?.d ?? 0), depth: mm(hs[0]?.depth ?? 0) };
    const us = [...new Set(hs.map((x) => mm(x.u)))];
    return `<li><span><b>${p.partId}</b> ${esc(p.name)}<small>${esc(tx(`${kind}.${hs[0]?.through ? 'through' : 'blind'}`, { n: hs.length, ...size }))}</small></span><span class="vals">${us.slice(0, 12).join(' · ')}${us.length > 12 ? ` … (+${us.length - 12})` : ''}<small>${esc(tx('drill.heightsFull', { edge: p.edges.u0 }))}</small></span></li>`;
  });
  return `<div class="card hwcard"><h3>${title}: ${esc(c.label)}</h3><ul>${lines.join('')}</ul></div>`;
}

export function renderDrillPart(state, meta) {
  const p = state.model.parts.find((x) => x.id === state.drillPart);
  if (!p) {
    $('#drill-map').innerHTML = '';
    $('#drill-table tbody').innerHTML = '';
    return;
  }
  // the engine numbers the sheet (drawingSheets): the same „Лист n/N“ as in the Drawings tab and drawings.zip
  $('#drill-map').innerHTML = inlineSvg(drawingPart(state.model, meta, p.id));
  const t = words();
  const holes = partHoles(p, t);
  holeLetters(holes);
  const e = edgeLabels(p, t);
  let ch = 0; // the edge holes (Ч1…Чn in Bulgarian) run over the whole part, as in drilling.csv
  $('#drill-axes').textContent = tx('drill.axes', e);
  $('#drill-table tbody').innerHTML =
    holes
      .map(
        (h) =>
          `<tr${h.mark ? ' class="mark"' : ''}><td class="num">${h.no}</td><td class="c"><b>${h.mark ? '—' : h.letter}</b></td><td class="num">${mm(h.u)}</td><td class="num">${mm(h.v)}</td><td class="num">${h.mark ? '—' : `Ø${mm(h.d)}`}</td><td class="num">${h.mark ? esc(tx('drill.noHole')) : h.through ? esc(tx('drill.throughDepth', { d: mm(h.depth) })) : mm(h.depth)}</td><td>${esc(h.purpose)}</td><td>${esc(h.label)}</td></tr>`,
      )
      .join('') +
    p.edgeOps
      .flatMap((op) =>
        op.at.map(
          ([u, v]) =>
            `<tr class="edge"><td class="num">${esc(t('drill.edgeNo', { n: ++ch }))}</td><td class="c"><b>${esc(t('drw.edgeLetter'))}</b></td><td class="num">${mm(u)}</td><td class="num">${mm(v)}</td><td class="num">Ø${mm(op.d)}</td><td class="num">${esc(tx('drill.horizontal', { d: mm(op.depth) }))}</td><td>${esc(tx('drill.inEdge', { edge: edgeOpName(p, e, op.edge) }))}</td><td>${esc(op.label ?? edgePurposeOf(op.kind, t))}</td></tr>`,
        ),
      )
      .join('');
}
