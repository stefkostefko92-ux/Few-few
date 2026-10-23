// «Segnala un problema» without a database (round 48): the page a report names is a path of ours (no other site, no
// query, no locale), the error's code is letters and digits, the administrators' filter, and the administrators' e-mail
// says the type and where to read it — never anything typed in the form.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorCode, feedbackFilter, pagePath } from '../feedback';
import { accountMail } from '../mail-templates';

test('la pagina: solo un percorso nostro, senza query né lingua', () => {
  assert.equal(pagePath('/it/app/rilievi/nuovo'), '/app/rilievi/nuovo');
  assert.equal(pagePath('/it'), '/');
  assert.equal(pagePath('/it/app/impianti?q=segreto#x'), '/app/impianti');
  assert.equal(pagePath('/app/projects/cm123/calc'), '/app/projects/cm123/calc');
  assert.equal(pagePath('/italia'), '/italia', 'only the locale segment is dropped');
  for (const bad of ['', 'app', 'https://altro.example/', '//altro.example/x', 'javascript:alert(1)', '/app/../x', '/app/%2e%2e', '/a b', `/${'a'.repeat(300)}`, 7, null]) {
    assert.equal(pagePath(bad), null, String(bad));
  }
});

test('il codice dell’errore e il filtro', () => {
  assert.equal(errorCode(' 2481632 '), '2481632');
  assert.equal(errorCode('E-12ab'), 'E-12ab');
  for (const bad of ['', '<script>', 'a'.repeat(65), 'x y', undefined]) assert.equal(errorCode(bad), null);
  assert.equal(feedbackFilter(undefined), 'open');
  assert.equal(feedbackFilter('tutte'), 'all');
  assert.equal(feedbackFilter(['tutte']), 'open');
});

test('l’e-mail agli amministratori: il tipo e il link, niente di scritto nel modulo', () => {
  for (const [type, words] of [['BUG', 'un problema'], ['IDEA', 'un suggerimento'], ['QUESTION', 'una domanda']] as const) {
    const mail = accountMail({ kind: 'feedback', type }, 'it', 'https://liftpilot.example');
    assert.match(mail.text, new RegExp(words));
    assert.match(mail.text, /https:\/\/liftpilot\.example\/it\/app\/admin\/segnalazioni/);
    assert.match(mail.html, /lang="it"/);
    // the template has no way in for the message: its input is the type alone
    assert.doesNotMatch(mail.text, /\{|\}/);
  }
});
