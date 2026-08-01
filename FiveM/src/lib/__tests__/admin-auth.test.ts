import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { test } from 'node:test';

import { verifyPassword } from '../admin/auth';

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

test('вярната парола минава, грешната не', () => {
  const previous = process.env.ADMIN_PASSWORD_HASH;
  process.env.ADMIN_PASSWORD_HASH = hashFor('дълга-парола-за-теста');

  assert.equal(verifyPassword('дълга-парола-за-теста'), true);
  assert.equal(verifyPassword('дълга-парола-за-тесто'), false);
  assert.equal(verifyPassword(''), false);

  process.env.ADMIN_PASSWORD_HASH = previous;
});

test('без конфигуриран хеш НИКОЯ парола не минава', () => {
  const previous = process.env.ADMIN_PASSWORD_HASH;

  // Незададен: панелът трябва да е затворен, а не отворен за всички.
  delete process.env.ADMIN_PASSWORD_HASH;
  assert.equal(verifyPassword('каквото и да е'), false);
  assert.equal(verifyPassword(''), false);

  // Празен низ и боклук без разделител — същото.
  process.env.ADMIN_PASSWORD_HASH = '';
  assert.equal(verifyPassword(''), false);
  process.env.ADMIN_PASSWORD_HASH = 'няма-двоеточие';
  assert.equal(verifyPassword('няма-двоеточие'), false);

  process.env.ADMIN_PASSWORD_HASH = previous;
});

test('повреден хеш не хвърля, а отказва', () => {
  const previous = process.env.ADMIN_PASSWORD_HASH;

  // Различна дължина на хеша щеше да гръмне `timingSafeEqual`, а изключение
  // в път за автентикация е отказ на услуга, не отказ на достъп.
  process.env.ADMIN_PASSWORD_HASH = 'сол:aabb';
  assert.equal(verifyPassword('каквото и да е'), false);

  process.env.ADMIN_PASSWORD_HASH = 'сол:не-е-шестнайсетично';
  assert.equal(verifyPassword('каквото и да е'), false);

  process.env.ADMIN_PASSWORD_HASH = previous;
});

test('еднакви пароли с различна сол дават различни хешове', () => {
  // Ако солта не участва, два еднакви хеша в две инсталации биха издали, че
  // паролата е една и съща.
  assert.notEqual(hashFor('една и съща').split(':')[1], hashFor('една и съща').split(':')[1]);
});
