// Чертежи tab: the assembly sheet and one sheet per part (with its drilling map); SVG can be copied as a file text.
import { $, esc, inlineSvg } from './dom.js';
import { drawingAssembly } from '../engine/drawing-assembly.js';
import { drawingPart } from '../engine/drawing-part.js';

export function renderDrawing(state, meta) {
  const parts = state.model.parts.filter((p) => p.role !== 'back' && p.role !== 'drawer-bottom');
  const n = parts.length + 1;
  if (state.drawing !== 'assembly' && !parts.some((p) => p.id === state.drawing))
    state.drawing = 'assembly';
  const sel = $('#draw-part');
  sel.innerHTML = `<option value="assembly">Лист 1 — сглобен чертеж</option>${parts.map((p, i) => `<option value="${p.id}">Лист ${i + 2} — ${p.id} ${esc(p.name)}</option>`).join('')}`;
  sel.value = state.drawing;
  const idx = parts.findIndex((p) => p.id === state.drawing);
  state.svg =
    state.drawing === 'assembly'
      ? drawingAssembly(state.model, meta, 1, n)
      : drawingPart(state.model, meta, state.drawing, idx + 2, n);
  $('#drawing').innerHTML = inlineSvg(state.svg);
}
