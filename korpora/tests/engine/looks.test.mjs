// Looks of the 3D view read from catalogue words: the metal of a handle from its finish and colour, the surface of a
// plain decor and the wood species from the decor name. A word must not be found inside another one („gold“ is not
// „old“, „Mustard“ has no „star“, „Букмач“ is oak, not beech), and both word orders give the same look.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metalLook } from '../../editor/viewer-metals.js';
import { decorSurface } from '../../editor/tex-surface.js';
import { woodLook } from '../../editor/tex-wood-species.js';

const metal = (finish, color) => metalLook(finish, color).key;

test('gold handles are not antique unless the finish says so', () => {
  assert.equal(metal('злато', 'gold'), 'gold');
  assert.equal(metal('злато гланц', 'gold'), 'gold');
  assert.equal(metal('злато мат', 'gold'), 'brass-satin');
  assert.equal(metal('матирано злато', 'gold'), 'brass-satin');
  assert.equal(metal('злато антик', 'gold'), 'brass-antique');
  assert.equal(metal('Старо злато', 'gold'), 'brass-antique');
  assert.equal(metal('old gold'), 'brass-antique');
});

test('aged metals read the same in both word orders', () => {
  assert.equal(metal('злато патина'), 'brass-antique');
  assert.equal(metal('патина злато'), 'brass-antique');
  assert.equal(metal('copper old'), 'copper-antique');
  assert.equal(metal('old copper'), 'copper-antique');
  assert.equal(metal('Медна патина', 'copper'), 'copper-antique');
  assert.equal(metal('мед', 'copper'), 'copper');
});

test('black finishes in every gender are black', () => {
  assert.equal(metal('Черен хром', 'grey'), 'black');
  assert.equal(metal('Черен никел', 'grey'), 'black');
  assert.equal(metal('черна', 'black'), 'black');
  assert.equal(metal('хром', 'chrome'), 'chrome');
});

test('wooden handles: beech is beech, the other woods walnut', () => {
  assert.deepEqual(metalLook('бук', 'wood'), { key: 'beech', wood: 'beech' });
  assert.deepEqual(metalLook('орех', 'wood'), { key: 'wood', wood: 'walnut' });
});

test('plain decors sparkle only for a word that starts with the term', () => {
  assert.equal(
    decorSurface({ category: 'uni', name: 'Горчица', nameEn: 'Mustard' }).style,
    'pearl',
  );
  assert.equal(
    decorSurface({ category: 'uni', name: 'Звезден', nameEn: 'Star Blue' }).style,
    'sparkle',
  );
  assert.equal(decorSurface({ category: 'uni', name: 'Перлено бяло' }).style, 'sparkle');
  assert.equal(
    decorSurface({ category: 'uni', name: 'Арис сиво', nameEn: 'Aris Grey' }).style,
    'oxidized',
  );
  assert.equal(decorSurface({ category: 'uni', name: 'Paris' }).style, 'pearl');
});

test('bookmatched oak is oak, beech is still beech', () => {
  const oak = woodLook('Дъб');
  const beech = woodLook('Бук');
  assert.equal(woodLook('Дъб Букмач Bookmatch Oak H1316').contrast, oak.contrast);
  assert.equal(woodLook('Пасищен бук').contrast, beech.contrast);
  assert.equal(woodLook('буков масив').contrast, beech.contrast);
  assert.notEqual(oak.contrast, beech.contrast);
});
