// The dashboard's figures and the shell's helpers: the search words, the counts of the active installations by their
// latest result, the avatar's initials.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEARCH_MAX_CHARS, SEARCH_MAX_WORDS, idsDelTipo, initials, likeEscape, navCurrent, projectStats, searchWords, shellSection, tipoFiltroOf } from '../dashboard';

test('ricerca: parole ripulite, tagliate, mai rifiutate', () => {
  assert.deepEqual(searchWords(undefined), []);
  assert.deepEqual(searchWords(['a']), []);
  assert.deepEqual(searchWords('   '), []);
  assert.deepEqual(searchWords('  Via   Roma\t12 '), ['Via', 'Roma', '12']);
  assert.equal(searchWords('a b c d e f g').length, SEARCH_MAX_WORDS);
  assert.equal(searchWords('x'.repeat(200))[0]?.length, SEARCH_MAX_CHARS);
});

test('cruscotto: impianti attivi per tipo di intervento e per esito dell’ultimo salvataggio', () => {
  const s = projectStats([
    { tipo: null, latest: null },
    { tipo: 'TRASFORMAZIONE_COMPLETA', latest: { verdict: 'FAIL', old: true } },
    { tipo: 'SOLO_ARGANO', latest: { verdict: 'WARN', old: false } },
    { tipo: 'SOLO_ARGANO', latest: { verdict: 'OK', old: true } },
    { tipo: 'AMMODERNAMENTO', latest: { verdict: 'FAIL', old: false } },
  ]);
  assert.deepEqual(s, { active: 5, soloArgano: 2, ammodernamento: 1, trasformazione: 1, daDefinire: 1, noResult: 1, fail: 2, warn: 1, outdated: 2, review: 4 });
  assert.deepEqual(projectStats([]), { active: 0, soloArgano: 0, ammodernamento: 0, trasformazione: 0, daDefinire: 0, noResult: 0, fail: 0, warn: 0, outdated: 0, review: 0 });
});

test('elenco: i filtri per tipo di intervento (?tipo=), un vecchio ?kind= non è un filtro', () => {
  const tipi = new Map([['a', 'SOLO_ARGANO' as const], ['b', null], ['c', 'TRASFORMAZIONE_COMPLETA' as const], ['d', 'SOLO_ARGANO' as const]]);
  assert.deepEqual(idsDelTipo(tipi, 'solo-argano'), ['a', 'd']);
  assert.deepEqual(idsDelTipo(tipi, 'da-definire'), ['b']);
  assert.deepEqual(idsDelTipo(tipi, 'ammodernamento'), []);
  assert.equal(tipoFiltroOf('trasformazione-completa'), 'trasformazione-completa');
  for (const x of ['replacement', 'full', undefined, '']) assert.equal(tipoFiltroOf(x), null, String(x));
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
  const at = (p: string, archived = false) => shellSection(p, { archived }, S);
  // the home is the survey sheets' (round 44); the installations are /app/impianti
  assert.equal(at('/app'), 'rilievi');
  assert.equal(at('/app/impianti'), 'impianti');
  assert.equal(at('/app/impianti', true), 'archived');
  // one new installation (round 45): the type of intervention is chosen in its «Calcolo argano»
  assert.equal(at('/app/projects/new'), 'new');
  for (const p of ['/app/projects/abc', '/app/projects/abc/progetto', '/app/calculations/x/locale', '/app/lift-designs/y', '/app/drawing-sets/z']) assert.equal(at(p), 'impianti', p);
  assert.equal(at('/app/norme'), '/app/norme');
  assert.equal(at('/app/team/invite'), '/app/team');
  assert.equal(at('/app/teams'), null);
  assert.equal(at('/app/prices'), null);
  // the survey sheets: their list, a sheet, its edit and print pages, the trash — all under «Rilievi», the home's entry
  for (const p of ['/app/rilievi', '/app/rilievi/nuovo', '/app/rilievi/abc/modifica', '/app/rilievi/abc/stampa', '/app/rilievi/cestino']) assert.equal(at(p), 'rilievi', p);
  assert.equal(at('/app/rilievi-x'), null);
});

test('ricerca: % e _ sono testo, non caratteri jolly del LIKE', () => {
  assert.equal(likeEscape('MI_2291'), 'MI\\_2291');
  assert.equal(likeEscape('50%'), '50\\%');
  assert.equal(likeEscape('a\\b'), 'a\\\\b');
  assert.equal(likeEscape('%_'), '\\%\\_');
  assert.equal(likeEscape('Via Roma 12'), 'Via Roma 12');
});

test('barra laterale: «pagina» solo sulla pagina della voce, altrimenti «true»', () => {
  assert.equal(navCurrent('impianti', '/app/impianti'), 'page');
  assert.equal(navCurrent('impianti', '/app/projects/abc'), 'true');
  assert.equal(navCurrent('impianti', '/app/calculations/abc'), 'true');
  assert.equal(navCurrent('archived', '/app/impianti'), 'page');
  assert.equal(navCurrent('/app/norme', '/app/norme'), 'page');
  assert.equal(navCurrent('/app/norme', '/app/norme/en-81-20'), 'true');
  assert.equal(navCurrent('new', '/app/projects/new'), 'page');
  assert.equal(navCurrent('rilievi', '/app'), 'page');
  assert.equal(navCurrent('rilievi', '/app/rilievi'), 'true');
  assert.equal(navCurrent('rilievi', '/app/rilievi/abc'), 'true');
});
