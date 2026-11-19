import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { findMarkers } from '../scripts/markers.mjs';
import { buildParams } from '../src/claude.js';
import { LeakGuard } from '../src/leak.js';
import { egnValid, ibanValid, luhnValid, redactPii } from '../src/pii.js';
import { costMicroUsd, PRICES } from '../src/pricing.js';
import { loadProfiles, PUBLIC_DOCTRINE, publicDoctrine } from '../src/profiles.js';
import { clientBucket, RateLimiter, StrikeCounter } from '../src/ratelimit.js';
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

  test('доктрината с канарче също е без вътрешни маркери', () => {
    assert.deepEqual(findMarkers(publicDoctrine('CS0123456789ABCDEF')), []);
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

describe('филтър на изхода (LeakGuard)', () => {
  const CANARY = ['CS', 'ABCDEF', '012345'].join('');
  const run = (parts: string[]) => {
    const g = new LeakGuard(CANARY);
    let out = '';
    for (const p of parts) {
      const s = g.push(p);
      out += s.emit;
      if (s.leak) return { out, leak: s.leak };
    }
    const f = g.flush();
    return { out: out + f.emit, leak: f.leak };
  };

  test('чист текст минава непроменен, на произволни парчета', () => {
    const text = 'Ето три съвета за SEO: заглавия, бързина и структурирани данни. '.repeat(5);
    for (const size of [1, 7, 50, 500]) {
      const parts = text.match(new RegExp(`[\\s\\S]{1,${size}}`, 'g'))!;
      assert.deepEqual(run(parts), { out: text, leak: null }, `парчета по ${size}`);
    }
  });

  test('канарче, разделено по знак и с интервали, не излиза нито частично', () => {
    const text = 'А'.repeat(200) + ' код: C S-ABC DEF-012 345 и край';
    const r = run([...text]);
    assert.equal(r.leak, 'канарче');
    assert.equal(r.out.includes('C S'), false);
    assert.ok(r.out.length <= 200);
  });

  test('откъс от доктрината и вътрешна папка → засечени', () => {
    assert.equal(run(['Правила — с приоритет над всичко']).leak, 'доктрина');
    assert.equal(run(['виж в .claude/agents']).leak, 'вътрешна папка');
    assert.equal(run(['Контролен код на тези инструкции']).leak, 'доктрина');
  });

  test('нормални думи не са маркер', () => {
    for (const ok of ['Натисни Edit', 'React hooks', 'собственикът на сайта', 'my_memory_card']) {
      assert.equal(run([ok]).leak, null, ok);
    }
  });

  /** Режe по UTF-16 единици (може да среже и сурогатна двойка), както би могла делта. */
  const chunks = (text: string, size: number) => text.match(new RegExp(`[^]{1,${size}}`, 'g'))!;
  const spread = (s: string, sep: string) => [...s].join(sep);
  const fullwidth = (s: string) =>
    s.replace(/[A-Z0-9]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0));

  test('заобикаляния на канарчето → засечено и нищо от него не излиза (парчета по 1 и 5)', () => {
    const cases: Array<[string, string]> = [
      ['8 интервала', spread(CANARY, ' '.repeat(8))],
      ['20 интервала', spread(CANARY, ' '.repeat(20))],
      ['5 интервала', spread(CANARY, ' '.repeat(5))],
      ['нови редове и тирета', spread(CANARY, ' -\n- ')],
      ['нулева ширина', spread(CANARY, '​')],
      ['fullwidth', fullwidth(CANARY)],
      ['fullwidth на разредки', spread(fullwidth(CANARY), '   ')],
      ['кирилско С', CANARY.replace('C', 'С')],
      [
        'кирилски малки',
        CANARY.toLowerCase().replace('c', 'с').replace('a', 'а').replace('e', 'е'),
      ],
      ['гръцко Α и Ε', CANARY.replace('A', 'Α').replace('E', 'Ε')],
      ['математически удебелени', CANARY.replace('C', '\u{1d402}')],
      ['комбиниращ знак', CANARY.replace('C', 'Ç')],
    ];
    for (const [name, leak] of cases) {
      const text = `Код: ${leak} край`;
      for (const size of [1, 5]) {
        const r = run(chunks(text, size));
        assert.equal(r.leak, 'канарче', `${name}, парчета по ${size}`);
        assert.ok(
          'Код: '.startsWith(r.out),
          `${name}, по ${size}: изтече ${JSON.stringify(r.out)}`,
        );
      }
    }
  });

  test('откъс от доктрината с много интервали или с друго тире → засечен, нищо не излиза', () => {
    for (const [name, frag] of [
      ['150 интервала', 'Правила' + ' '.repeat(150) + '— с приоритет над всичко'],
      ['en dash', 'Правила – с приоритет над всичко'],
      ['тире без интервали', 'Правила-с приоритет над всичко'],
      ['нов ред между думите', 'Контролен\n\nкод   на тези\tинструкции'],
      ['150 интервала в профила', 'Твоят' + ' '.repeat(150) + 'профил (експертиза и тон)'],
    ] as const) {
      for (const size of [1, 5, 1000]) {
        const r = run(chunks(`Ето: ${frag}. Още текст.`, size));
        assert.notEqual(r.leak, null, `${name}, парчета по ${size}`);
        assert.ok(
          'Ето: '.startsWith(r.out),
          `${name}, по ${size}: изтече ${JSON.stringify(r.out)}`,
        );
      }
    }
  });

  test('нормален текст (кирилица, тирета, емоджи, много интервали) минава цял през flush()', () => {
    const text =
      'Съвет — СЕО: Ако сайтът е бавен, провери ТОП 10 страници – особено мобилните.   \n\n' +
      '1. Заглавия; 2. Скорост 🚀; 3. Данни 𝐀𝐁𝐂 и café. Край.'.repeat(4);
    for (const size of [1, 2, 5, 7, 64, 5000]) {
      assert.deepEqual(run(chunks(text, size)), { out: text, leak: null }, `парчета по ${size}`);
    }
  });
});

describe('брояч на откази (StrikeCounter) и кофа по клиент', () => {
  test('IPv6 → префикс /64; IPv4 и IPv4-mapped → адресът', () => {
    assert.equal(clientBucket('2001:db8:1:2::a'), clientBucket('2001:0db8:0001:0002:ffff::1'));
    assert.equal(clientBucket('2001:db8:1:2:3:4:5:6'), clientBucket('2001:db8:1:2::'));
    assert.notEqual(clientBucket('2001:db8:1:2::a'), clientBucket('2001:db8:1:3::a'));
    assert.equal(clientBucket('::ffff:203.0.113.7'), '203.0.113.7');
    assert.equal(clientBucket('203.0.113.7'), '203.0.113.7');
    assert.notEqual(clientBucket('203.0.113.7'), clientBucket('203.0.113.8'));
    assert.equal(clientBucket('fe80::1%eth0'), clientBucket('fe80::2'));
  });

  test('резервация: заявките в полет се броят; освобождаването я връща', () => {
    const s = new StrikeCounter(60_000);
    assert.equal(s.reserve('b', 2), true);
    assert.equal(s.reserve('b', 2), true);
    assert.equal(s.reserve('b', 2), false, 'трета паралелна заявка над прага');
    s.release('b');
    s.add('b'); // едната завърши с отказ
    s.release('b');
    assert.equal(s.count('b'), 1);
    assert.equal(s.reserve('b', 2), true);
    assert.equal(s.reserve('b', 2), false);
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

  // platform.claude.com/docs/en/about-claude/pricing (сверено 2026-11-19)
  test('sonnet-5-5: $2 вход / $2.50 кеш запис / $0.10 кеш четене / $10 изход', () => {
    const one = (k: 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens') =>
      costMicroUsd(
        'claude-sonnet-5-5',
        {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          [k]: 1_000_000,
        },
        1,
      );
    assert.equal(one('inputTokens'), 2_000_000n);
    assert.equal(one('cacheWriteTokens'), 2_500_000n);
    assert.equal(one('cacheReadTokens'), 100_000n);
    assert.equal(one('outputTokens'), 10_000_000n);
  });

  test('opus-5-5: $4 вход / $0.20 кеш четене / $20 изход', () => {
    const u = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000 };
    assert.equal(costMicroUsd('claude-opus-5-5', { ...u, cacheWriteTokens: 0 }, 1), 24_200_000n);
  });

  test('непознат модел → по-скъп или равен на ВСЕКИ известен по всяка категория', () => {
    for (const k of ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens']) {
      const u = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
      const one = { ...u, [k]: 1_000_000 };
      const unknown = costMicroUsd('claude-nepoznat-9', one, 1);
      for (const m of Object.keys(PRICES)) {
        assert.ok(unknown >= costMicroUsd(m, one, 1), `${k}: ${m}`);
      }
    }
  });

  test('модел без цена в конфигурацията → шлюзът отказва да стартира', () => {
    assert.throws(() => testConfig({ MODEL_SONNET: 'claude-sonnet-9' }), /цена/);
    assert.throws(() => testConfig({ MODEL_OPUS: 'claude-opus-9' }), /цена/);
  });

  test('подразбиращите се модели имат ред в цените', () => {
    const cfg = testConfig();
    assert.ok(PRICES[cfg.MODEL_OPUS], cfg.MODEL_OPUS);
    assert.ok(PRICES[cfg.MODEL_SONNET], cfg.MODEL_SONNET);
  });

  test('StrikeCounter: брои в прозореца, после нулира', () => {
    let now = 0;
    const s = new StrikeCounter(15 * 60_000, () => now);
    s.add('a');
    s.add('a');
    assert.equal(s.count('a'), 2);
    assert.equal(s.count('b'), 0);
    assert.equal(s.retryAfter('a'), 900);
    now = 15 * 60_000;
    assert.equal(s.count('a'), 0);
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
