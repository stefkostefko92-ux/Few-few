import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PROFILE_THEME,
  PROFILE_THEMES,
  THEME_DEFS,
  isProfileTheme,
  resolveProfileTheme,
  safeAccent,
  themeVars,
  type ThemeTokens,
} from '../profile-themes';
import { contrast, mix, over, parseHex, type Rgba } from '../contrast';
import { readableOn } from '../style';

const AA = 4.5;

function px(value: string): Rgba {
  const c = parseHex(value);
  assert.ok(c, `невалиден цвят ${value}`);
  return c;
}

// Комплектите, които посетителят реално вижда (auto = светъл и тъмен).
function sets(id: (typeof PROFILE_THEMES)[number]): ThemeTokens[] {
  const def = THEME_DEFS[id];
  return def.dark ? [def.tokens, def.dark] : [def.tokens];
}

test('всяко ID има пълни токени и валидни цветове', () => {
  for (const id of PROFILE_THEMES) {
    assert.equal(THEME_DEFS[id].id, id);
    for (const tokens of sets(id)) {
      for (const [key, value] of Object.entries(tokens)) {
        if (key === 'glow') continue; // rgba(), не hex
        assert.ok(parseHex(value as string), `${id}.${key}=${value}`);
      }
    }
    const vars = themeVars(id) as Record<string, string>;
    for (const name of [
      '--pf-fg',
      '--pf-muted',
      '--pf-card',
      '--pf-surface',
      '--pf-surface-fg',
      '--pf-hover',
      '--pf-danger',
    ]) {
      assert.ok(vars[name], `${id} без ${name}`);
    }
    assert.ok(vars.backgroundImage);
  }
});

test('старите ID-та са запазени; непознато ID → подразбиране', () => {
  for (const old of ['aurora', 'mono', 'dusk']) assert.ok(isProfileTheme(old));
  assert.equal(resolveProfileTheme('aurora'), 'aurora');
  assert.equal(resolveProfileTheme('nope'), DEFAULT_PROFILE_THEME);
  assert.equal(resolveProfileTheme(''), DEFAULT_PROFILE_THEME);
  assert.equal(resolveProfileTheme(null), DEFAULT_PROFILE_THEME);
  assert.equal(resolveProfileTheme('__proto__'), DEFAULT_PROFILE_THEME);
});

test('auto комбинира светъл и тъмен комплект през light-dark()', () => {
  const vars = themeVars('auto') as Record<string, string>;
  assert.match(vars['--pf-fg'], /^light-dark\(/);
  assert.equal(vars.colorScheme, 'light dark');
  assert.doesNotMatch(String(themeVars('mono')['--pf-fg' as never]), /light-dark/);
});

test('контраст AA: име/био, бутони, плътен акцент — във всяка тема', () => {
  for (const id of PROFILE_THEMES) {
    for (const t of sets(id)) {
      for (const bgHex of [t.bg1, t.bg2, ...(THEME_DEFS[id].sceneColors ?? [])]) {
        const bg = px(bgHex);
        // Текст директно върху фона (мобилно — без карта); темите със сцена
        // държат текста само върху картата.
        const onBg = !THEME_DEFS[id].cardAlways;
        if (onBg) {
          assert.ok(contrast(px(t.fg), bg) >= AA, `${id} fg/bg ${bgHex}`);
          assert.ok(contrast(px(t.muted), bg) >= AA, `${id} muted/bg ${bgHex}`);
          assert.ok(contrast(px(t.danger), bg) >= AA, `${id} danger/bg`);
        }
        // Върху картата (десктоп).
        const card = over(px(t.card), bg);
        assert.ok(contrast(px(t.fg), card) >= AA, `${id} fg/card`);
        assert.ok(contrast(px(t.muted), card) >= AA, `${id} muted/card`);
        assert.ok(contrast(px(t.danger), card) >= AA, `${id} danger/card`);
        // Бутон: повърхност върху картата; най-лошите акценти (бяло/черно)
        // смесени с дела от buttonVars (4% в покой, 9% при hover).
        const base = card;
        const surface = over(px(t.surface), base);
        const hover = over(px(t.surfaceHover), base);
        for (const accent of ['#ffffff', '#000000', '#808080'].map(px)) {
          const rest = mix(accent, surface, 0.04);
          const hov = mix(accent, hover, 0.09);
          assert.ok(
            contrast(px(t.surfaceFg), rest) >= AA,
            `${id} бутон в покой, акцент ${accent.r}`,
          );
          assert.ok(
            contrast(px(t.surfaceFg), hov) >= AA,
            `${id} бутон hover, акцент ${accent.r}`,
          );
        }
        assert.ok(contrast(px(t.surfaceFg), surface) >= AA, `${id} бутон`);
      }
    }
  }
});

test('readableOn винаги е ≥4.5:1 върху плътен акцент (по-добрият от двата)', () => {
  for (const accent of [
    '#3b82c4',
    '#22c55e',
    '#f59e0b',
    '#a855f7',
    '#ef4444',
    '#e7e5e4',
    '#0f172a',
    '#ff00aa',
  ]) {
    const ink = readableOn(accent);
    assert.ok(
      contrast(px(ink), px(accent)) >= AA,
      `${accent} → ${ink}`,
    );
  }
});

test('safeAccent: само hex6', () => {
  assert.equal(safeAccent('#112233'), '#112233');
  assert.equal(safeAccent('red'), '#3b82c4');
  assert.equal(safeAccent(null), '#3b82c4');
});
