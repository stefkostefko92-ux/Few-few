import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { attachmentsEnabled, loadConfig } from '../src/config.js';
import { contentDisposition } from '../src/services/attachments.js';
import { detectMime, sanitizeFileName } from '../src/services/filetype.js';
import { signFileUrl, URL_TTL_SECONDS, verifyFileUrl } from '../src/services/signed-url.js';
import {
  FileAttachmentStore,
  MemoryAttachmentStore,
  newObjectKey,
} from '../src/storage/attachments.js';
import { PLAINTEXT_ONLY } from '../src/storage/file-store.js';
import { EICAR, MAGIC, makePdf } from './file-fixtures.js';

const text = (s: string) => Buffer.from(s, 'utf8');

describe('тип по магически байтове, не по името', () => {
  test('снимки: JPEG, PNG, WebP, HEIC, HEIF', () => {
    assert.equal(detectMime('PHOTO', MAGIC.jpeg), 'image/jpeg');
    assert.equal(detectMime('PHOTO', MAGIC.png), 'image/png');
    assert.equal(detectMime('PHOTO', MAGIC.webp), 'image/webp');
    assert.equal(detectMime('PHOTO', MAGIC.heic), 'image/heic');
    assert.equal(detectMime('PHOTO', MAGIC.heif), 'image/heif');
  });

  test('PDF само като документ; снимка/PDF/изпълним файл не са лог', () => {
    const pdf = makePdf([['Pagina uno']]);
    assert.equal(detectMime('DOCUMENT', pdf), 'application/pdf');
    assert.equal(detectMime('PHOTO', pdf), null);
    assert.equal(detectMime('LOG', pdf), null);
    assert.equal(detectMime('LOG', MAGIC.png), null);
    assert.equal(detectMime('DOCUMENT', MAGIC.png), null);
    for (const kind of ['PHOTO', 'LOG', 'DOCUMENT'] as const) {
      assert.equal(detectMime(kind, MAGIC.exe), null, `MZ като ${kind}`);
    }
  });

  test('логове: JSON, CSV, текст — валиден UTF-8 без NUL', () => {
    assert.equal(detectMime('LOG', text('{"err":"E37","fw":"4.2"}')), 'application/json');
    assert.equal(detectMime('LOG', text('[1,2,3]')), 'application/json');
    assert.equal(detectMime('LOG', text('t;code;fw\n1;E37;4.2\n2;E38;4.2\n')), 'text/csv');
    assert.equal(detectMime('LOG', text('10:01 E37 encoder\n10:02 reset\n')), 'text/plain');
    assert.equal(detectMime('LOG', text('{ non json')), 'text/plain');
    assert.equal(detectMime('LOG', text('\ufeffriga con BOM è ok')), 'text/plain');
    assert.equal(detectMime('LOG', text('E37\0binario')), null, 'NUL байт');
    assert.equal(detectMime('LOG', Buffer.from([0x45, 0x33, 0xc3, 0x28])), null, 'невалиден UTF-8');
    assert.equal(detectMime('LOG', text('   \n')), null, 'празен');
    assert.equal(detectMime('LOG', text(EICAR)), 'text/plain', 'EICAR е текст — спира го AV');
  });

  test('текст не е снимка, каквото и да е името', () => {
    assert.equal(detectMime('PHOTO', text('<svg onload="alert(1)"/>')), null);
    assert.equal(detectMime('PHOTO', Buffer.alloc(0)), null);
  });
});

describe('името на файла — само за показване', () => {
  test('без път (POSIX и Windows) и без водещи точки', () => {
    assert.equal(sanitizeFileName('../../etc/passwd'), 'passwd');
    assert.equal(sanitizeFileName('C:\\Users\\tecnico\\foto quadro.jpg'), 'foto quadro.jpg');
    assert.equal(sanitizeFileName('.htaccess'), 'htaccess');
  });

  test('без контролни и двупосочни знаци (U+202E „gpj.exe“ измама)', () => {
    assert.equal(sanitizeFileName('foto\u202Egpj.exe'), 'fotogpj.exe');
    assert.equal(sanitizeFileName('a\r\nb\t\0c.txt'), 'a b c.txt');
    assert.equal(sanitizeFileName('x"<>|?*:.log'), 'x_______.log');
  });

  test('до 120 знака с разширението запазено; празно → „file“', () => {
    const long = sanitizeFileName(`${'à'.repeat(300)}.jpeg`);
    assert.equal([...long].length, 120);
    assert.ok(long.endsWith('.jpeg'));
    assert.equal(sanitizeFileName(''), 'file');
    assert.equal(sanitizeFileName(undefined), 'file');
    assert.equal(sanitizeFileName('/// ... '), 'file');
  });

  test('лични данни в името се маскират', () => {
    const email = ['mario.rossi', 'esempio.it'].join('@');
    assert.equal(sanitizeFileName(`${email}.txt`).includes(email), false);
  });

  test('Content-Disposition: ASCII резерва + RFC 5987', () => {
    const header = contentDisposition('attachment', 'quadro "è" 100%.pdf');
    assert.equal(
      header,
      `attachment; filename="quadro ___ 100_.pdf"; filename*=UTF-8''quadro%20%22%C3%A8%22%20100%25.pdf`,
    );
    assert.match(contentDisposition('inline', 'a.jpg'), /^inline; filename="a\.jpg"/);
  });
});

