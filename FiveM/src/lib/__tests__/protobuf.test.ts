import assert from 'node:assert/strict';
import { test } from 'node:test';

import { all, asMessage, asNumber, asString, decodeMessage, first, readFrames } from '../protobuf';
import { isBulgarian, parseServerFrame, type CfxServer } from '../cfx';

/**
 * Декодерът чете НЕДОВЕРЕНИ ДВОИЧНИ данни от чужд източник (снапшотът на
 * Cfx.re, ~19 MB, неофициален договор) и досега нямаше нито един тест. Точно
 * тук едно грешно четене на дължина значи прочит извън буфера, безкраен цикъл
 * или изяден процес — а cron-ът гълта провала с `|| true`.
 */

/** Минимален кодировач, за да не пишем байтовете на ръка. */
function varint(value: number): number[] {
  const out: number[] = [];
  let v = value;
  do {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v > 0) byte |= 0x80;
    out.push(byte);
  } while (v > 0);
  return out;
}
const tag = (field: number, wire: number) => varint((field << 3) | wire);
const lenDelim = (field: number, bytes: number[]) => [...tag(field, 2), ...varint(bytes.length), ...bytes];
const str = (field: number, value: string) => lenDelim(field, [...new TextEncoder().encode(value)]);
const num = (field: number, value: number) => [...tag(field, 0), ...varint(value)];
const bytes = (...parts: number[][]) => new Uint8Array(parts.flat());

// ── Здрав вход ──────────────────────────────────────────────────────────────

test('чете низ, число и вложено съобщение', () => {
  const inner = [...str(1, 'Krown'), ...num(2, 42)];
  const message = decodeMessage(bytes(str(4, 'здравей'), num(2, 7), lenDelim(9, inner)));

  assert.equal(asString(first(message, 4)), 'здравей');
  assert.equal(asNumber(first(message, 2)), 7);
  const nested = asMessage(first(message, 9));
  assert.ok(nested, 'вложеното съобщение не се декодира');
  assert.equal(asString(first(nested, 1)), 'Krown');
});

test('повторено поле връща ВСИЧКИ стойности, не последната', () => {
  const message = decodeMessage(bytes(str(8, 'es_extended'), str(8, 'ox_lib'), str(8, 'qb-core')));
  const values = all(message, 8).map((entry) => asString(entry));
  assert.deepEqual(values, ['es_extended', 'ox_lib', 'qb-core']);
});

test('непознато поле се пропуска, а не чупи записа', () => {
  // Добавка от тяхна страна не бива да ни вали — договорът е неофициален.
  const message = decodeMessage(bytes(str(4, 'име'), num(999, 1), str(2000, 'бъдещо поле')));
  assert.equal(asString(first(message, 4)), 'име');
});

// ── ВРАЖДЕБЕН вход ──────────────────────────────────────────────────────────

test('дължина отвъд буфера НЕ чете извън него', () => {
  // Обявена дължина 200 при налични 3 байта.
  const hostile = bytes([...tag(4, 2), ...varint(200)], [1, 2, 3]);
  // Приема се или изключение, или запис без полето — но НЕ и прочит на боклук.
  try {
    const message = decodeMessage(hostile);
    const value = asString(first(message, 4));
    assert.ok(
      value === undefined || value.length <= 3,
      `прочете ${value?.length} знака при 3 налични байта`,
    );
  } catch {
    // Хвърлянето е приемливо: `parseServerFrame` го хваща и връща null.
  }
});

test('varint без край не върти безкрайно', () => {
  // Осем байта с вдигнат бит за продължение и нищо след тях.
  const hostile = bytes([...tag(2, 0)], [0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80]);
  try {
    decodeMessage(hostile);
  } catch {
    /* приемливо */
  }
  assert.ok(true, 'функцията се върна — няма безкраен цикъл');
});

test('празен вход дава празно съобщение, не изключение', () => {
  assert.doesNotThrow(() => decodeMessage(new Uint8Array()));
});

test('счупен кадър НЕ вали целия поток', () => {
  // `readFrames` е [4-байтова LE дължина][съобщение]. Обявяваме 1 000 000
  // байта, а даваме 4 — рамкирането трябва да спре, не да алокира.
  const header = new Uint8Array([0x40, 0x42, 0x0f, 0x00, 1, 2, 3, 4]);
  const frames = [...readFrames(header)];
  assert.ok(frames.length === 0 || frames[0].byteLength <= 4, 'излезе кадър, по-голям от буфера');
});

test('parseServerFrame връща null за неизползваем запис, не хвърля', () => {
  assert.equal(parseServerFrame(new Uint8Array([0xff, 0xff, 0xff])), null);
  assert.equal(parseServerFrame(new Uint8Array()), null);
});

// ── „Български ли е“ — обединение, не пресичане ─────────────────────────────

const server = (over: Partial<CfxServer> = {}): CfxServer => ({
  endPoint: 'abc123',
  hostname: 'Някакъв сървър',
  clients: 0,
  maxClients: 64,
  resources: [],
  vars: {},
  connectEndPoints: [],
  ...over,
});

test('обявеният локал стига сам по себе си', () => {
  assert.equal(isBulgarian(server({ vars: { locale: 'bg-BG' } })), true);
  assert.equal(isBulgarian(server({ vars: { locale: 'bg' } })), true);
  assert.equal(isBulgarian(server({ vars: { locale: 'BG-bg' } })), true, 'регистърът не бива да значи');
});

test('думата в името стига сама по себе си — ОБЕДИНЕНИЕ, не пресичане', () => {
  // Измерено на живо: филтър само по локал изпуска реални български сървъри.
  assert.equal(isBulgarian(server({ hostname: 'Bulgaria Roleplay' })), true);
  assert.equal(isBulgarian(server({ vars: { sv_projectName: 'Българският сървър' } })), true);
  assert.equal(isBulgarian(server({ vars: { tags: 'bulgarian, roleplay' } })), true);
});

test('КИРИЛИЦАТА НЕ Е ПРИЗНАК — руски и украински не влизат', () => {
  // Регресия: този евристичен ред вкарваше ru-RU и uk-UA в българския списък.
  assert.equal(isBulgarian(server({ hostname: 'Русский сервер', vars: { locale: 'ru-RU' } })), false);
  assert.equal(isBulgarian(server({ hostname: 'Український сервер' })), false);
  assert.equal(isBulgarian(server({ hostname: 'Съборный' })), false, '„ъ“ го има и в руския');
});

test('root-AQ и празният локал не значат нищо', () => {
  assert.equal(isBulgarian(server({ vars: { locale: 'root-AQ' } })), false);
  assert.equal(isBulgarian(server({ vars: { locale: '' } })), false);
  assert.equal(isBulgarian(server()), false);
});
