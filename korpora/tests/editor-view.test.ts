// Pure parts of the editor's view: the local date in file names, links out to shops, and the zoom and pan
// of a drawing on full screen (editor/panzoom.js) on a stand-in element with an A3 sheet two pixels per unit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../src/paths.js';
import { browserGlobals, editorModule } from './editor-modules.js';

interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface PanZoomLike {
  view: View | null;
  enable(on: boolean): void;
  adopt(): void;
  zoomAt(factor: number, cx: number, cy: number): void;
  pan(dx: number, dy: number): void;
  focus(p: { x: number; y: number }, px: number): void;
}
interface PanZoomModule {
  PanZoom: new (box: object) => PanZoomLike;
  ZOOM_STEP: number;
}
interface DomModule {
  localDate(d?: Date): string;
  externalLink(url: unknown, text: string): string;
  money(v: unknown, cur?: string): string;
  pct(v: number, d?: number): string;
}

const SCREEN = { left: 0, top: 0, width: 840, height: 594 };
let shown = ''; // the viewBox the drawing shows
let current: object | null = null; // the <svg> in the box
let lettering = [3.6, 2.1, 2.6]; // the font sizes of the drawing's texts, in drawing units
const listeners = new Map<string, (ev: object) => void>();

function sheet(label: string, id: string | null = null) {
  return {
    viewBox: { baseVal: { x: 0, y: 0, width: 420, height: 297 } },
    getAttribute: (name: string) =>
      name === 'aria-label' ? label : name === 'data-sheet' ? id : null,
    setAttribute: (name: string, value: string) => {
      if (name === 'viewBox') shown = value;
    },
    getBoundingClientRect: () => SCREEN,
    querySelectorAll: () => lettering.map((size) => ({ size })),
    // screen → drawing for the viewBox on screen (fitted whole: one scale for both axes)
    getScreenCTM: () => {
      const [x = 0, y = 0, w = 420] = shown.split(' ').map(Number);
      return { inverse: () => ({ a: w / SCREEN.width, e: x, f: y }) };
    },
  };
}

class FakePoint {
  constructor(
    readonly x: number,
    readonly y: number,
  ) {}
  matrixTransform(m: { a: number; e: number; f: number }) {
    return { x: m.e + this.x * m.a, y: m.f + this.y * m.a };
  }
}

const box = {
  addEventListener: (type: string, fn: (ev: object) => void) => listeners.set(type, fn),
  querySelector: () => current,
  classList: { toggle: () => true },
  removeAttribute: () => undefined,
  tabIndex: -1,
  getBoundingClientRect: () => SCREEN,
};

browserGlobals({
  MutationObserver: class {
    observe() {}
  },
  DOMPoint: FakePoint,
  getComputedStyle: (text: { size: number }) => ({ fontSize: `${String(text.size)}px` }),
});
const { PanZoom, ZOOM_STEP } = await editorModule<PanZoomModule>('panzoom.js', [
  'PanZoom',
  'ZOOM_STEP',
]);
const { localDate, externalLink, money, pct } = await editorModule<DomModule>('dom.js', [
  'localDate',
  'externalLink',
  'money',
  'pct',
]);

function openSheet(label = 'Лист 1', id: string | null = null): PanZoomLike {
  current = sheet(label, id);
  shown = '';
  const pz = new PanZoom(box);
  pz.enable(true);
  return pz;
}
const viewOf = (pz: PanZoomLike): View => {
  assert.ok(pz.view);
  return pz.view;
};
const under = (pz: PanZoomLike, cx: number, cy: number) => {
  const v = viewOf(pz);
  return { x: v.x + (cx * v.w) / SCREEN.width, y: v.y + (cy * v.w) / SCREEN.width };
};
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test('the date in a file name is the local day, not the UTC one', () => {
  assert.equal(localDate(new Date(2026, 0, 5, 9, 0)), '2026-01-05');
  const tz = process.env.TZ;
  try {
    process.env.TZ = 'Europe/Sofia';
    const night = new Date('2026-10-03T22:30:00Z'); // 01:30 on 4 October in Sofia
    assert.equal(localDate(night), '2026-10-04');
    assert.equal(night.toISOString().slice(0, 10), '2026-10-03');
  } finally {
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  }
});

test('only an https address becomes a link; the rest is escaped text', () => {
  assert.equal(
    externalLink('https://shop.example/x?a=1&b="2"', 'Панта <Blum>'),
    '<a href="https://shop.example/x?a=1&amp;b=&quot;2&quot;" target="_blank" rel="noopener">Панта &lt;Blum&gt;</a>',
  );
  for (const url of ['http://shop.example', 'javascript:alert(1)', ' https://x', '', null, 7])
    assert.equal(externalLink(url, 'Панта <b>'), 'Панта &lt;b&gt;', String(url));
});

test('a price keeps its amount and currency on one line (no-break space)', () => {
  const nbsp = String.fromCharCode(0xa0);
  assert.match(money(2.5, 'EUR'), new RegExp(`^\\S+${nbsp}€$`));
  assert.match(money(12, 'BGN'), new RegExp(`${nbsp}лв\\.$`));
  assert.ok(!money(3, 'EUR').includes(' '), 'no plain space');
  assert.equal(money(Number.NaN, 'EUR'), '—');
  assert.ok(!money(4, undefined).endsWith(nbsp), 'no currency, no trailing space');
});

