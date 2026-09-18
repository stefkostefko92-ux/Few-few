// Smoke тестове за съдържателните render функции (src/approfondimenti.js):
// извикваме чистите render-и с минимални fixtures и проверяваме, че връщат
// непразен, валиден HTML стринг с очакваните котви и че esc е приложен.
// Без данни, без мрежа — само детерминистичен изход.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderGlossario,
  renderGuida,
  renderAccessibilita,
  renderStorie,
  renderPnrr,
} from '../src/approfondimenti.js';

// Помощник: базови инварианти на всяка цяла страница.
function assertPagina(h, h1) {
  assert.equal(typeof h, 'string');
  assert.ok(h.length > 500, 'непразен HTML');
  assert.ok(h.startsWith('<!doctype html>'));
  assert.ok(h.includes('</html>'));
  assert.ok(h.includes(`<h1>${h1}`), `съдържа заглавие „${h1}"`);
}

test('renderGlossario — цяла страница + FAQ JSON-LD', () => {
  const h = renderGlossario();
  assertPagina(h, 'Glossario');
  assert.ok(h.includes('application/ld+json'));
  assert.ok(h.includes('FAQPage'));
});

test('renderGuida — цяла страница с петте стъпки', () => {
  const h = renderGuida();
  assertPagina(h, 'Come verificare un appalto');
  assert.ok(h.includes('accesso civico')); // ключова секция (FOIA)
});

test('renderAccessibilita — декларация за достъпност', () => {
  const h = renderAccessibilita();
  assertPagina(h, 'Accessibilità');
  assert.ok(h.includes('WCAG'));
});

test('renderStorie — индекс на разказите', () => {
  const h = renderStorie();
  assert.equal(typeof h, 'string');
  assert.ok(h.startsWith('<!doctype html>'));
  assert.ok(h.length > 500);
});

test('renderPnrr — таблица по региони с реални fixtures', () => {
  const regionale = [
    { key: 'lombardia', nome: 'Lombardia', pnrrImporto: 5_000_000, importo: 20_000_000 },
    { key: 'lazio', nome: 'Lazio', pnrrImporto: 1_000_000, importo: 10_000_000 },
    { key: 'molise', nome: 'Molise', pnrrImporto: 0, importo: 500_000 }, // без PNRR → извън таблицата
  ];
  const h = renderPnrr({ regionale, href: (x) => x });
  assertPagina(h, 'Il PNRR nella sanità');
  assert.ok(h.includes('Lombardia'));
  assert.ok(h.includes('Lazio'));
  // регион без PNRR средства не влиза в списъка
  assert.ok(!h.includes('Molise'));
});

test('renderPnrr — esc се прилага върху имената на регионите', () => {
  // враждебно име: ако esc не се приложи, ще пробие като <script>
  const regionale = [
    { key: '', nome: '<script>alert(1)</script>', pnrrImporto: 100, importo: 1000 },
  ];
  const h = renderPnrr({ regionale, href: (x) => x });
  assert.ok(h.includes('&lt;script&gt;'));
  assert.ok(!h.includes('<script>alert(1)</script>'));
});
