// Public API of the drawing kernel: paper primitives, model entities, views to scale, dimension chains, symbols, the
// A4 sheet. Pure, no I/O: the drawing set is laid out here and only painted by the SVG and PDF renderers.
export type * from './types';
export type { Chain, Entity, Side, SymbolName } from './model';
export { chain, circle, line, path, rect } from './model';
export { A4, FRAME, STRIP_H, drawingArea, fitted, frame, paragraph, sheetTitle, strip, table } from './sheet';
export type { Cell, SheetMeta } from './sheet';
export { COND, fitSize, textWidth, wrap } from './metrics';
export { FILLS, PALETTE, STYLES, TEXT } from './style';
export type { FillName, StyleName } from './style';
export { SCALES, fitView, moveShapes, renderView, rowsRoom, shapeBox } from './view';
export type { ViewResult } from './view';
export { DIM, chainShapes, rowOffset } from './dims';
export { arrowhead, sectionMark, symbol } from './symbols';
export { box, boundsOf, boxH, boxW, grow, placeAt, rectPts, toPaper, union } from './geom';
export type { Place } from './geom';
export { concreteTile } from './patterns';
export { clipBand } from './clip';
