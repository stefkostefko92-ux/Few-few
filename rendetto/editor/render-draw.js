// Чертежи tab: the assembly sheet and one sheet per part (with its drilling map); SVG can be copied as a file text.
import { $, esc, inlineSvg } from './dom.js';
import { drawingAssembly } from '../engine/drawing-assembly.js';
import { drawingPart, drawingParts } from '../engine/drawing-part.js';

export function renderDrawing(state, meta) {
  const parts = drawingParts(state.model);
  if (state.drawing !== 'assembly' && !parts.some((p) => p.id === state.drawing))
    state.drawing = 'assembly';
  const sel = $('#draw-part');
  sel.innerHTML = `<option value="assembly">Лист 1 — сглобен чертеж</option>${parts.map((p, i) => `<option value="${p.id}">Лист ${i + 2} — ${p.id} ${esc(p.name)}</option>`).join('')}`;
  sel.value = state.drawing;
  // the engine numbers the sheets itself (drawingParts), as in drawings.zip
  state.svg =
    state.drawing === 'assembly'
      ? drawingAssembly(state.model, meta)
      : drawingPart(state.model, meta, state.drawing);
  $('#drawing').innerHTML = inlineSvg(state.svg);
}
