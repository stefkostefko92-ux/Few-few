// The pieces of furniture of a room (engine/room.js) in the rail: each with its type, its wall, its distance from the
// corner along the wall and its width; added and removed here. The other sizes of a piece are its type's defaults.
// A change is a spec change as any other (bind-rail.js): typing waits a little, a final change recomputes at once,
// adding, removing and changing the type are steps to undo. A room keeps at least one piece (engine/room.js), and the
// keyboard keeps its place when the list is drawn again.
import { TYPES, typeText } from '../engine/types.js';
import { ROOM_TYPES, ROOM_LIMITS, roomWalls } from '../engine/room.js';
import { $, esc } from './dom.js';
import { tx, words } from './text.js';

const widthRange = (type) => TYPES[type].params.find((p) => p.key === 'width');
const signature = (spec) =>
  (spec.items ?? []).map((it) => `${it.type}@${it.wall}`).join('|') + `#${spec.shape}`;
// where the focus goes when the list is next drawn (after a piece is removed, its row is gone)
let focusNext = null;

function rowHtml(it, i, spec) {
  const t = words();
  const n = i + 1;
  const w = widthRange(it.type);
  const id = (k) => `room-${k}-${i}`;
  const types = ROOM_TYPES.map(
    (type) =>
      `<option value="${type}"${type === it.type ? ' selected' : ''}>${esc(typeText(type, t).label)}</option>`,
  ).join('');
  const walls = roomWalls(spec.shape)
    .map(
      (wall) =>
        `<option value="${wall}"${wall === it.wall ? ' selected' : ''}>${esc(t(`wall.${wall}`))}</option>`,
    )
    .join('');
  return `<li class="room-item" data-index="${i}"><span class="room-n">${n}</span>
<div class="field sel"><label for="${id('type')}">${esc(tx('room.type'))}</label><select id="${id('type')}" data-room="type">${types}</select></div>
<div class="field sel"><label for="${id('wall')}">${esc(tx('room.wall'))}</label><select id="${id('wall')}" data-room="wall">${walls}</select></div>
<div class="field"><label for="${id('x')}">${esc(tx('room.x'))}</label><input type="number" id="${id('x')}" data-room="x" min="${ROOM_LIMITS.x[0]}" max="${ROOM_LIMITS.x[1]}" step="10" inputmode="numeric" value="${it.x}"></div>
<div class="field"><label for="${id('width')}">${esc(tx('room.width'))}</label><input type="number" id="${id('width')}" data-room="width" min="${w.min}" max="${w.max}" step="${w.step}" inputmode="numeric" value="${it.params.width}"></div>
${spec.items.length > 1 ? `<button type="button" class="btn btn-small btn-quiet" id="${id('remove')}" data-room-remove aria-label="${esc(tx('room.remove', { n }))}">×</button>` : ''}</li>`;
}

// Draws the list for the spec; while the same pieces are listed it only writes the values the engine took (limits,
// steps), never into the field being typed in.
export function renderRoomItems(spec) {
  const box = $('#room-items');
  if (!box) return;
  box.hidden = spec.type !== 'room';
  if (box.hidden) return;
  const list = $('#room-list');
  const items = spec.items ?? [];
  if (list.dataset.sig !== signature(spec)) {
    // the field in focus is drawn again under the same id: the focus goes back to it
    const focused = list.contains(document.activeElement) ? document.activeElement.id : null;
    list.innerHTML = items.map((it, i) => rowHtml(it, i, spec)).join('');
    list.dataset.sig = signature(spec);
    const target = focusNext ?? focused;
    focusNext = null;
    if (target) document.getElementById(target)?.focus();
  } else {
    items.forEach((it, i) => {
      for (const [k, v] of [
        ['x', it.x],
        ['width', it.params.width],
      ]) {
        const el = $(`#room-${k}-${i}`);
        if (el && el !== document.activeElement) el.value = String(v);
      }
    });
  }
  $('#room-add').disabled = items.length >= ROOM_LIMITS.items;
}

export function bindRoomItems({ state, isReadOnly, remember, recompute, schedule }) {
  const box = $('#room-items');
  if (!box) return;
  const items = () => (state.spec.items ?? []).map((it) => ({ ...it, params: { ...it.params } }));
  const change = (ev, commit) => {
    const el = ev.target.closest('[data-room]');
    if (!el || isReadOnly()) return;
    const i = Number(el.closest('.room-item').dataset.index);
    const next = items();
    const it = next[i];
    const key = el.dataset.room;
    // a select fires input, then change: one choice is one step to undo
    if ((key === 'type' || key === 'wall') && !commit) return;
    if (key === 'type') {
      remember();
      next[i] = { type: el.value, wall: it.wall, x: it.x, params: {} };
    } else if (key === 'wall') {
      remember();
      it.wall = el.value;
    } else if (key === 'x') it.x = Number(el.value);
    else it.params.width = Number(el.value);
    state.spec = { ...state.spec, items: next };
    if (key === 'type' || key === 'wall') void recompute(true);
    else if (commit) schedule(40, true);
    else schedule(400);
  };
  box.addEventListener('input', (ev) => change(ev, false));
  box.addEventListener('change', (ev) => change(ev, true));
  box.addEventListener('click', (ev) => {
    if (isReadOnly()) return;
    const remove = ev.target.closest('[data-room-remove]');
    if (remove) {
      const next = items();
      if (next.length < 2) return;
      remember();
      const i = Number(remove.closest('.room-item').dataset.index);
      next.splice(i, 1);
      // the next piece's ×, the last one's when the last was removed, the add button when one piece is left
      focusNext = next.length > 1 ? `room-remove-${Math.min(i, next.length - 1)}` : 'room-add';
      state.spec = { ...state.spec, items: next };
      void recompute(true);
    } else if (ev.target.closest('#room-add')) {
      remember();
      const next = items();
      if (next.length >= ROOM_LIMITS.items) return;
      // the new piece after the last one on the back wall (the engine says if it does not fit)
      const end = Math.max(
        0,
        ...next.filter((it) => it.wall === 'A').map((it) => it.x + it.params.width),
      );
      next.push({ type: 'nightstand', wall: 'A', x: Math.round(end / 10) * 10, params: {} });
      state.spec = { ...state.spec, items: next };
      void recompute(true);
    }
  });
}
