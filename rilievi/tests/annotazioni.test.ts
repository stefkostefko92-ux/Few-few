// Annotations on a photo (the owner, 12 November 2026 — point C5): the elements of the sketch editor, drawn
// over the photo on the 1400 × 1000 sheet where the photo stands whole and centred. The same window gives
// the overlay of the print, of the PDF and of the gallery tile (the tile crops to 4:3, centred).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { annotazioniDa, finestraRiquadro, rettangoloFoto } from '../src/allegati/annotazioni.js';

describe('photo annotations', () => {
  it('place the photo whole and centred on the sheet', () => {
    const tondo = (r: { x: number; y: number; w: number; h: number }) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v * 1000) / 1000]));
    assert.deepEqual(tondo(rettangoloFoto(4000, 3000)), { x: 33.333, y: 0, w: 1333.333, h: 1000 });
    assert.deepEqual(rettangoloFoto(2000, 1000), { x: 0, y: 150, w: 1400, h: 700 });
    assert.deepEqual(rettangoloFoto(1400, 1000), { x: 0, y: 0, w: 1400, h: 1000 });
    assert.deepEqual(rettangoloFoto(1000, 2000), { x: 450, y: 0, w: 500, h: 1000 });
    assert.deepEqual(rettangoloFoto(0, 0), { x: 0, y: 0, w: 1400, h: 1000 });
  });

  it('give the window a 4:3 tile shows', () => {
    // A tall photo: the middle band.
    const alta = finestraRiquadro(rettangoloFoto(1000, 2000), 4 / 3);
    assert.equal(alta.x, 450);
    assert.equal(alta.w, 500);
    assert.equal(alta.h, 375);
    assert.equal(alta.y, (1000 - 375) / 2);
    // A wide photo: the middle columns.
    const larga = finestraRiquadro(rettangoloFoto(2000, 1000), 4 / 3);
    assert.equal(larga.h, 700);
    assert.ok(Math.abs(larga.w - (700 * 4) / 3) < 1e-9);
    assert.ok(Math.abs(larga.x - (1400 - (700 * 4) / 3) / 2) < 1e-9);
  });

  it('read only valid sheets; an empty one is no annotation', () => {
    const linea = { t: 'p', d: 'M100 100l200 0', c: 'r', s: 2 };
    assert.deepEqual(annotazioniDa({ e: [linea] }), { e: [linea] });
    assert.deepEqual(annotazioniDa(JSON.stringify({ e: [linea] })), { e: [linea] });
    assert.equal(annotazioniDa({ e: [] }), null);
    assert.equal(annotazioniDa({ e: [{ t: 'z' }] }), null);
    assert.equal(annotazioniDa('not json'), null);
    assert.equal(annotazioniDa(null), null);
    assert.equal(annotazioniDa({ e: Array.from({ length: 5000 }, () => linea) }), null);
  });
});
