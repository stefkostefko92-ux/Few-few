import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  backgroundCss,
  buttonCss,
  DEFAULT_STYLE,
  parseStyle,
  readableOn,
} from '../style';

test('parseStyle: null/боклук пада към подразбиранията', () => {
  assert.deepEqual(parseStyle(null), DEFAULT_STYLE);
  assert.deepEqual(parseStyle('junk'), DEFAULT_STYLE);
  assert.equal(parseStyle({ bgStyle: 'nope' }).bgStyle, 'theme');
});

test('parseStyle: валидните полета оцеляват, невалидните падат', () => {
  const style = parseStyle({
    bgStyle: 'gradient',
    bgColor1: '#ff0000',
    bgColor2: 'не-цвят',
    font: 'serif',
    avatarUrl: 'http://insecure.example/a.png', // не е https → отпада
  });
  assert.equal(style.bgStyle, 'gradient');
  assert.equal(style.bgColor1, '#ff0000');
  assert.equal(style.bgColor2, DEFAULT_STYLE.bgColor2);
  assert.equal(style.font, 'serif');
  assert.equal(style.avatarUrl, undefined);
});

test('backgroundCss по режим', () => {
  assert.equal(backgroundCss(DEFAULT_STYLE), undefined); // theme → класове
  assert.deepEqual(
    backgroundCss(parseStyle({ bgStyle: 'solid', bgColor1: '#112233' })),
    { backgroundColor: '#112233' },
  );
  const gradient = backgroundCss(
    parseStyle({ bgStyle: 'gradient', bgColor1: '#112233', bgColor2: '#445566' }),
  );
  assert.ok(String(gradient?.backgroundImage).includes('#445566'));
});

test('readableOn: тъмно → бял текст, светло → тъмен', () => {
  assert.equal(readableOn('#111111'), '#ffffff');
  assert.equal(readableOn('#ffffff'), '#111827');
});

test('buttonCss: solid смята четим цвят на текста', () => {
  const solid = buttonCss(parseStyle({ buttonFill: 'solid' }), '#f5f5f5');
  assert.equal(solid.color, '#111827');
  const outline = buttonCss(parseStyle({ buttonFill: 'outline' }), '#112233');
  assert.equal(outline.backgroundColor, 'transparent');
});
