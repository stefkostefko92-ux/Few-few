// Accounts without an administrator: the forms' rules, the links' tokens and the e-mails in the three languages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { LOCALES } from '@/i18n/locales';
import { accountMail } from '../mail-templates';
import { forgotSchema, registerSchema, resetSchema, verifySchema } from '../schemas';
import { hashToken } from '../token-hash';
import { TOKEN_TTL_MS, tokenShapeOk } from '../token-shape';

const form = {
  company: '  Elevatori Brianza srl ', vatNumber: '', city: 'Monza', name: 'Giulia Ferrari', email: ' Giulia@Example.COM ',
  password: 'Ascensore2026sicuro', confirm: 'Ascensore2026sicuro', privacy: 'on', terms: 'on',
};
const codes = (r: { success: boolean; error?: { issues: { message: string }[] } }): string[] => r.error?.issues.map((i) => i.message) ?? [];

test('registrazione: dati puliti, password secondo la regola, le due conferme obbligatorie', () => {
  const ok = registerSchema.safeParse(form);
  assert.ok(ok.success);
  assert.equal(ok.data.email, 'giulia@example.com');
  assert.equal(ok.data.company, 'Elevatori Brianza srl');
  assert.equal(ok.data.vatNumber, null);
  assert.ok(codes(registerSchema.safeParse({ ...form, password: 'corta1', confirm: 'corta1' })).includes('weakPassword'));
  assert.ok(codes(registerSchema.safeParse({ ...form, password: 'solamentelettere', confirm: 'solamentelettere' })).includes('weakPassword'));
  assert.ok(codes(registerSchema.safeParse({ ...form, confirm: 'Ascensore2026diverso' })).includes('passwordMismatch'));
  assert.ok(codes(registerSchema.safeParse({ ...form, privacy: '' })).includes('consentRequired'));
  assert.ok(codes(registerSchema.safeParse({ ...form, terms: 'yes' })).includes('consentRequired'));
  assert.ok(!registerSchema.safeParse({ ...form, email: 'non-una-mail' }).success);
  assert.ok(!forgotSchema.safeParse({ email: 'x' }).success && forgotSchema.safeParse({ email: 'A@B.it' }).success);
});

test('link: 32 byte casuali in base64url, solo l\'hash nel database, vite di 48 ore e di un\'ora', () => {
  const token = randomBytes(32).toString('base64url');
  assert.ok(tokenShapeOk(token));
  for (const bad of ['', token.slice(1), `${token}=`, token.replace(/.$/, '+'), '../../etc/passwd']) assert.ok(!tokenShapeOk(bad), bad);
  assert.match(hashToken(token), /^[0-9a-f]{64}$/);
  assert.notEqual(hashToken(token), token);
  assert.equal(TOKEN_TTL_MS.VERIFY_EMAIL, 48 * 3600_000);
  assert.equal(TOKEN_TTL_MS.RESET_PASSWORD, 3600_000);
  assert.ok(verifySchema.safeParse({ token, password: 'x' }).success && !verifySchema.safeParse({ token: 'abc', password: 'x' }).success);
  assert.ok(codes(resetSchema.safeParse({ token: 'abc', next: 'Ascensore2026sicuro', confirm: 'Ascensore2026sicuro' })).includes('invalidLink'));
});

test('e-mail in tre lingue: il link nel frammento, la durata dal codice, l\'HTML con i caratteri protetti', () => {
  const token = randomBytes(32).toString('base64url'), base = 'https://liftpilot.example';
  for (const l of LOCALES) {
    const v = accountMail({ kind: 'verify', token }, l, base), r = accountMail({ kind: 'reset', token }, l, base), e = accountMail({ kind: 'exists' }, l, base);
    assert.ok(v.text.includes(`${base}/${l}/verify-email#${token}`) && v.html.includes(`${base}/${l}/verify-email#${token}`), l);
    assert.ok(r.text.includes(`${base}/${l}/reset-password#${token}`), l);
    assert.ok(e.text.includes(`${base}/${l}/login`) && e.text.includes(`${base}/${l}/forgot-password`) && !e.text.includes(token), l);
    assert.ok(v.text.includes('48'), `${l}: 48 ore`);
    for (const m of [v, r, e]) {
      assert.ok(m.subject.length > 5 && m.subject.includes('LiftPilot'), `${l}: ${m.subject}`);
      assert.ok(!/[{}]/.test(m.text) && !m.text.includes('undefined'), `${l}: ${m.text}`);
      assert.ok(m.html.includes(`${base}/img/liftpilot-logo-480.png`) && m.html.startsWith('<!doctype html>'), l);
      assert.ok(!/<script|javascript:/i.test(m.html), l);
    }
  }
  // what goes into the HTML is escaped: a quote in a translation cannot close an attribute
  const it = accountMail({ kind: 'verify', token }, 'it', 'https://x.example/"><b>');
  assert.ok(!it.html.includes('"><b>') && it.html.includes('&quot;&gt;&lt;b&gt;'));
});
