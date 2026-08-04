import assert from "node:assert/strict";
import { test } from "node:test";

import { AA, contrastRatio, DARK, LIGHT, parseHex, relativeLuminance, type ThemeTokens } from "../theme";

/** Съобщение с реалното съотношение — иначе провалът не казва КОЛКО не достига. */
function assertContrast(fg: string, bg: string, min: number, what: string) {
  const ratio = contrastRatio(fg, bg);
  assert.ok(
    ratio >= min,
    `${what}: ${fg} върху ${bg} дава ${ratio.toFixed(2)}:1, а трябва ≥ ${min}:1`,
  );
}

test("математиката на контраста е вярна върху известни двойки", () => {
  // Черно върху бяло е максимумът по дефиниция.
  assert.equal(Math.round(contrastRatio("#000000", "#FFFFFF") * 100) / 100, 21);
  assert.equal(contrastRatio("#FFFFFF", "#FFFFFF"), 1);
  assert.equal(relativeLuminance("#000000"), 0);
  assert.equal(relativeLuminance("#FFFFFF"), 1);
  // Съотношението е симетрично — редът на аргументите не променя стойността.
  assert.equal(contrastRatio("#5AB60D", "#050706"), contrastRatio("#050706", "#5AB60D"));
});

test("parseHex отхвърля всичко, което не е #rrggbb", () => {
  assert.deepEqual(parseHex("#5AB60D"), [0x5a, 0xb6, 0x0d]);
  for (const bad of ["5AB60D", "#5AB", "#5AB60DD", "rgb(0,0,0)", ""]) {
    assert.throws(() => parseHex(bad), `трябваше да гръмне: ${bad}`);
  }
});

/**
 * Едно и също изискване за двете теми — светлата не е второразредна.
 * Всеки текстов токен се проверява и върху фона, и върху двете повърхности,
 * защото картите се ползват навсякъде в резултата.
 */
for (const [name, theme] of Object.entries({ тъмна: DARK, светла: LIGHT }) as [string, ThemeTokens][]) {
  test(`${name} тема — текстът е четим върху всяка повърхност (WCAG AA)`, () => {
    for (const surface of [theme.bg, theme.surface, theme.surfaceRaised]) {
      assertContrast(theme.text, surface, AA.text, `${name}: основен текст`);
      assertContrast(theme.textMuted, surface, AA.text, `${name}: второстепенен текст`);
      assertContrast(theme.textFaint, surface, AA.text, `${name}: най-слабият текст`);
    }
  });

  test(`${name} тема — състоянията и акцентът минават за текст`, () => {
    for (const surface of [theme.bg, theme.surface, theme.surfaceRaised]) {
      assertContrast(theme.accent, surface, AA.text, `${name}: акцент`);
      assertContrast(theme.ok, surface, AA.text, `${name}: „наред“`);
      assertContrast(theme.warn, surface, AA.text, `${name}: предупреждение`);
      assertContrast(theme.danger, surface, AA.text, `${name}: опасност`);
      assertContrast(theme.info, surface, AA.text, `${name}: информация`);
    }
  });

  test(`${name} тема — текстът върху акцентен бутон е четим`, () => {
    assertContrast(theme.onAccent, theme.accent, AA.text, `${name}: текст върху бутон`);
  });

  test(`${name} тема — ръбовете се виждат (нетекстов контраст)`, () => {
    // Ръбът носи смисъл (разделя карти, маркира фокус) → важи прагът 3:1.
    assertContrast(theme.borderStrong, theme.bg, AA.nonText, `${name}: силен ръб`);
    assertContrast(theme.borderStrong, theme.surface, AA.nonText, `${name}: силен ръб върху карта`);
  });

  test(`${name} тема — състоянията се различават и помежду си`, () => {
    // Ако „опасност“ и „предупреждение“ са почти един цвят, формата и текстът
    // остават единственият сигнал — а те и без това са задължителни.
    assert.ok(
      contrastRatio(theme.danger, theme.ok) >= 1.4,
      `${name}: „опасност“ и „наред“ са твърде близки`,
    );
  });

  test(`${name} тема — всеки токен е валиден HEX`, () => {
    for (const [token, value] of Object.entries(theme)) {
      assert.doesNotThrow(() => parseHex(value), `${name}: токенът ${token} не е валиден HEX`);
    }
  });
}

test("тъмната тема наистина е тъмна, светлата — светла", () => {
  assert.ok(relativeLuminance(DARK.bg) < 0.05);
  assert.ok(relativeLuminance(LIGHT.bg) > 0.7);
});
