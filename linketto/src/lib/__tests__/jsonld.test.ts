import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeJsonLd } from '../jsonld';

// Регресия за stored XSS: displayName/bio/заглавие на продукт идват от потребител и влизаха
// в <script type="application/ld+json"> през суров JSON.stringify, който НЕ екранира `<`.
// Публичните /u/[slug] и /d/[domain] нямат CSP → escape-ът беше директно експлоатируем.

test('затваря `</script>` escape — суровият низ не оцелява в изхода', () => {
  const out = safeJsonLd({ '@type': 'Person', name: '</script><script>alert(1)</script>' });
  assert.ok(!out.includes('</script>'));
  assert.ok(!out.includes('<'));
});

test('данните остават непокътнати след JSON.parse (търсачките четат верния текст)', () => {
  const name = '</script><script>alert(1)</script>';
  assert.equal(JSON.parse(safeJsonLd({ name })).name, name);
});

test('екранира и U+2028/U+2029 (невалидни в някои JSON парсери)', () => {
  const out = safeJsonLd({ bio: 'ред нов край' });
  assert.ok(!out.includes(' '));
  assert.ok(!out.includes(' '));
  assert.equal(JSON.parse(out).bio, 'ред нов край');
});

test('амперсандът също се екранира (HTML-контекст в атрибут)', () => {
  assert.ok(!safeJsonLd({ t: 'a&b' }).includes('&'));
});

test('масив от обекти (Person + ProductList) минава по същия път', () => {
  const out = safeJsonLd([{ name: '<x>' }, { name: 'ok' }]);
  assert.ok(!out.includes('<'));
  assert.equal(JSON.parse(out)[0].name, '<x>');
});
