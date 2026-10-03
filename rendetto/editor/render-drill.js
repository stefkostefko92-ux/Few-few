// Пробиване tab: hardware cards (where every hinge, handle and slide goes and which holes it needs), the drilling
// map of the selected part and its full hole table.
import { $, esc, fmt, mm, stat, inlineSvg } from './dom.js';
import { hardwareCards, partHoles, edgeOpName, purposeOf } from '../engine/drill.js';
import { drawingPart, holeLetters } from '../engine/drawing-part.js';
import { edgeLabels } from '../engine/panel.js';

const ROLE_GROUP = [
  ['door', 'Врати'],
  ['drawer-front', 'Фронтове на чекмеджета'],
  ['side', 'Страници'],
  ['partition', 'Делители'],
];

export function renderDrill(state, meta) {
  const { model } = state;
  const drillable = model.parts.filter(
    (p) => p.features.some((f) => f.type === 'hole' || f.type === 'mark') || p.edgeOps.length,
  );
  if (!drillable.some((p) => p.id === state.drillPart))
    state.drillPart = (drillable.find((p) => p.role === 'door') ?? drillable[0])?.id;
  const sel = $('#drill-part');
  const groups = ROLE_GROUP.map(([role, label]) => [
    label,
    drillable.filter((p) => p.role === role),
  ]);
  const rest = drillable.filter((p) => !ROLE_GROUP.some(([r]) => r === p.role));
  sel.innerHTML = [...groups, ['Други детайли', rest]]
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
    stat('Отвори отгоре', fmt(all.length)),
    stat('Чашки на панти', fmt(key('cup'))),
    stat('Планки', fmt(key('plate'))),
    stat('Дръжки', fmt(key('handle'))),
    stat('Водачи', fmt(key('slide'))),
    stat('В челата', fmt(edge)),
  ].join('');
  $('#drill-cards').innerHTML =
    hardwareCards(model).map(cardHtml).join('') ||
    '<p class="note">Този модел няма панти, дръжки или водачи.</p>';
  renderDrillPart(state, meta);
}

function cardHtml(c) {
  const title = { hinge: 'Панта', handle: 'Дръжка', slide: 'Водач' }[c.type];
  const lines = c.parts.map((p) => {
    if (p.cup) {
      return `<li><span><b>${p.partId}</b> ${esc(p.name)}<small>чашка Ø${mm(p.cup.d)} × ${mm(p.cup.depth)}, на ${mm(p.cup.boring)} mm от ръба с пантите (център на ${mm(p.cup.boring + p.cup.d / 2)}); ${p.cup.side === 'left' ? 'ляв' : 'десен'} ръб</small></span><span class="vals">${p.cup.heights.map(mm).join(' · ')}<small>височини от ръб „${esc(p.edges.u0)}“</small></span></li>`;
    }
    if (p.handle) {
      const h = p.holes.filter((x) => x.kind === 'handle' || x.kind === 'handle-mark');
      const what = p.handle.template
        ? 'по шаблона на производителя — без отвори в G-кода'
        : `${p.handle.count} × Ø${mm(p.handle.d)} проходен`;
      return `<li><span><b>${p.partId}</b> ${esc(p.name)}<small>${what}${p.handle.spacing ? `, междуосие ${mm(p.handle.spacing)}` : ''}</small></span><span class="vals">${h.map((x) => `${mm(x.u)} ; ${mm(x.v)}`).join(' · ')}<small>u ; v от ъгъла „${esc(p.edges.u0)}“ / „${esc(p.edges.v0)}“</small></span></li>`;
    }
    const hs = p.holes.filter((x) => x.kind === 'plate' || x.kind === 'slide');
    const kind = hs[0]?.kind === 'slide' ? 'пилотни отвори' : 'отвори за планка';
    const us = [...new Set(hs.map((x) => mm(x.u)))];
    return `<li><span><b>${p.partId}</b> ${esc(p.name)}<small>${hs.length} ${kind} Ø${mm(hs[0]?.d ?? 0)}${hs[0]?.through ? ' проходни' : ` × ${mm(hs[0]?.depth ?? 0)}`}</small></span><span class="vals">${us.slice(0, 12).join(' · ')}${us.length > 12 ? ` … (+${us.length - 12})` : ''}<small>височини от ръб „${esc(p.edges.u0)}“ — пълният списък е в картата и в CSV</small></span></li>`;
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
  $('#drill-map').innerHTML = inlineSvg(drawingPart(state.model, meta, p.id));
  const holes = partHoles(p);
  holeLetters(holes);
  const e = edgeLabels(p);
  $('#drill-axes').textContent =
    `X (u) от ръб „${e.u0}“ към „${e.u1}“ · Y (v) от ръб „${e.v0}“ към „${e.v1}“ · лице А нагоре`;
  $('#drill-table tbody').innerHTML =
    holes
      .map(
        (h) =>
          `<tr${h.mark ? ' class="mark"' : ''}><td class="num">${h.no}</td><td class="c"><b>${h.mark ? '—' : h.letter}</b></td><td class="num">${mm(h.u)}</td><td class="num">${mm(h.v)}</td><td class="num">${h.mark ? '—' : `Ø${mm(h.d)}`}</td><td class="num">${h.mark ? 'без отвор' : h.through ? `${mm(h.depth)} (проходен)` : mm(h.depth)}</td><td>${esc(h.purpose)}</td><td>${esc(h.label)}</td></tr>`,
      )
      .join('') +
    p.edgeOps
      .flatMap((op) =>
        op.at.map(
          ([u, v], i) =>
            `<tr class="edge"><td class="num">Ч${i + 1}</td><td class="c"><b>Ч</b></td><td class="num">${mm(u)}</td><td class="num">${mm(v)}</td><td class="num">Ø${mm(op.d)}</td><td class="num">${mm(op.depth)} хоризонтално</td><td>в чело „${esc(edgeOpName(p, e, op.edge))}“</td><td>${esc(op.label ?? purposeOf(op.kind))}</td></tr>`,
        ),
      )
      .join('');
}