describe('подписан адрес: HMAC, срок, вързан към човека', () => {
  const key = 'k'.repeat(40);
  const now = Date.UTC(2026, 9, 9, 10, 0, 0);
  const parts = (url: string) => {
    const u = new URL(url, 'https://x.test');
    return { exp: u.searchParams.get('exp'), sig: u.searchParams.get('sig') };
  };

  test('верен подпис за същия човек и файл → ok; 5 минути', () => {
    const signed = signFileUrl(key, 'att1', 'user1', now);
    assert.match(signed.url, /^\/api\/v1\/files\/att1\?exp=\d+&sig=[\w-]{43}$/);
    assert.equal(signed.expiresAt.getTime(), now + URL_TTL_SECONDS * 1000);
    const { exp, sig } = parts(signed.url);
    assert.equal(verifyFileUrl(key, 'att1', 'user1', exp, sig, now), 'ok');
  });

  test('друг човек, друг файл, друг ключ, подправен срок → invalid', () => {
    const { exp, sig } = parts(signFileUrl(key, 'att1', 'user1', now).url);
    assert.equal(verifyFileUrl(key, 'att1', 'user2', exp, sig, now), 'invalid');
    assert.equal(verifyFileUrl(key, 'att2', 'user1', exp, sig, now), 'invalid');
    assert.equal(verifyFileUrl('z'.repeat(40), 'att1', 'user1', exp, sig, now), 'invalid');
    assert.equal(verifyFileUrl(key, 'att1', 'user1', String(Number(exp) + 1), sig, now), 'invalid');
    assert.equal(verifyFileUrl(key, 'att1', 'user1', exp, undefined, now), 'invalid');
    assert.equal(verifyFileUrl(key, 'att1', 'user1', ['1', '2'], sig, now), 'invalid');
  });

  test('изтекъл → expired (само с верен подпис); срок твърде далеч → invalid', () => {
    const { exp, sig } = parts(signFileUrl(key, 'att1', 'user1', now).url);
    const later = now + (URL_TTL_SECONDS + 1) * 1000;
    assert.equal(verifyFileUrl(key, 'att1', 'user1', exp, sig, later), 'expired');
    const future = parts(signFileUrl(key, 'att1', 'user1', now + 3600 * 1000).url);
    assert.equal(verifyFileUrl(key, 'att1', 'user1', future.exp, future.sig, now), 'invalid');
  });
});

describe('хранилище', () => {
  test('ключ: <tenant>/<yyyy>/<mm>/<128 бита hex>, без вход от клиента', () => {
    const key = newObjectKey('ckabc123', new Date(Date.UTC(2026, 0, 5)));
    assert.match(key, /^ckabc123\/2026\/01\/[a-f0-9]{32}$/);
    assert.throws(() => newObjectKey('../x'));
  });

  test('файлово: папки 700, файл 600, атомарен запис, четене и идемпотентно триене', async () => {
    const root = await mkdtemp(join(tmpdir(), 'chatchat-att-'));
    try {
      const store = new FileAttachmentStore(join(root, 'files'), PLAINTEXT_ONLY);
      const key = newObjectKey('ckt1');
      await store.put(key, Buffer.from('ciao'));
      assert.equal((await store.get(key))?.toString(), 'ciao');
      const dir = join(root, 'files', key, '..');
      assert.equal((await stat(join(root, 'files'))).mode & 0o777, 0o700);
      assert.equal((await stat(dir)).mode & 0o777, 0o700);
      assert.equal((await stat(join(root, 'files', key))).mode & 0o777, 0o600);
      assert.deepEqual(
        (await readdir(dir)).filter((f) => f.endsWith('.tmp')),
        [],
        'без временни файлове',
      );
      await store.delete(key);
      await store.delete(key);
      assert.equal(await store.get(key), null);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('ключ извън формата (път навън) → отказ и във файловото, и в паметта', async () => {
    const file = new FileAttachmentStore(tmpdir(), PLAINTEXT_ONLY);
    const memory = new MemoryAttachmentStore();
    for (const bad of ['../../etc/passwd', 'ckt1/2026/01/../../x', '/abs/path']) {
      await assert.rejects(file.get(bad));
      await assert.rejects(memory.put(bad, Buffer.from('x')));
    }
  });
});

describe('конфигурация (fail-closed)', () => {
  const base = {
    PUBLIC_BASE_URL: 'https://chatchat.test',
    DATABASE_URL: 'postgresql://x@127.0.0.1/x',
    SESSION_PEPPER: 'p'.repeat(40),
    MFA_ENC_KEY: Buffer.alloc(32, 7).toString('base64'),
  };

  test('без ATTACHMENTS_DIR — изключено; clamd по подразбиране на 3310', () => {
    const cfg = loadConfig(base);
    assert.equal(attachmentsEnabled(cfg), false);
    assert.equal(cfg.CLAMAV_PORT, 3310);
  });

  test('хранилище без ключ, с къс ключ или с ключа на сесиите → процесът не тръгва', () => {
    const dir = { ...base, ATTACHMENTS_DIR: '/srv/chatchat/files' };
    assert.throws(() => loadConfig(dir), /ATTACHMENT_URL_KEY/);
    assert.throws(() => loadConfig({ ...dir, ATTACHMENT_URL_KEY: 'corta' }), /ATTACHMENT_URL_KEY/);
    assert.throws(
      () => loadConfig({ ...dir, ATTACHMENT_URL_KEY: base.SESSION_PEPPER }),
      /различен от SESSION_PEPPER/,
    );
    const ok = loadConfig({
      ...dir,
      ATTACHMENT_URL_KEY: 'k'.repeat(32),
      FILES_KEK: Buffer.alloc(32, 9).toString('base64'),
    });
    assert.equal(attachmentsEnabled(ok), true);
  });
});
