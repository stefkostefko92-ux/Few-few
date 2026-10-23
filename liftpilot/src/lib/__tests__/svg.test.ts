// The SVG serializer (round 50): the same painting as the screen's ShapesSvg for a real sheet — every line, outline,
// circle, arc, lettering (position, size, weight, anchor, width, turn, colour) and logo, attribute by attribute —, the
// halos as a stroked copy under the letters, a file that any XML parser reads whatever the texts hold (escaped, the
// characters XML forbids dropped, a logo that is not base64 left out), its size in millimetres, the concrete pattern only
// when used and laid as the PDF lays it, no class or data attributes, and the PDF's line under the frame word for word.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ShapesSvg from '@/components/drawing/ShapesSvg';
import { PALETTE, concreteTile, type Shape } from '@/drawing';
import { NOTICE, esc, lettering, shapesSvg, xmlChars, type SvgArt } from '../cad/svg';
import { buildTavole } from '../tavole/build';
import { elements, parseXml, textOf, type El } from './xml-check';
import { svgSample } from './svg-fixture';

// tsx compiles the component's JSX for the classic runtime here (the app's tsconfig preserves JSX for Next)
Object.assign(globalThis, { React });

const ART: SvgArt = { palette: PALETTE, patterns: { concrete: concreteTile() }, images: {} };
const HEAD = { id: 'x', title: 'Prova', desc: ['Prova'] };
const doc = buildTavole(svgSample()).doc;

/** The drawn elements of a file or of the screen's markup: what its group of shapes holds. */
const drawn = (xml: string): El[] => {
  const g = elements(parseXml(xml)).find((e) => e.name === 'g');
  assert.ok(g, 'the group of the shapes');
  return elements(g);
};

