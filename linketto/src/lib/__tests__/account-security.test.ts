import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminEmailChange, adminGate, isAdminEmail, isWorkingAdmin } from '../admin-list';
import { SESSION_LIMITS, sessionExpired, stepUpFresh, STEP_UP_MS } from '../session-policy';
import { securityNoticeMessage, verifyEmailMessage } from '../account-emails';

// docs/security-2fa-settings-spec.md — критерии 4–10 (логиката; потоците са в server actions).

const env = 'owner@example.com, Second@Example.com';
test('isAdminEmail: само от списъка, без значение от регистъра', () => {
  assert.equal(isAdminEmail('owner@example.com', env), true);
  assert.equal(isAdminEmail('SECOND@example.com', env), true);
  assert.equal(isAdminEmail('other@example.com', env), false);
  assert.equal(isAdminEmail('owner@example.com', ''), false);
  // Един парсер за достъп и аларми: запис, който не е имейл, не дава достъп.
  assert.equal(isAdminEmail('owner', 'owner, a@b.eu'), false);
  assert.equal(isAdminEmail(' A@B.eu ', 'owner, a@b.eu'), true);
});

test('adminGate: имейлът сам не стига — потвърден имейл, 2FA и потвърдена сесия', () => {
  const base = { email: 'owner@example.com', emailVerifiedAt: new Date(), totpEnabledAt: new Date(), mfaAt: new Date() };
  assert.equal(adminGate(base, env), 'ok');
  assert.equal(adminGate({ ...base, email: 'x@y.z' }, env), 'not-admin');
  // Нападател регистрира непотвърден адрес от ADMIN_EMAILS → не е админ.
  assert.equal(adminGate({ ...base, emailVerifiedAt: null }, env), 'verify-email');
  assert.equal(adminGate({ ...base, totpEnabledAt: null }, env), 'enroll-2fa');
  assert.equal(adminGate({ ...base, mfaAt: null }, env), 'step-up');
});

test('сесии: неактивност и абсолютен срок; админът е по-строг', () => {
  const now = Date.UTC(2026, 10, 21, 12);
  const fresh = { createdAt: new Date(now - 60_000), expiresAt: new Date(now + 1e9), lastSeenAt: new Date(now - 60_000) };
  assert.equal(sessionExpired(fresh, false, now), false);
  const idle13h = { ...fresh, lastSeenAt: new Date(now - 13 * 3600_000) };
  assert.equal(sessionExpired(idle13h, false, now), false);
  assert.equal(sessionExpired(idle13h, true, now), true);
  const old2d = { ...fresh, createdAt: new Date(now - 2 * 86_400_000) };
  assert.equal(sessionExpired(old2d, true, now), true);
  assert.equal(sessionExpired({ ...fresh, lastSeenAt: new Date(now - SESSION_LIMITS.user.idle - 1) }, false, now), true);
});

test('step-up: пресен код ≤10 мин.', () => {
  const now = 1_000_000_000;
  assert.equal(stepUpFresh({ mfaAt: null }, now), false);
  assert.equal(stepUpFresh({ mfaAt: new Date(now - STEP_UP_MS) }, now), true);
  assert.equal(stepUpFresh({ mfaAt: new Date(now - STEP_UP_MS - 1) }, now), false);
});


test('писма: потвърждение (екраниран адрес) и известие; непознат език → английски', () => {
  const mail = verifyEmailMessage({ locale: 'bg', url: 'https://x.test/api/verify-email?token=a"b' });
  assert.match(mail.subject, /потвърди/);
  assert.ok(mail.html.includes('token=a&quot;b') && !mail.html.includes('a"b'));
  assert.match(securityNoticeMessage({ locale: 'fi', kind: 'password' }).subject, /security change/);
  assert.ok(securityNoticeMessage({ locale: 'bg', kind: 'backup-used', left: 7 }).html.includes('Остават ти 7'));
});

test('смяна на имейл от админ: чужд акаунт не може да стане админ (нов адрес от ADMIN_EMAILS)', () => {
  // Червен екип (Кодаджията M1): иначе админ/превзета сесия прави втори, траен админ акаунт.
  assert.equal(adminEmailChange({ adminId: 'a', targetId: 'u', current: 'u@x.eu', next: 'owner@example.com', raw: env }), 'forbidden');
  assert.equal(adminEmailChange({ adminId: 'a', targetId: 'u', current: 'u@x.eu', next: 'U@X.eu', raw: env }), 'same');
  assert.equal(adminEmailChange({ adminId: 'a', targetId: 'u', current: 'u@x.eu', next: 'new@x.eu', raw: env }), 'changed');
  // Себе си админът може (пак минава през потвърждение на новия адрес).
  assert.equal(adminEmailChange({ adminId: 'a', targetId: 'a', current: 'owner@example.com', next: 'second@example.com', raw: env }), 'changed');
});

test('защитен админ = адрес от списъка + потвърден имейл (със или без 2FA)', () => {
  // Разбивача F1: непотвърден акаунт, „заел“ админ адрес, може да се изтрие.
  // Разбивача N3: потвърден админ, който още записва 2FA, НЕ може да бъде поет от друг админ.
  const at = new Date();
  assert.equal(isWorkingAdmin({ email: 'owner@example.com', emailVerifiedAt: at, totpEnabledAt: at }, env), true);
  assert.equal(isWorkingAdmin({ email: 'owner@example.com', emailVerifiedAt: null, totpEnabledAt: at }, env), false);
  assert.equal(isWorkingAdmin({ email: 'owner@example.com', emailVerifiedAt: at, totpEnabledAt: null }, env), true);
  assert.equal(isWorkingAdmin({ email: 'x@y.eu', emailVerifiedAt: at, totpEnabledAt: at }, env), false);
});
