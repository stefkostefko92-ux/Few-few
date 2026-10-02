// Panev's catalogue in the software (48 articles, list 2026) and the bill of a design: the door pairs under every
// landing sill, the counterweight rail's supports with their SG at every bracket's height; the list prices apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PANEV_ARTICLES, panevArticle, panevBom } from '../catalog/panev';
import { CW_CHOICES, DOOR_PAIRS, bracketCount, defaultInputs, doorBracketCount, landingOf, layout, railSpan, section, type ShaftInputs } from '@/shaft';
import { PANEV_LIST_PRICE } from '../catalog/panev-prices';

const base = defaultInputs(1600, 1750);

test('catalogo Panev: 48 articoli, codici unici, prezzi di listino tranne le soluzioni su disegno', () => {
  assert.equal(PANEV_ARTICLES.length, 48);
  assert.equal(new Set(PANEV_ARTICLES.map((a) => a.code)).size, 48);
  const count = (k: string) => PANEV_ARTICLES.filter((a) => a.kind === k).length;
  assert.deepEqual([count('plateA'), count('bracketB'), count('supportSU'), count('supportSD'), count('supportSC'), count('guideSG')], [5, 6, 3, 6, 8, 15]);
  for (const a of PANEV_ARTICLES) {
    assert.ok(a.page >= 14 && a.page <= 62, a.code);
    assert.equal(PANEV_LIST_PRICE[a.code] === undefined, ['madeSC', 'madeSG', 'cornerSN', 'squareSN', 'arm'].includes(a.kind), a.code);
  }
  assert.ok(panevArticle('SC 50 200'));
  assert.equal(PANEV_LIST_PRICE['SC 50 200'], 7.64);
  // every list price is an article of the catalogue
  for (const code of Object.keys(PANEV_LIST_PRICE)) assert.ok(panevArticle(code), code);
  // every article a design can name is in the catalogue
  for (const c of [...DOOR_PAIRS, ...CW_CHOICES]) for (const code of c.split(' + ')) assert.ok(panevArticle(code), code);
});

test('distinta: coppie A + B per soglia e per fermata, supporti e SG per ogni staffa delle guide', () => {
  const L = layout(base), bom = panevBom(L), qty = (c: string) => bom.rows.find((r) => r.article.code === c)?.qty ?? 0;
  const doors = L.doors.reduce((s, d) => {
    const l = landingOf(d);
    return s + doorBracketCount(l.u0 + 10, l.u1 - 10) * base.vertical.floors.filter((f) => f.door.includes(d.side)).length;
  }, 0);
  const [z0, z1] = railSpan(section(L)), n = bracketCount(z1 - z0);
  assert.equal(qty('A 65 170 7'), doors);
  assert.equal(qty('B 65 320'), doors);
  assert.equal(qty('SU 220 160'), 2 * n);
  assert.equal(qty('SG 80 150'), 2 * n);
  assert.equal(bom.rows.find((r) => r.article.code === 'A 65 170 7')?.cut, 73);
  assert.equal(bom.missing, 0);
  // generic brackets: only the doors' pairs
  assert.deepEqual(panevBom(layout({ ...base, cwBrackets: 'generic' })).rows.map((r) => r.article.code), ['A 65 170 7', 'B 65 320']);
});

test('distinta: SC in un angolo, soluzione su disegno a preventivo, staffe senza articolo', () => {
  const corner: ShaftInputs = { ...base, cw: 'left', plan: { cwPos: 700 } };
  const codes = panevBom(layout(corner)).rows.map((r) => r.article.code);
  assert.ok(codes.includes('SC 60 200') && codes.includes('SG 60 190') && codes.includes('SU 220 160'));
  const special = panevBom(layout({ ...base, panev: { cw: 'SN 60 65 + SN 65 200 + BRACCIO 160 190' } }));
  assert.ok(special.rows.filter((r) => r.use === 'cw').every((r) => r.drawing && PANEV_LIST_PRICE[r.article.code] === undefined));
  assert.ok(panevBom(layout({ ...base, panev: { cw: 'SC 50 200' } })).missing > 0);
});