/** What both painters must agree on, by element. */
const KEYS: Readonly<Record<string, readonly string[]>> = {
  line: ['x1', 'y1', 'x2', 'y2', 'stroke', 'stroke-width', 'stroke-dasharray'],
  polygon: ['points', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray'],
  polyline: ['points', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray'],
  circle: ['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray'],
  path: ['d', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray'],
  text: ['x', 'y', 'font-size', 'font-weight', 'text-anchor', 'textLength', 'lengthAdjust', 'fill', 'transform'],
  image: ['href', 'x', 'y', 'width', 'height', 'preserveAspectRatio'],
};
/** (the pattern's id has each painter's prefix) */
const pick = (e: El): Record<string, string | undefined> => Object.fromEntries([
  ['tag', e.name], ...(KEYS[e.name] ?? []).map((k) => [k, e.attrs[k]?.replace(/^url\(#[\w-]+-concrete\)$/, 'url(#concrete)')]), ['text', e.name === 'text' ? textOf(e) : undefined],
]);

test('un foglio vero: la stessa geometria di ShapesSvg, attributo per attributo; gli aloni come copia tracciata sotto', () => {
  for (const [i, page] of doc.pages.entries()) {
    const screen = renderToStaticMarkup(React.createElement(ShapesSvg, { shapes: page.shapes, w: page.w, h: page.h, id: 'p', label: 'x', images: doc.images }));
    const file = drawn(shapesSvg(page.shapes, page.w, page.h, doc, HEAD));
    const mine = file.filter((e) => !(e.name === 'text' && e.attrs.stroke));
    const theirs = drawn(screen);
    assert.deepEqual(mine.map(pick), theirs.map(pick), `foglio ${i + 1}`);
    // each halo of the screen (paint-order: stroke) is a paper-coloured copy right before its lettering in the file
    const halos = theirs.filter((e) => e.attrs['paint-order'] === 'stroke');
    const copies = file.filter((e) => e.name === 'text' && e.attrs.stroke);
    assert.equal(copies.length, halos.length, `foglio ${i + 1}: aloni`);
    for (const c of copies) {
      const next = file[file.indexOf(c) + 1];
      assert.ok(next && textOf(next) === textOf(c) && next.attrs.x === c.attrs.x && next.attrs.textLength === c.attrs.textLength);
      assert.equal(c.attrs.stroke, PALETTE.paper);
      assert.equal(c.attrs['stroke-width'], '0.9');
      assert.equal(c.attrs.fill, PALETTE.paper);
    }
    if (i === 0) assert.ok(file.some((e) => e.name === 'image'), 'il logo sul foglio 1');
  }
});

test('il file: dimensioni in mm, titolo e descrizione, logo con href e xlink:href, nessuna classe né data-*', () => {
  const page = doc.pages[0];
  assert.ok(page);
  const svg = shapesSvg(page.shapes, page.w, page.h, doc, { id: 'f01', title: 'Tavole 26-037 & <x>', desc: ['DIS. N° 26-037 R0', 'SHA-256 0123456789abcdef'] });
  assert.ok(svg.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1"'));
  const root = parseXml(svg), all = elements(root);
  assert.equal(root.attrs.width, '210mm');
  assert.equal(root.attrs.height, '297mm');
  assert.equal(root.attrs.viewBox, '0 0 210 297');
  assert.equal(textOf(all.find((e) => e.name === 'title') ?? root), 'Tavole 26-037 & <x>');
  assert.equal(textOf(all.find((e) => e.name === 'desc') ?? root), 'DIS. N° 26-037 R0\nSHA-256 0123456789abcdef');
  const img = all.find((e) => e.name === 'image');
  assert.ok(img?.attrs.href?.startsWith('data:image/png;base64,'));
  assert.equal(img?.attrs['xlink:href'], img?.attrs.href);
  for (const e of [root, ...all]) assert.ok(!Object.keys(e.attrs).some((k) => k === 'class' || k.startsWith('data-')), e.name);
  assert.ok(!/paint-order/.test(svg));
});

test('testi qualsiasi: XML ben formato, caratteri vietati tolti, «&», «<», virgolette escape; un logo non base64 fuori', () => {
  const nasty = 'Rossi & C. <script>alert(1)</script> "a" \'b\' \u0001\u0007\u001b￾￿\uD800 ]]> fine';
  const shapes: Shape[] = [
    { t: 'text', at: [10, 10], text: nasty, size: 3, halo: true },
    { t: 'text', at: [10, 20], text: 'Grassetto ×', size: 3, bold: true, angle: 90, align: 'c' },
    { t: 'image', ref: 'logo', box: { x0: 0, y0: 0, x1: 10, y1: 10 } },
  ];
  const art: SvgArt = { ...ART, images: { logo: { mime: 'image/png', data: '"><script>alert(1)</script>' } } };
  const svg = shapesSvg(shapes, 100, 50, art, { id: '"><x', title: '</title><script>', desc: ['&amp; <desc>'], notice: true });
  const root = parseXml(svg), all = elements(root);
  assert.ok(!all.some((e) => e.name === 'script' || e.name === 'image'));
  assert.ok(!svg.includes('<script'));
  const clean = 'Rossi & C. <script>alert(1)</script> "a" \'b\'  ]]> fine';
  assert.equal(xmlChars(nasty), clean);
  assert.deepEqual(all.filter((e) => e.name === 'text').map(textOf), [clean, clean, 'Grassetto ×', NOTICE]);
  assert.equal(textOf(all.find((e) => e.name === 'title') ?? root), '</title><script>');
  assert.equal(esc('a&b<c>"\'\u0002'), 'a&amp;b&lt;c&gt;&quot;&apos;');
  // the letters a subset needs: as written, the forbidden ones out
  const used = lettering(shapes);
  assert.ok(!used.regular.has(1) && !used.regular.has(0xfffe) && used.regular.has('<'.codePointAt(0) ?? 0));
  assert.deepEqual([...used.bold].sort((a, b) => a - b), [...new Set('Grassetto ×')].map((c) => c.codePointAt(0) ?? 0).sort((a, b) => a - b));
});

test('il motivo del calcestruzzo solo se usato, posato dall’angolo in basso a sinistra come nel PDF', () => {
  const line: Shape = { t: 'line', a: [0, 0], b: [10, 10], s: { ink: 'ink', w: 0.25 } };
  assert.ok(!shapesSvg([line], 50, 40, ART, HEAD).includes('<pattern'));
  const wall: Shape = { t: 'path', pts: [[0, 0], [10, 0], [10, 10]], closed: true, fill: { k: 'pattern', id: 'concrete' } };
  const pat = elements(parseXml(shapesSvg([line, wall], 50, 40.5, ART, HEAD))).filter((e) => e.name === 'pattern');
  assert.equal(pat.length, 1);
  assert.deepEqual([pat[0]?.attrs.x, pat[0]?.attrs.y, pat[0]?.attrs.width], ['0', '40.5', '24']);
  assert.equal(elements(parseXml(shapesSvg([wall], 50, 40, ART, HEAD))).find((e) => e.name === 'polygon' && e.attrs.points?.startsWith('0,40'))?.attrs.fill, 'url(#sx-concrete)');
});

test('la riga sotto la cornice è quella del PDF (report/tavole.py), parola per parola', () => {
  const py = readFileSync('report/tavole.py', 'utf8'), m = /NOTICE = \(([\s\S]*?)\)\n/.exec(py);
  assert.ok(m?.[1]);
  const text = [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]).join('');
  assert.equal(text, NOTICE);
  const svg = shapesSvg([], 210, 297, ART, { ...HEAD, notice: true }), notice = elements(parseXml(svg)).find((e) => e.name === 'text');
  assert.deepEqual([notice?.attrs.x, notice?.attrs.y, notice?.attrs['font-size'], notice?.attrs.fill], ['8', '293.8', '1.83', '#616161']);
});
