import { test } from 'node:test';
import assert from 'node:assert/strict';
import { languageDemand } from '../language-gap';

test('картографира държави към езици и намира липсващите', () => {
  const { demand, missing, mappedVisitors } = languageDemand(
    [
      { country: 'DE', count: 40 },
      { country: 'AT', count: 10 }, // също немски → събира се с DE
      { country: 'FR', count: 30 },
      { country: 'IT', count: 20 },
    ],
    ['en', 'it'], // има само en и it превод
  );
  assert.equal(mappedVisitors, 100);
  // немски води (50), после френски (30), после италиански (20)
  assert.equal(demand[0].locale, 'de');
  assert.equal(demand[0].visitors, 50);
  assert.equal(demand[0].percent, 50);
  assert.equal(demand[0].hasTranslation, false);
  // липсват de и fr (има превод само за it от търсените)
  assert.deepEqual(
    missing.map((m) => m.locale),
    ['de', 'fr'],
  );
});

test('непознати/смесени държави се игнорират', () => {
  const { demand, mappedVisitors } = languageDemand(
    [
      { country: 'BE', count: 100 }, // Белгия — нарочно без картографиране
      { country: null, count: 50 }, // без държава
      { country: 'PL', count: 25 },
    ],
    [],
  );
  assert.equal(mappedVisitors, 25); // само PL се брои
  assert.equal(demand.length, 1);
  assert.equal(demand[0].locale, 'pl');
  assert.equal(demand[0].percent, 100);
});

test('всичко преведено → няма липсващи', () => {
  const { missing } = languageDemand(
    [{ country: 'DE', count: 5 }],
    ['de'],
  );
  assert.equal(missing.length, 0);
});

test('празен вход → празен резултат', () => {
  const { demand, missing, mappedVisitors } = languageDemand([], ['en']);
  assert.equal(demand.length, 0);
  assert.equal(missing.length, 0);
  assert.equal(mappedVisitors, 0);
});
