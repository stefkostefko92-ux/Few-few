import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/* Инвариант 12: „палитрата е мерена за контраст, не подбирана на око".
   Този тест е самото мерене. Чете реалните стойности от `public/admin.css` — нищо не
   се преписва тук, иначе тестът щеше да пази своето копие, не продукта.

   Мери се КОМПОЗИТНО: стъклените повърхности са полупрозрачни, значи истинският им цвят
   зависи от това какво е под тях. Под тях е аврората, която се движи — затова всяка
   двойка се смята два пъти (спокоен фон и фон под най-силната ѝ точка) и се взима
   по-лошото. Вдигне ли някой алфа на петно, числото тук пада. */

const CSS = readFileSync('public/admin.css', 'utf8');

type Rgb = readonly [number, number, number];

function parseHex(value: string): Rgb {
  const s = value.trim().replace('#', '');
  const full = s.length === 3 ? [...s].map((c) => c + c).join('') : s;
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as unknown as Rgb;
}

/** Относителна осветеност по WCAG 2.x. */
function luminance([r, g, b]: Rgb): number {
  const channel = (c: number): number => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

/** Полупрозрачен слой върху непрозрачен фон. */
function composite(layer: Rgb, under: Rgb, alpha: number): Rgb {
  return layer.map((v, i) =>
    Math.round(v * alpha + (under[i] ?? 0) * (1 - alpha)),
  ) as unknown as Rgb;
}

/** Стойността на токен от `:root`, с разгърнати вложени `var(--…)`. */
function token(name: string): string {
  const match = CSS.match(new RegExp(`--${name}:\\s*([^;]+);`));
  assert.ok(match?.[1], `липсва токен --${name}`);
  return match[1].replace(/var\(--([\w-]+)\)/g, (_, inner: string) => token(inner)).trim();
}

/** `rgba(r, g, b, a)` → цвят + алфа; чист hex → алфа 1. */
function colorOf(value: string): { rgb: Rgb; alpha: number } {
  const rgba = value.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)/);
  if (rgba) {
    return {
      rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])] as Rgb,
      alpha: rgba[4] === undefined ? 1 : Number(rgba[4]),
    };
  }
  return { rgb: parseHex(value), alpha: 1 };
}

const BG = parseHex(token('bg'));

/** Най-силната точка на аврората: петното с най-високата алфа, легнало върху фона. */
const auroraPeak = ((): Rgb => {
  const layer = CSS.match(/body::before\s*\{[\s\S]*?\n\}/);
  assert.ok(layer, 'аврората липсва — измерването без нея е оптимистично');
  const spots = [...layer[0].matchAll(/rgba\(\s*\d+[,\s]+\d+[,\s]+\d+[,\s]+([\d.]+)\s*\)/g)];
  assert.ok(spots.length > 0, 'аврората е без петна');
  let peak = BG;
  for (const spot of spots) {
    const { rgb, alpha } = colorOf(spot[0]);
    const lit = composite(rgb, BG, alpha);
    if (luminance(lit) > luminance(peak)) peak = lit;
  }
  return peak;
})();

/** Стъклената повърхност и в спокойствие, и осветена отдолу — двата случая за мерене. */
function surfaceStates(name: string): Rgb[] {
  const { rgb, alpha } = colorOf(token(name));
  return [composite(rgb, BG, alpha), composite(rgb, auroraPeak, alpha)];
}

function worstOn(ink: Rgb, backdrops: Rgb[]): number {
  return Math.min(...backdrops.map((bg) => contrast(ink, bg)));
}

test('мастилата държат 4.5:1 върху всяка стъклена повърхност, дори под аврората', () => {
  for (const surface of ['surface', 'surface-2', 'surface-3']) {
    const states = surfaceStates(surface);
    for (const ink of ['text', 'text-2', 'muted']) {
      const ratio = worstOn(parseHex(token(ink)), states);
      assert.ok(ratio >= 4.5, `--${ink} върху --${surface}: ${ratio.toFixed(2)}:1 < 4.5`);
    }
  }
});

test('всеки чип е четим върху собствения си тинт', () => {
  const chips = [...CSS.matchAll(/\.chip\.([\w-]+)\s*\{([\s\S]*?)\}/g)];
  assert.ok(chips.length >= 5, 'чиповете не се намериха — регексът е изостанал от CSS-а');
  const states = surfaceStates('surface');
  for (const [, name, body] of chips) {
    assert.ok(name && body, 'чип без име или тяло — регексът е изостанал от CSS-а');
    // Началото на свойството се иска изрично: иначе `color:` се хваща и вътре в
    // `border-color:` и чипът се мери срещу ръба си вместо срещу текста си.
    const background = body.match(/(?:^|[\s;{])background:\s*([^;]+);/)?.[1];
    const color = body.match(/(?:^|[\s;{])color:\s*([^;]+);/)?.[1];
    assert.ok(background && color, `.chip.${name}: липсва фон или цвят`);
    const expand = (value: string): string =>
      value.replace(/var\(--([\w-]+)\)/g, (_, n: string) => token(n));
    const tint = colorOf(expand(background));
    const ink = colorOf(expand(color)).rgb;
    const ratio = worstOn(
      ink,
      states.map((s) => composite(tint.rgb, s, tint.alpha)),
    );
    assert.ok(ratio >= 4.5, `.chip.${name}: ${ratio.toFixed(2)}:1 < 4.5`);
  }
});

test('графичните цветове държат 3:1 върху фона', () => {
  for (const mark of [
    'accent',
    'accent-2',
    'accent-3',
    'data',
    'good',
    'warn',
    'serious',
    'critical',
  ]) {
    const ratio = contrast(parseHex(token(mark)), BG);
    assert.ok(ratio >= 3, `--${mark} върху фона: ${ratio.toFixed(2)}:1 < 3`);
  }
});

test('мастилото на първичния бутон държи 4.5:1 на всеки стоп от марковия преливник', () => {
  const ink = parseHex(token('accent-ink'));
  const stops = [...token('brand-sweep').matchAll(/#[0-9a-f]{3,6}/gi)];
  assert.ok(stops.length >= 2, 'марковият преливник няма разгърнати стопове');
  for (const [stop] of stops) {
    const ratio = contrast(ink, parseHex(stop));
    assert.ok(ratio >= 4.5, `--accent-ink върху ${stop}: ${ratio.toFixed(2)}:1 < 4.5`);
  }
});
