import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { CliError, runKeyCommand } from '../src/cli/commands.js';
import { generateKey, hashKey, isKeyFormat, kindOf, microToUsd } from '../src/keys.js';
import { auditHash } from '../src/store/audit-hash.js';
import { MemoryStore } from '../src/store/memory.js';
import { PEPPER } from './helpers.js';

const KNOWN = new Set(['seo', 'prevodach', 'dizayner']);

async function cli(store: MemoryStore, ...argv: string[]): Promise<string> {
  const lines: string[] = [];
  await runKeyCommand(argv, {
    store,
    pepper: PEPPER,
    knownAgents: KNOWN,
    out: (l) => lines.push(l),
  });
  return lines.join('\n');
}

describe('ключове — формат и хеш', () => {
  test('формат cs_pk_/cs_sk_ + 43 знака base64url', () => {
    const pk = generateKey('PUBLIC');
    const sk = generateKey('SECRET');
    assert.ok(isKeyFormat(pk) && isKeyFormat(sk));
    assert.equal(kindOf(pk), 'PUBLIC');
    assert.equal(kindOf(sk), 'SECRET');
    assert.equal(kindOf('cs_xx_abc'), null);
    assert.notEqual(generateKey('PUBLIC'), pk);
  });

  test('HMAC-SHA256 с pepper: детерминиран, зависи от pepper-а, не съдържа ключа', () => {
    const k = generateKey('SECRET');
    const h1 = hashKey(k, PEPPER);
    assert.equal(h1, hashKey(k, PEPPER));
    assert.notEqual(h1, hashKey(k, `${PEPPER}-друг`));
    assert.match(h1, /^[0-9a-f]{64}$/);
    assert.equal(h1.includes(k.slice(6)), false);
    assert.throws(() => hashKey(k, 'къс'));
  });
});

describe('CLI — npm run key', () => {
  test('create: ключът се показва веднъж, пази се само хешът', async () => {
    const store = new MemoryStore();
    const out = await cli(
      store,
      'create',
      '--site',
      'Пример',
      '--agents',
      'seo',
      '--origins',
      'https://primer.bg/път?x=1',
      '--cap',
      '5',
    );
    const plain = /cs_pk_[A-Za-z0-9_-]{43}/.exec(out)?.[0];
    assert.ok(plain, 'ключът е в изхода');
    const [rec] = await store.listKeys();
    assert.equal(rec!.hash, hashKey(plain!, PEPPER));
    assert.deepEqual(rec!.origins, ['https://primer.bg']);
    assert.equal(rec!.capMicroUsd, 5_000_000n);
    assert.equal(
      JSON.stringify(rec, (_k, v) => (typeof v === 'bigint' ? String(v) : v)).includes(plain!),
      false,
    );
    // list не показва ключа
    assert.equal((await cli(store, 'list')).includes(plain!), false);
  });

  test('create: публичен без origin, таен с origin, http origin, непознат агент → грешка', async () => {
    const store = new MemoryStore();
    const base = ['create', '--site', 'X', '--agents', 'seo', '--cap', '1'];
    await assert.rejects(cli(store, ...base), CliError);
    await assert.rejects(cli(store, ...base, '--secret', '--origins', 'https://a.bg'), CliError);
    await assert.rejects(cli(store, ...base, '--origins', 'http://a.bg'), CliError);
    await assert.rejects(
      cli(store, 'create', '--site', 'X', '--agents', 'kodadjiyata', '--cap', '1', '--secret'),
      /публичен профил/,
    );
    assert.equal((await store.listKeys()).length, 0);
  });

  test('grant / grant --remove / origins / limit / revoke + одит верига', async () => {
    const store = new MemoryStore();
    await cli(store, 'create', '--site', 'X', '--agents', 'seo', '--cap', '1', '--secret');
    const [rec] = await store.listKeys();
    const id = rec!.id;
    await cli(store, 'grant', id, '--agents', 'prevodach,dizayner');
    assert.deepEqual((await store.findKey(id))!.agents, ['seo', 'prevodach', 'dizayner']);
    await cli(store, 'grant', id, '--agents', 'seo', '--remove');
    assert.deepEqual((await store.findKey(id))!.agents, ['prevodach', 'dizayner']);
    await assert.rejects(cli(store, 'origins', id, '--origins', 'https://a.bg'), /само публичният/);
    await cli(store, 'limit', id, '--cap', '12.5', '--rate', '7');
    const lim = (await store.findKey(id))!;
    assert.equal(microToUsd(lim.capMicroUsd), '12.5000');
    assert.equal(lim.ratePerMin, 7);
    await cli(store, 'revoke', id);
    const rev = (await store.findKey(id))!;
    assert.equal(rev.active, false);
    assert.ok(rev.revokedAt);

    const log = store.auditLog;
    assert.deepEqual(
      log.map((e) => e.action),
      ['key.create', 'key.agents.grant', 'key.agents.remove', 'key.limit', 'key.revoke'],
    );
    for (let i = 0; i < log.length; i++) {
      const e = log[i]!;
      assert.equal(e.prevHash, i === 0 ? '' : log[i - 1]!.hash);
      assert.equal(e.hash, auditHash(e.prevHash, e.at, e));
    }
  });

  test('непозната команда → помощ', async () => {
    await assert.rejects(cli(new MemoryStore(), 'nope'), /Употреба/);
  });
});
