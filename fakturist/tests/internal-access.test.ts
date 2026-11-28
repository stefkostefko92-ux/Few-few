import assert from 'node:assert/strict';
import { test } from 'node:test';
import { internalAccess } from '../src/stats/internal-access.js';

/**
 * `/internal/*` (сборовете за петъчния отчет на vpsdash) е само за локален извикващ на сървъра.
 * Приложението е в Docker: отвътре и публичната заявка (през nginx), и локалната (vpsdash) идват от
 * шлюза на Docker, затова IP-то не различава нищо. Различава ги заглавката, която nginx слага ВИНАГИ
 * (`X-Forwarded-For $remote_addr`, deploy/nginx/fakturist.conf) — минала през прокси = скрита.
 */
const TOKEN = 'a'.repeat(64);
const bearer = { authorization: `Bearer ${TOKEN}` };

test('без настроен токен крайната точка я няма (404), каквото и да се прати', () => {
  assert.equal(internalAccess(bearer, undefined), 'hidden');
  assert.equal(internalAccess({}, undefined), 'hidden');
  assert.equal(internalAccess(bearer, ''), 'hidden');
});

test('заявка през прокси е скрита дори с верния токен', () => {
  for (const header of ['x-forwarded-for', 'forwarded', 'x-real-ip']) {
    assert.equal(internalAccess({ ...bearer, [header]: '203.0.113.7' }, TOKEN), 'hidden', header);
  }
  // празна стойност също е знак за прокси
  assert.equal(internalAccess({ ...bearer, 'x-forwarded-for': '' }, TOKEN), 'hidden');
});

test('липсващ, грешен или различен по дължина токен → 401, без изключение', () => {
  assert.equal(internalAccess({}, TOKEN), 'unauthorized');
  assert.equal(
    internalAccess({ authorization: `Bearer ${'b'.repeat(64)}` }, TOKEN),
    'unauthorized',
  );
  assert.equal(internalAccess({ authorization: 'Bearer kratak' }, TOKEN), 'unauthorized');
  assert.equal(internalAccess({ authorization: TOKEN }, TOKEN), 'unauthorized', 'без „Bearer “');
  assert.equal(internalAccess({ authorization: `Basic ${TOKEN}` }, TOKEN), 'unauthorized');
  assert.equal(internalAccess({ authorization: ['x', 'y'] }, TOKEN), 'unauthorized', 'масив');
});

test('верният Bearer токен от локален извикващ минава', () => {
  assert.equal(internalAccess(bearer, TOKEN), 'ok');
  assert.equal(
    internalAccess({ authorization: `bearer ${TOKEN}` }, TOKEN),
    'ok',
    'схемата не зависи от регистъра',
  );
});
