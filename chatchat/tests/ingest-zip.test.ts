import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { decodeEntities, walkXml, XmlError } from '../src/ingest/xml.js';
import { readZip, repackStored, ZipError, zipNames, type ZipLimits } from '../src/ingest/zip.js';
import { buildZip } from './ingest-fixtures.js';

/**
 * ZIP и XML за DOCX/XLSX (§4.1): враждебните пакети (бомби, застъпване, излъгани размери,
 * шифроване, ZIP64, опасни имена) се отказват ПРЕДИ библиотеката да ги види; XML без DTD.
 */

const reason = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    if (err instanceof ZipError) return err.reason;
    throw err;
  }
  return 'ok';
};

const small: ZipLimits = {
  maxEntries: 5,
  maxTotalBytes: 10_000,
  maxEntryBytes: 8_000,
  maxRatio: 50,
  ratioFloor: 1_000,
};

describe('readZip', () => {
  test('нормален пакет: имената, данните и CRC; препакетиран (stored) се чете същият', () => {
    const zip = buildZip([
      { name: 'a.xml', data: '<a>здравей</a>' },
      { name: 'dir/b.txt', data: 'b'.repeat(500), method: 0 },
    ]);
    const entries = readZip(zip);
    assert.deepEqual(
      entries.map((e) => [e.name, e.data.toString('utf8')]),
      [
        ['a.xml', '<a>здравей</a>'],
        ['dir/b.txt', 'b'.repeat(500)],
      ],
    );
    const again = readZip(repackStored(entries));
    assert.deepEqual(
      again.map((e) => e.data.toString('utf8')),
      entries.map((e) => e.data.toString('utf8')),
    );
    assert.deepEqual(zipNames(zip), ['a.xml', 'dir/b.txt']);
  });

  test('zip bomb с излъган размер: изходът надвишава заглавката → bomb (без да се разархивира докрай)', () => {
    const zip = buildZip([{ name: 'x.xml', data: Buffer.alloc(5_000_000), declaredSize: 100 }]);
    assert.equal(
      reason(() => readZip(zip)),
      'bomb',
    );
  });

  test('честна бомба: съотношение над тавана → bomb; общ размер над тавана → too_large', () => {
    const ratio = buildZip([{ name: 'x.xml', data: Buffer.alloc(5_000) }]);
    assert.equal(
      reason(() => readZip(ratio, small)),
      'bomb',
    );
    const total = buildZip([
      { name: 'a', data: Buffer.from('a'.repeat(6_000)), method: 0 },
      { name: 'b', data: Buffer.from('b'.repeat(6_000)), method: 0 },
    ]);
    assert.equal(
      reason(() => readZip(total, small)),
      'too_large',
    );
  });

  test('твърде много записи, застъпване, шифроване, ZIP64, опасни/повторени имена', () => {
    const many = buildZip(Array.from({ length: 6 }, (_, i) => ({ name: `f${i}`, data: 'x' })));
    assert.equal(
      reason(() => readZip(many, small)),
      'too_many_entries',
    );
    const overlap = buildZip([
      { name: 'a', data: 'x'.repeat(100), method: 0 },
      { name: 'b', data: 'x'.repeat(100), method: 0, overlapWith: 0 },
    ]);
    assert.equal(
      reason(() => readZip(overlap)),
      'overlap',
    );
    assert.equal(
      reason(() => readZip(buildZip([{ name: 'a', data: 'x', flags: 1 }]))),
      'encrypted',
    );
    const z64 = buildZip([{ name: 'a', data: 'x', declaredSize: 0xffffffff }]);
    assert.equal(
      reason(() => readZip(z64)),
      'zip64',
    );
    assert.equal(
      reason(() => readZip(buildZip([{ name: '../evil', data: 'x' }]))),
      'bad_name',
    );
    assert.equal(
      reason(() => readZip(buildZip([{ name: '/etc/passwd', data: 'x' }]))),
      'bad_name',
    );
    const dup = buildZip([
      { name: 'A.xml', data: '1' },
      { name: 'a.xml', data: '2' },
    ]);
    assert.equal(
      reason(() => readZip(dup)),
      'duplicate_name',
    );
  });

  test('повреден пакет: грешен CRC, отрязан файл, не-ZIP', () => {
    assert.equal(
      reason(() => readZip(buildZip([{ name: 'a', data: 'xyz', crc: 1 }]))),
      'corrupt',
    );
    const zip = buildZip([{ name: 'a', data: 'x'.repeat(2_000) }]);
    assert.notEqual(
      reason(() => readZip(zip.subarray(0, zip.length - 30))),
      'ok',
    );
    assert.equal(
      reason(() => readZip(Buffer.from('%PDF-1.4 не е zip'))),
      'not_zip',
    );
    assert.equal(zipNames(Buffer.from('PK боклук')), null);
  });
});

describe('walkXml', () => {
  test('елементи, атрибути (и с „>“ в кавички), текст, CDATA, същности; префиксите се махат', () => {
    const events: string[] = [];
    walkXml(
      '<?xml version="1.0"?><x:a k="1 > 0" r:id="r7"><!-- c --><b/>t&amp;<![CDATA[<raw>]]></x:a>',
      {
        open: (n, a, self) => events.push(`open ${n} ${JSON.stringify(a)} ${self}`),
        close: (n) => events.push(`close ${n}`),
        text: (t) => events.push(`text ${t}`),
      },
    );
    assert.deepEqual(events, [
      'open a {"k":"1 > 0","r:id":"r7","id":"r7"} false',
      'open b {} true',
      'close b',
      'text t&',
      'text <raw>',
      'close a',
    ]);
  });

  test('DOCTYPE (XXE, billion laughs) → отказ; дълбочина без край → отказ; незатворен таг → отказ', () => {
    const xxe = '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>';
    assert.throws(
      () => walkXml(xxe, {}),
      (e: unknown) => e instanceof XmlError && e.reason === 'doctype',
    );
    const deep = '<a>'.repeat(300) + '</a>'.repeat(300);
    assert.throws(
      () => walkXml(deep, {}),
      (e: unknown) => e instanceof XmlError && e.reason === 'too_deep',
    );
    assert.throws(() => walkXml('<a', {}), XmlError);
  });

  test('същностите: само стандартните и числовите; непозната остава буквално', () => {
    assert.equal(decodeEntities('&lt;&gt;&quot;&apos;&#65;&#x42;&xxe;&#0;'), `<>"'AB&xxe;`);
  });
});
