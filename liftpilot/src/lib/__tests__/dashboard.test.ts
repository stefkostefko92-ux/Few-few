// The dashboard's figures and the shell's helpers: the search words, the counts of the active installations by their
// latest result, the avatar's initials.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEARCH_MAX_CHARS, SEARCH_MAX_WORDS, initials, projectStats, searchWords, shellSection } from '../dashboard';

test('ricerca: parole ripulite, tagliate, mai rifiutate', () => {
  assert.deepEqual(searchWords(undefined), []);
  assert.deepEqual(searchWords(['a']), []);
  assert.deepEqual(searchWords('   '), []);
  assert.deepEqual(searchWords('  Via   Roma\t12 '), ['Via', 'Roma', '12']);
  assert.equal(searchWords('a b c d e f g').length, SEARCH_MAX_WORDS);
  assert.equal(searchWords('x'.repeat(200))[0]?.length, SEARCH_MAX_CHARS);
});

test('cruscotto: impianti attivi per modulo e per esito dell’ultimo salvataggio', () => {
  const s = projectStats([
    { kind: 'FULL', latest: null },
    { kind: 'FULL', latest: { verdict: 'FAIL', old: true } },
    { kind: 'REPLACEMENT', latest: { verdict: 'WARN', old: false } },
    { kind: 'REPLACEMENT', latest: { verdict: 'OK', old: true } },
    { kind: 'REPLACEMENT', latest: { verdict: 'FAIL', old: false } },
  ]);
  assert.deepEqual(s, { active: 5, replacement: 3, full: 2, noResult: 1, fail: 2, warn: 1, outdated: 2, review: 4 });
  assert.deepEqual(projectStats([]), { active: 0, replacement: 0, full: 0, noResult: 0, fail: 0, warn: 0, outdated: 0, review: 0 });
});

test('iniziali: prime lettere del primo e dell’ultimo nome, qualsiasi alfabeto', () => {
  assert.equal(initials('Marco Rossi'), 'MR');
  assert.equal(initials('  maria  de  luca '), 'ML');
  assert.equal(initials('Иван'), 'И');
  assert.equal(initials('стефан костадинов'), 'СК');
  assert.equal(initials(''), '?');
});

test('barra laterale: la voce della pagina', () => {
  const S = ['/app/norme', '/app/team', '/app/account'];
  const at = (p: string, archived = false, kind: string | null = null) => shellSection(p, { archived, kind }, S);
  assert.equal(at('/app'), 'dashboard');
  assert.equal(at('/app', true), 'archived');
  assert.equal(at('/app/projects/new', false, 'replacement'), 'new-replacement');
  assert.equal(at('/app/projects/new', false, 'full'), 'new-full');
  assert.equal(at('/app/projects/new'), null);
  for (const p of ['/app/projects/abc', '/app/projects/abc/progetto', '/app/calculations/x/locale', '/app/lift-designs/y', '/app/drawing-sets/z']) assert.equal(at(p), 'dashboard', p);
  assert.equal(at('/app/norme'), '/app/norme');
  assert.equal(at('/app/team/invite'), '/app/team');
  assert.equal(at('/app/teams'), null);
  assert.equal(at('/app/prices'), null);
});
