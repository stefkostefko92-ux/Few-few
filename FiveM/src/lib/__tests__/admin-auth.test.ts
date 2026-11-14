import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { test } from 'node:test';

import {
  adminHashConfigured,
  parseStoredHash,
  principalIp,
  trustedIpHeader,
  verifyPassword,
} from '../admin/auth';

/**
 * Защитата на панела е единственото в продукта, зад което стоят пари
 * (`featuredUntil`) и чужди лични данни (имейлите в опашката). Непокрита
 * защита е защита, която тихо изчезва при следващия рефактор — затова тези
 * тестове гледат ДОГОВОРА, не имплементацията.
 *
 * Пълният e2e (POST към действие без сесия → отказ и нула странични ефекти)
 * иска жив сървър и е отделен от този пакет, който върви без база и без мрежа.
 */

function hashFor(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

/**
 * Възстановяването на env е в `finally` и минава през `delete`, а не през
 * присвояване. Две причини, и двете хапят тихо:
 *  1. без `finally` провален assert по средата оставя променената стойност и я
 *     наследява СЛЕДВАЩИЯТ тест — тогава пада той, а виновникът е друг;
 *  2. `process.env.X = undefined` в Node записва низа „undefined“, не изтрива
 *     ключа. Тоест „възстанових го“ всъщност оставя боклук.
 */
function withEnv(value: string | undefined, body: () => void): void {
  const previous = process.env.ADMIN_PASSWORD_HASH;
  try {
    if (value === undefined) delete process.env.ADMIN_PASSWORD_HASH;
    else process.env.ADMIN_PASSWORD_HASH = value;
    body();
  } finally {
    if (previous === undefined) delete process.env.ADMIN_PASSWORD_HASH;
    else process.env.ADMIN_PASSWORD_HASH = previous;
  }
}

// ── Принципалът на тавана за вход ───────────────────────────────────────────

/**
 * РЕГРЕСИЯ на блокер. Принципалът се четеше от ВЕРИГА хедъри
 * (`cf-connecting-ip` → `x-real-ip` → `x-forwarded-for`), а нашата nginx
 * конфигурация презаписва само `X-Real-IP`. Другите два идваха направо от
 * клиента, значи: ротиран хедър ⇒ таванът изчезва; хедър с IP-то на
 * собственика ⇒ панелът се заключва за него. Чете се ЕДИН хедър и той е този,
 * който сами презаписваме.
 */
test('принципалът чете САМО довереното име на хедър', () => {
  const forged = { 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '5.6.7.8' } as Record<string, string>;
  assert.equal(principalIp((name) => forged[name] ?? null), 'local', 'подхвърлен хедър е бил приет');

  const real: Record<string, string> = { ...forged, 'x-real-ip': '9.9.9.9' };
  assert.equal(principalIp((name) => real[name] ?? null), '9.9.9.9');
});

test('липсващ или празен хедър дава един и същ принципал, не случаен', () => {
  assert.equal(principalIp(() => null), 'local');
  assert.equal(principalIp(() => '   '), 'local');
  assert.equal(trustedIpHeader(), 'x-real-ip');
});

test('вярната парола минава, грешната не', () => {
  withEnv(hashFor('дълга-парола-за-теста'), () => {
    assert.equal(verifyPassword('дълга-парола-за-теста'), true);
    assert.equal(verifyPassword('дълга-парола-за-тесто'), false);
    assert.equal(verifyPassword(''), false);
  });
});

test('без конфигуриран хеш НИКОЯ парола не минава', () => {
  // Незададен: панелът трябва да е затворен, а не отворен за всички.
  withEnv(undefined, () => {
    assert.equal(verifyPassword('каквото и да е'), false);
    assert.equal(verifyPassword(''), false);
  });

  // Празен низ и боклук без разделител — същото.
  withEnv('', () => assert.equal(verifyPassword(''), false));
  withEnv('няма-двоеточие', () => assert.equal(verifyPassword('няма-двоеточие'), false));
});

test('повреден хеш не хвърля, а отказва', () => {
  // Различна дължина на хеша щеше да гръмне `timingSafeEqual`, а изключение
  // в път за автентикация е отказ на услуга, не отказ на достъп.
  withEnv('сол:aabb', () => assert.equal(verifyPassword('каквото и да е'), false));
  withEnv('сол:не-е-шестнайсетично', () => assert.equal(verifyPassword('каквото и да е'), false));
});

test('възстановяването на env наистина изтрива, не записва „undefined“', () => {
  // Регресия за самия харнес: `process.env.X = undefined` в Node записва низа
  // „undefined“. Тест, който „чисти“ така, оставя боклук за следващия.
  const previous = process.env.ADMIN_PASSWORD_HASH;
  delete process.env.ADMIN_PASSWORD_HASH;
  withEnv('сол:aabb', () => assert.equal(verifyPassword('x'), false));
  assert.equal(process.env.ADMIN_PASSWORD_HASH, undefined, 'остана стойност след withEnv');
  assert.ok(!('ADMIN_PASSWORD_HASH' in process.env), 'ключът трябва да е изтрит, не празен');
  if (previous !== undefined) process.env.ADMIN_PASSWORD_HASH = previous;
});

test('еднакви пароли с различна сол дават различни хешове', () => {
  // Ако солта не участва, два еднакви хеша в две инсталации биха издали, че
  // паролата е една и съща.
  assert.notEqual(hashFor('една и съща').split(':')[1], hashFor('една и съща').split(':')[1]);
});

// ── Кавичките в .env заключваха собственика вън от панела ───────────────────
// `npm run admin:hash` печаташе готовия ред С кавички; `env_file` на Compose ги
// подава БУКВАЛНО, `split(':')` се чупи и вярната парола дава „Грешна парола“
// завинаги. Възпроизведено на живо, преди поправката.

test('обгръщащи кавички и празни места не развалят хеша', () => {
  const salt = 'a'.repeat(32);
  const hash = scryptSync('дълга-парола-123', salt, 64).toString('hex');
  const value = `${salt}:${hash}`;

  for (const stored of [value, `"${value}"`, `'${value}'`, ` ${value} `, `"${value}" `]) {
    const parsed = parseStoredHash(stored);
    assert.notEqual(parsed, null, `не се разчете: ${JSON.stringify(stored)}`);
    assert.equal(parsed?.salt, salt);
  }
});

test('повреден хеш е „не е конфигуриран“, а НЕ „грешна парола“', () => {
  // Разликата е диагностична: сгрешена настройка, представена като сгрешена
  // парола, се търси на грешното място (точно това се случи на живо).
  for (const broken of [undefined, '', 'няма-двоеточие', 'соль:', ':хеш', 'соль:zzzz', 'соль:abc']) {
    assert.equal(parseStoredHash(broken), null, `прие се за валиден: ${JSON.stringify(broken)}`);
  }
});

test('валиден хеш пуска вярната парола и спира грешната', () => {
  const salt = 'b'.repeat(32);
  const hash = scryptSync('правилната', salt, 64).toString('hex');
  process.env.ADMIN_PASSWORD_HASH = `"${salt}:${hash}"`; // нарочно с кавички
  try {
    assert.equal(adminHashConfigured(), true, 'кавичките не бива да значат „няма хеш“');
    assert.equal(verifyPassword('правилната'), true);
    assert.equal(verifyPassword('грешната'), false);
  } finally {
    delete process.env.ADMIN_PASSWORD_HASH;
  }
});