test('a percentage keeps its sign on the same line, in the editor code and its page', () => {
  const nbsp = String.fromCharCode(0xa0);
  assert.equal(pct(52.34, 1), `52,3${nbsp}%`);
  assert.equal(pct(100), `100${nbsp}%`);
  // the locale test reads only locales/*.json: a number glued to % in the editor's own strings is caught here
  const sources = [
    ...readdirSync(join(ROOT, 'editor'))
      .filter((f) => f.endsWith('.js'))
      .map((f) => join('editor', f)),
    join('views', 'app', 'editor.ejs'),
  ];
  for (const file of sources) {
    const text = readFileSync(join(ROOT, file), 'utf8');
    assert.doesNotMatch(text, /\}%[`<]|>\d+%</, file);
  }
});

test('a drawing opens whole and zooms at the pointer, keeping that point still', () => {
  const pz = openSheet();
  assert.equal(shown, '0 0 420 297');
  const before = under(pz, 210, 150);
  pz.zoomAt(2, 210, 150);
  const after = under(pz, 210, 150);
  assert.ok(close(before.x, after.x) && close(before.y, after.y), JSON.stringify([before, after]));
  assert.deepEqual([viewOf(pz).w, viewOf(pz).h], [210, 148.5]);
  assert.equal(shown, Object.values(viewOf(pz)).join(' '));
});

test('zoom stops at 40 times and at the whole sheet, and keeps the proportions', () => {
  const pz = openSheet();
  pz.zoomAt(1e6, 420, 297);
  assert.ok(close(viewOf(pz).w, 420 / 40), String(viewOf(pz).w));
  pz.zoomAt(1e-6, 0, 0);
  assert.ok(close(viewOf(pz).w, 420) && close(viewOf(pz).h, 297));
});

test('a drag cannot lose the sheet: the middle of the view stays on it', () => {
  const pz = openSheet();
  pz.zoomAt(4, 420, 297);
  pz.pan(1e6, -1e6);
  const v = viewOf(pz);
  assert.deepEqual([v.x + v.w / 2, v.y + v.h / 2], [0, 297]);
});

test('on full screen the keyboard zooms, moves and shows the whole sheet again', () => {
  const pz = openSheet();
  const keydown = listeners.get('keydown');
  assert.ok(keydown);
  const press = (key: string, mods: object = {}) => {
    let prevented = false;
    keydown({ key, ...mods, preventDefault: () => (prevented = true) });
    return prevented;
  };
  assert.equal(press('+'), true);
  assert.ok(close(viewOf(pz).w, 420 / ZOOM_STEP));
  const x = viewOf(pz).x;
  assert.equal(press('ArrowLeft'), true);
  assert.ok(close(viewOf(pz).x, x - (SCREEN.width / 10) * (viewOf(pz).w / SCREEN.width)));
  assert.equal(press('+', { ctrlKey: true }), false, 'the browser zoom is left alone');
  assert.equal(press('x'), false);
  assert.equal(press('0'), true);
  assert.deepEqual(viewOf(pz), { x: 0, y: 0, w: 420, h: 297 });
  pz.enable(false);
  assert.equal(press('+'), false, 'off full screen the keys are the page’s');
});

test('a redraw of the same sheet keeps the view; another sheet starts whole', () => {
  const pz = openSheet('Лист 1');
  pz.zoomAt(2, 100, 100);
  const zoomed = { ...viewOf(pz) };
  current = sheet('Лист 1'); // the CNC simulation redraws every frame
  pz.adopt();
  assert.deepEqual(viewOf(pz), zoomed);
  current = sheet('Лист 2');
  pz.adopt();
  assert.deepEqual(viewOf(pz), { x: 0, y: 0, w: 420, h: 297 });
});

test('two parts with the same name are two sheets: the id tells them apart', () => {
  const name = 'Чертеж с карта за пробиване: М2 Чекмедже 1 страница';
  const pz = openSheet(name, 'P26');
  pz.zoomAt(2, 100, 100);
  const zoomed = { ...viewOf(pz) };
  current = sheet(name, 'P26'); // redrawn: the same part keeps the view
  pz.adopt();
  assert.deepEqual(viewOf(pz), zoomed);
  current = sheet(name, 'P27'); // the other side of the drawer, same name
  pz.adopt();
  assert.deepEqual(viewOf(pz), { x: 0, y: 0, w: 420, h: 297 });
});

test('a click on the page looks closer: the smallest lettering 13 px tall, centred on the spot, on the sheet', () => {
  lettering = [3.6, 2.1, 2.6];
  const pz = openSheet();
  pz.focus({ x: 100, y: 280 }, 13); // the notes, near the bottom edge
  const v = viewOf(pz);
  const scale = SCREEN.width / v.w; // screen pixels per unit
  assert.ok(close(2.1 * scale, 13), String(2.1 * scale));
  assert.ok(close(v.x + v.w / 2, 100), 'centred across');
  assert.ok(close(v.y + v.h, 297), 'held at the bottom of the sheet, not past it');
  assert.ok(v.x >= 0 && v.y >= 0);
  assert.equal(shown, Object.values(v).join(' '));
});

test('a closer look is at least twice the whole sheet and stops at 40 times', () => {
  lettering = [30];
  const pz = openSheet();
  pz.focus({ x: 0, y: 0 }, 13); // lettering already readable: still twice, from the corner
  assert.deepEqual(viewOf(pz), { x: 0, y: 0, w: 210, h: 148.5 });
  lettering = [0.01];
  pz.focus({ x: 210, y: 148.5 }, 13);
  assert.ok(close(viewOf(pz).w, 420 / 40), String(viewOf(pz).w));
  lettering = [];
  pz.focus({ x: 420, y: 297 }, 13); // no text at all: twice
  assert.deepEqual(viewOf(pz), { x: 210, y: 148.5, w: 210, h: 148.5 });
  lettering = [3.6, 2.1, 2.6];
});
