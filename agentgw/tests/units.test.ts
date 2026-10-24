import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { findMarkers } from '../scripts/markers.mjs';
import { buildParams } from '../src/claude.js';
import { egnValid, ibanValid, luhnValid, redactPii } from '../src/pii.js';
import { costMicroUsd } from '../src/pricing.js';
import { loadProfiles, PUBLIC_DOCTRINE } from '../src/profiles.js';
import { RateLimiter } from '../src/ratelimit.js';
import { ROOT, testConfig } from './helpers.js';

/** Валидно ЕГН, сглобено в runtime (контролна цифра по алгоритъма). */
function makeEgn(first9: string): string {
  const w = [2, 4, 8, 5, 10, 9, 7, 3, 6];
  const sum = [...first9].reduce((s, d, i) => s + Number(d) * w[i]!, 0);
  return first9 + String((sum % 11) % 10);
}

describe('PII редакция', () => {
  test('имейл, телефон, ЕГН, IBAN, карта', () => {
    const egn = makeEgn('750101123');
    const iban = ['BG80', 'BNBG', '9661', '1020', '3456', '78'].join(' ');
    const card = ['4111', '1111', '1111', '1111'].join(' ');
    const email = ['maria', 'example.com'].join('@');
    const text = `Аз съм ${email}, тел. 0888 123 456, ЕГН ${egn}, IBAN ${iban}, карта ${card}.`;
    const out = redactPii(text);
    for (const secret of [email, '0888 123 456', egn, iban, card]) {
      assert.equal(out.includes(secret), false, `остана: ${secret}`);
    }
    for (const label of ['[имейл]', '[телефон]', '[ЕГН]', '[IBAN]', '[карта]']) {
      assert.ok(out.includes(label), `липсва ${label}`);
    }
  });

  test('не пипа обикновени числа и години', () => {
    const text = 'През 2026 г. сайтът има 1234 посещения и LCP 2.5 s; поръчка №12345.';
    assert.equal(redactPii(text), text);
  });

  test('валидатори', () => {
    assert.ok(luhnValid('4111111111111111'));
    assert.equal(luhnValid('4111111111111112'), false);
    assert.ok(ibanValid(['BG80', 'BNBG96611020345678'].join('')));
    assert.equal(ibanValid('BG00BNBG96611020345678'), false);
    assert.ok(egnValid(makeEgn('750101123')));
    assert.equal(egnValid('1234567890'), false);
  });
});

describe('публични профили', () => {
  const profiles = loadProfiles(join(ROOT, 'agents'));

  test('зареждат се и всеки има текст', () => {
    assert.ok(profiles.size >= 1);
    for (const p of profiles.values()) assert.ok(p.text.length > 200, p.id);
  });

  test('нула вътрешни маркери в генерираните файлове', () => {
    for (const f of readdirSync(join(ROOT, 'agents'))) {
      const text = readFileSync(join(ROOT, 'agents', f), 'utf8');
      assert.deepEqual(findMarkers(text), [], f);
    }
  });

  test('доктрината не съдържа вътрешни маркери', () => {
    assert.deepEqual(findMarkers(PUBLIC_DOCTRINE), []);
  });

  test('маркерите хващат типичните изтичания', () => {
    for (const leak of [
      'виж .claude/agents/seo.md',
      'пусни node tools/seo/indexnow.mjs',
      'ползвай Bash и Grep',
      'на VPS-а зад nginx',
      'запиши в _memory',
      'zabobovdol е force-dynamic',
      'сървър 10.0.0.12',
      'решение на собственика',
    ]) {
      assert.notDeepEqual(findMarkers(leak), [], leak);
    }
  });

  test('buildParams: без tools, системният промпт носи профила', () => {
    const seo = profiles.get('seo')!;
    const p = buildParams(seo, [{ role: 'user', content: 'здравей' }], testConfig());
    assert.equal('tools' in p, false);
    const sys = p.system as Array<{ text: string }>;
    assert.ok(sys[1]!.text.includes(seo.text.slice(0, 50)));
  });
});

describe('цени и лимити', () => {
  test('opus-5: 1M вход = 5 USD × 1.1', () => {
    const c = costMicroUsd(
      'claude-opus-5',
      { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      1.1,
    );
    assert.equal(c, 5_500_000n);
  });

  test('кеш четене е 10% от входа (sonnet-5)', () => {
    const c = costMicroUsd(
      'claude-sonnet-5',
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000, cacheWriteTokens: 0 },
      1,
    );
    assert.equal(c, 200_000n);
  });

  test('непознат модел → най-скъпата цена (fail-closed)', () => {
    const u = { inputTokens: 1000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    assert.equal(costMicroUsd('непознат', u, 1), costMicroUsd('claude-opus-5', u, 1));
  });

  test('RateLimiter: прозорец от 60 s', () => {
    let now = 0;
    const rl = new RateLimiter(() => now);
    assert.ok(rl.take('a', 2));
    assert.ok(rl.take('a', 2));
    assert.equal(rl.take('a', 2), false);
    assert.ok(rl.take('b', 2), 'отделна кофа');
    now = 60_001;
    assert.ok(rl.take('a', 2));
  });
});
