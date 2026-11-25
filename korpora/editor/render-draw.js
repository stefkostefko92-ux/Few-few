// Чертежи tab: the assembly sheet and one sheet per part (with its drilling map); SVG can be copied as a file text.
import { $, esc, inlineSvg } from './dom.js';
import { tx } from './text.js';
import { drawingAssembly } from '../engine/drawing-assembly.js';
import { drawingPart, drawingSheets } from '../engine/drawing-part.js';

export function renderDrawing(state, meta) {
  const { parts } = drawingSheets(state.model);
  if (state.drawing !== 'assembly' && !parts.some((s) => s.part.id === state.drawing))
    state.drawing = 'assembly';
  const sel = $('#draw-part');
  sel.innerHTML = `<option value="assembly">${esc(tx('sheetOf', { n: 1, title: tx('draw.assembly') }))}</option>${parts.map(({ part, no }) => `<option value="${part.id}">${esc(tx('sheetOf', { n: no, title: `${part.id} ${part.name}` }))}</option>`).join('')}`;
  sel.value = state.drawing;
  // the engine numbers the sheets itself (drawingSheets), as in drawings.zip
  state.svg =
    state.drawing === 'assembly'
      ? drawingAssembly(state.model, meta)
      : drawingPart(state.model, meta, state.drawing);
  $('#drawing').innerHTML = inlineSvg(state.svg);
}
