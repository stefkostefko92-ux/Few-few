// Public API of the drawing kernel: paper primitives, model entities, views to scale, dimension chains, symbols, the
// A4 sheet. Pure, no I/O: the drawing set is laid out here and only painted by the SVG and PDF renderers.
export type * from './types';
export type { Chain, Edit, Entity, PickOption, Side, SymbolName } from './model';
export { chain, circle, edit, line, path, pickEdit, rect } from './model';
export { A4, DIMENSIONS_NOTE, FRAME, STRIP_H, cellLines, drawingArea, fitted, frame, paragraph, rowExtra, sheetTitle, strip, table } from './sheet';
export type { Cell, SheetMeta } from './sheet';
export { COND, fitSize, textBox, textQuad, textWidth, wrap } from './metrics';
export { FILLS, PALETTE, STYLES, TEXT, letterSize } from './style';
export type { FillName, StyleName } from './style';
export { SCALES, TAG_MIN_R, fitView, moveHits, moveShapes, renderView, rowsRoom, shapeBox, tagRadius } from './view';
export type { Hit, ViewResult } from './view';
export { DIM, chainShapes, rowOffset } from './dims';
export { arrowhead, sectionMark, symbol } from './symbols';
export { box, boundsOf, boxH, boxW, grow, placeAt, rectPts, toPaper, union } from './geom';
export type { Place } from './geom';
export { concreteTile } from './patterns';
export { clipBand } from './clip';
