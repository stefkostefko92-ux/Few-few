import test from 'node:test';
import assert from 'node:assert';
import { checkText, normalizeForMatch } from '../../lib/textFilter';

// DSA чл. 28 текстов филтър — инварианти на механизма (нормализация +
// съвпадение + allowlist). Пазят филтъра от случайна регресия.

test('нормализацията сваля leet/разделители/повторения до канон', () => {
  assert.equal(normalizeForMatch('F.U.C.K'), 'fuck');   // разделители махнати
  assert.equal(normalizeForMatch('fuuuck'), 'fuck');    // повторения колабирани
  assert.equal(normalizeForMatch('sh!t'), 'shit');      // leet ! → i
  assert.equal(normalizeForMatch('  Hello  '), 'helo'); // ll→l, trim
});

test('чисти имена минават', () => {
  for (const name of ['Aldric', 'Shadowbane', 'Mage_01', 'Валери', 'GiuseppeIT']) {
    assert.equal(checkText(name, 'name').ok, true, `${name} трябва да мине`);
  }
});

test('явна профанити се блокира (вкл. leet/хомоглиф заобикаляне)', () => {
  assert.equal(checkText('fuck', 'name').ok, false);
  assert.equal(checkText('f u c k', 'name').ok, false);      // разделители
  assert.equal(checkText('sh1t_lord', 'name').ok, false);    // leet + вграждане
  assert.equal(checkText('путка', 'name').ok, false);        // bg
  assert.equal(checkText('cazzo', 'name').ok, false);        // it
});

test('имперсонация на екип/система се блокира', () => {
  for (const name of ['Admin', 'Official_GM', 'systeM', 'Модератор', 'TheRoyalMint']) {
    const r = checkText(name, 'name');
    assert.equal(r.ok, false, `${name} трябва да се блокира`);
  }
});

test('allowlist пази легитимни имена (анти-Scunthorpe)', () => {
  // „assassin"/„class"/„mage" съдържат флагнати поднизове, но са легитимни.
  for (const name of ['Assassin', 'Classy', 'Mage']) {
    assert.equal(checkText(name, 'name').ok, true, `${name} трябва да мине`);
  }
});

test('категорията се връща за лог (без да издава думата)', () => {
  const r = checkText('admin', 'name');
  assert.equal(r.ok, false);
  assert.equal(r.category, 'impersonation');
});
