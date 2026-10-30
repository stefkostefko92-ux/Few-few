// Accounts without an administrator: the forms' rules, the links' tokens and the e-mails, in Italian.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DEFAULT_LOCALE, LOCALES, isLocale } from '@/i18n/locales';
import { accountMail } from '../mail-templates';
import { forgotSchema, registerSchema, resetSchema, verifySchema } from '../schemas';
import { REGISTER_CONSENTS } from '../consents';
import { hashToken } from '../token-hash';
import { BETA_INVITE_DAYS, BETA_INVITE_KEEP_DAYS, TOKEN_TTL_MS, tokenShapeOk } from '../token-shape';

const form = {
  company: '  Elevatori Brianza srl ', vatNumber: '', city: 'Monza', name: 'Giulia Ferrari', email: ' Giulia@Example.COM ',
  password: 'Ascensore2026sicuro', confirm: 'Ascensore2026sicuro', accept: 'on', business: 'on', drafts: 'on',
};
const codes = (r: { success: boolean; error?: { issues: { message: string }[] } }): string[] => r.error?.issues.map((i) => i.message) ?? [];

test('registrazione: dati puliti, password secondo la regola, le tre conferme obbligatorie (le clausole dopo, dal link)', () => {
  const ok = registerSchema.safeParse(form);
  assert.ok(ok.success);
  assert.equal(ok.data.email, 'giulia@example.com');
  assert.equal(ok.data.company, 'Elevatori Brianza srl');
  assert.equal(ok.data.vatNumber, null);
  assert.ok(codes(registerSchema.safeParse({ ...form, password: 'corta1', confirm: 'corta1' })).includes('weakPassword'));
  assert.ok(codes(registerSchema.safeParse({ ...form, password: 'solamentelettere', confirm: 'solamentelettere' })).includes('weakPassword'));
  assert.ok(codes(registerSchema.safeParse({ ...form, confirm: 'Ascensore2026diverso' })).includes('passwordMismatch'));
  // the specific approval of the clauses is not asked here: it is given on the page of the e-mail link, with the password
  assert.ok(registerSchema.safeParse({ ...form, clauses: '' }).success);
  for (const k of REGISTER_CONSENTS) {
    assert.ok(codes(registerSchema.safeParse({ ...form, [k]: '' })).includes('consentRequired'), k);
    assert.ok(codes(registerSchema.safeParse({ ...form, [k]: 'yes' })).includes('consentRequired'), k);
  }
  assert.ok(!registerSchema.safeParse({ ...form, email: 'non-una-mail' }).success);
  assert.ok(!forgotSchema.safeParse({ email: 'x' }).success && forgotSchema.safeParse({ email: 'A@B.it' }).success);
});

test('link: 32 byte casuali in base64url, solo l’hash nel database, vite di 48 ore e di un’ora', () => {
  const token = randomBytes(32).toString('base64url');
  assert.ok(tokenShapeOk(token));
  for (const bad of ['', token.slice(1), `${token}=`, token.replace(/.$/, '+'), '../../etc/passwd']) assert.ok(!tokenShapeOk(bad), bad);
  assert.match(hashToken(token), /^[0-9a-f]{64}$/);
  assert.notEqual(hashToken(token), token);
  assert.equal(TOKEN_TTL_MS.VERIFY_EMAIL, 48 * 3600_000);
  assert.equal(TOKEN_TTL_MS.RESET_PASSWORD, 3600_000);
  assert.ok(verifySchema.safeParse({ token, password: 'x', clauses: '', accept: '' }).success && !verifySchema.safeParse({ token: 'abc', password: 'x', clauses: '', accept: '' }).success);
  // a tick counts only as 'on'; an empty password passes the schema — the action asks for it, never calls the link bad
  assert.deepEqual(verifySchema.parse({ token, password: '', clauses: 'yes', accept: 'on' }), { token, password: '', clauses: false, accept: true });
  assert.ok(!verifySchema.safeParse({ token, password: 'x'.repeat(201), clauses: 'on', accept: '' }).success, 'a password over 200 characters');
  assert.ok(codes(resetSchema.safeParse({ token: 'abc', next: 'Ascensore2026sicuro', confirm: 'Ascensore2026sicuro' })).includes('invalidLink'));
});

test('e-mail in italiano: il link nel frammento, la durata dal codice, l’HTML con i caratteri protetti', () => {
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

test('invito alla beta: il link della registrazione con il token, la durata dal codice; la conferma annuncia le clausole', () => {
  const token = randomBytes(32).toString('base64url'), base = 'https://liftpilot.example';
  const m = accountMail({ kind: 'betaInvite', token }, 'it', base);
  // the token in the fragment, like every e-mail link: never sent to the server, never in a log or a Referer
  assert.ok(m.text.includes(`${base}/it/register#${token}`) && m.html.includes(`${base}/it/register#${token}`));
  assert.ok(!m.text.includes('?invito=') && !m.html.includes('?invito='));
  assert.ok(m.text.includes(`${BETA_INVITE_DAYS} giorni`) && m.subject.includes('LiftPilot'));
  assert.ok(!/[{}]/.test(m.text) && !m.text.includes('undefined'));
  // why we have the address and how long we keep it, with the privacy page (art. 13 GDPR)
  assert.match(m.text, /hai chiesto di partecipare alla beta/);
  assert.ok(m.text.includes(`fino a ${BETA_INVITE_KEEP_DAYS} giorni dopo la scadenza del link`) && m.text.includes(`${base}/it/privacy`));
  const v = accountMail({ kind: 'verify', token, terms: true }, 'it', base);
  assert.match(v.text, /approverai specificamente, con la tua password, le clausole/);
  assert.ok(v.text.includes(`${base}/it/privacy#terms`));
});

test('una lingua salvata che non è più dell’interfaccia (en, bg) dà le e-mail in italiano', () => {
  const base = 'https://liftpilot.example', it = accountMail({ kind: 'inactive', deletion: new Date('2027-01-31T00:00:00Z') }, 'it', base);
  for (const stored of ['en', 'bg', '', null]) {
    // what every caller does with the stored language (inactive.ts, legal-notice.ts, user-actions.ts)
    const l = isLocale(stored) ? stored : DEFAULT_LOCALE;
    assert.equal(l, 'it', String(stored));
    const m = accountMail({ kind: 'inactive', deletion: new Date('2027-01-31T00:00:00Z') }, l, base);
    assert.deepEqual(m, it);
    assert.ok(m.html.startsWith('<!doctype html>\n<html lang="it">') && m.text.includes(`${base}/it/login`), String(stored));
  }
});
