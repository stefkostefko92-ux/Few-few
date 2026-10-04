import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsonForScript } from '../src/http/json-script.js';
import { nameSchema } from '../src/services/auth-common.js';
import { copyName, hasUnsafeChars } from '../src/services/names.js';

const NUL = String.fromCharCode(0);
const RLO = String.fromCharCode(0x202e);
const LRI = String.fromCharCode(0x2066);

test('control and bidi-override characters are unsafe in names, ordinary text is not', () => {
  assert.equal(hasUnsafeChars(`a${NUL}b`), true);
  assert.equal(hasUnsafeChars(`a${String.fromCharCode(0x7f)}b`), true);
  assert.equal(hasUnsafeChars(`${RLO}gpj.exe`), true);
  assert.equal(hasUnsafeChars(`${LRI}x`), true);
  assert.equal(hasUnsafeChars('Кухня „Мария“ — 3,6 м 😀'), false);
  assert.equal(nameSchema.safeParse(`Мария${NUL}Петрова`).success, false);
  assert.equal(nameSchema.safeParse('Мария Петрова').success, true);
});

test('a copy keeps the whole “ (2)” suffix within the limit and never splits an emoji', () => {
  assert.equal(copyName('Кухня', 80), 'Кухня (2)');
  const long = 'а'.repeat(80);
  assert.equal(copyName(long, 80), `${'а'.repeat(76)} (2)`);
  assert.equal(copyName(long, 80).length, 80);
  const emoji = `${'б'.repeat(75)}😀`;
  const copy = copyName(emoji, 80);
  assert.equal(copy, `${'б'.repeat(75)} (2)`);
  assert.ok(copy.length <= 80);
  assert.equal(copyName(`${'в'.repeat(70)}      x`, 80), `${'в'.repeat(70)} (2)`);
});

test('JSON inside <script> cannot close the block and stays a valid JS string', () => {
  const out = jsonForScript({ name: `</script><b>${String.fromCharCode(0x2028, 0x2029)}` });
  assert.doesNotMatch(out, /</);
  assert.equal(out.includes(String.fromCharCode(0x2028)), false);
  assert.equal(out.includes(String.fromCharCode(0x2029)), false);
  assert.deepEqual(JSON.parse(out), {
    name: `</script><b>${String.fromCharCode(0x2028, 0x2029)}`,
  });
});
