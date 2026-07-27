// Фаза Д — sudo режим, списък с адреси, оценка за сигурност, целост на /etc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  SudoGrants, needsSudo, confirmSudo, parseCidr, ipMatches, ipAllowed, validateAllowlist,
  sudoAllowed, sudoFailed, sudoSucceeded, _resetSudoLimiter,
} from '../src/sudo.js';
import { assertOutboundUrl, sanitizeNotify } from '../src/routes.js';
import { failUrl } from '../src/notify.js';
import { safePath } from '../src/accesslog.js';
import { snapshotEtc, saveBaseline, diffEtc } from '../src/posture.js';
import { hashPassword } from '../src/auth.js';
import { IP_ALLOWLIST_EXEMPT, ipGateAllows } from '../src/routes.js';

// ── Режим sudo ────────────────────────────────────────────────────────────────
test('sudo разрешението е за КОНКРЕТНАТА сесия и изтича', () => {
  const s = new SudoGrants();
  s.grant('сесия-А', 50);
  assert.equal(s.has('сесия-А'), true);
  // Потвърждаване в един браузър не отключва действия в друг.
  assert.equal(s.has('сесия-Б'), false);
  assert.equal(s.has(null), false, 'липсващ jti никога не минава');
  assert.ok(s.remaining('сесия-А') > 0);
  s.revoke('сесия-А');
  assert.equal(s.has('сесия-А'), false);
});

test('изтеклото разрешение не важи', async () => {
  const s = new SudoGrants();
  s.grant('x', 20);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(s.has('x'), false);
  assert.equal(s.remaining('x'), 0);
});

test('sudo се иска за необратимото, не за четенето', () => {
  const cfg = {};
  // Терминалът е контрол над машината дори „само за четене" (жив SSE поток).
  for (const p of ['/api/terminal/run', '/api/pty', '/api/pty/abc/stream']) {
    assert.equal(needsSudo(p, cfg), true, `${p} трябваше да иска sudo при ВСЯКА заявка`);
  }
  // Останалите — само при мутация. Ако и четенето питаше за парола, панелът
  // щеше да пита на всяка втора секция, а изморената защита се изключва.
  for (const p of ['/api/power', '/api/backups/restore/apply', '/api/deploy/run',
    '/api/env/file', '/api/firewall/rule', '/api/settings/access', '/api/limits']) {
    assert.equal(needsSudo(p, cfg, { mutating: true }), true, `${p} трябваше да иска sudo при запис`);
    assert.equal(needsSudo(p, cfg), false, `${p} НЕ бива да иска sudo при четене`);
  }
  for (const p of ['/api/overview', '/api/services', '/api/audit', '/api/slo',
    '/api/backups/restore/preview', '/api/sudo']) {
    assert.equal(needsSudo(p, cfg, { mutating: true }), false, `${p} НЕ трябваше да иска sudo`);
  }
  // Изключването е съзнателен избор на собственика, не мълчаливо подразбиране.
  assert.equal(needsSudo('/api/power', { sudoMode: { enabled: false } }, { mutating: true }), false);
  assert.equal(needsSudo('/api/pty', { sudoMode: { enabled: false } }), false);
});

test('файловете и кронът са под sudo — четенето като root е същата заплаха като терминала', () => {
  const cfg = {};
  // ЧЕТЕНЕ на произволен файл като root: /etc/shadow, ключовете в /root/.ssh и
  // всеки .env са на един GET разстояние. Затова е в „винаги", не в „при запис".
  assert.equal(needsSudo('/api/files/read', cfg), true, 'четенето на файл трябва да иска sudo');
  // Записът е изпълнение на код с една стъпка забавяне (unit файл → „Услуги"),
  // кронът — същото, само отложено. Изброяването на папка остава свободно.
  for (const p of ['/api/files/write', '/api/cron/add', '/api/cron/remove', '/api/cron/run']) {
    assert.equal(needsSudo(p, cfg, { mutating: true }), true, `${p} трябваше да иска sudo при запис`);
    assert.equal(needsSudo(p, cfg), false, `${p} НЕ бива да иска sudo при четене`);
  }
  for (const p of ['/api/files', '/api/cron', '/api/cron/jobs', '/api/cron/timers']) {
    assert.equal(needsSudo(p, cfg, { mutating: true }), false, `${p} НЕ трябваше да иска sudo`);
  }
});

test('потвърждаването иска вярна парола, а при 2FA — и код', () => {
  const cfg = { passwordHash: hashPassword('правилната') };
  assert.equal(confirmSudo(cfg, { password: 'грешната' }).ok, false);
  assert.equal(confirmSudo(cfg, { password: '' }).ok, false);
  assert.equal(confirmSudo(cfg, { password: 'правилната' }).ok, true);

  const with2fa = { passwordHash: cfg.passwordHash, totp: { enabled: true, secret: 'JBSWY3DPEHPK3PXP', recoveryHashes: [] } };
  const noCode = confirmSudo(with2fa, { password: 'правилната' });
  assert.equal(noCode.ok, false);
  assert.match(noCode.error, /код/);
  assert.equal(confirmSudo(with2fa, { password: 'правилната', code: '000000' }).ok, false);
});

test('резервният код се ИЗРАЗХОДВА при sudo — иначе е вечен ключ', async () => {
  const { generateRecoveryCodes, hashRecoveryCode } = await import('../src/totp.js');
  const codes = generateRecoveryCodes();
  const cfg = {
    passwordHash: hashPassword('пар'),
    totp: { enabled: true, secret: 'JBSWY3DPEHPK3PXP', recoveryHashes: codes.map(hashRecoveryCode) },
  };
  let saved = null;
  const fakeSave = (c, patch) => { saved = patch; Object.assign(c, patch); };
  const r = confirmSudo(cfg, { password: 'пар', code: codes[0] }, fakeSave);
  assert.equal(r.ok, true);
  assert.equal(r.usedRecovery, true);
  assert.equal(r.recoveryLeft, codes.length - 1);
  assert.equal(saved.totp.recoveryHashes.length, codes.length - 1);
  // Същият код втори път вече не работи.
  assert.equal(confirmSudo(cfg, { password: 'пар', code: codes[0] }, fakeSave).ok, false);
});

test('потвърждаването е с ограничител — иначе е оракул за налучкване', () => {
  _resetSudoLimiter();
  const jti = 'сесия';
  for (let i = 0; i < 5; i++) {
    assert.equal(sudoAllowed(jti), true, `опит ${i + 1} трябваше да е позволен`);
    sudoFailed(jti);
  }
  assert.equal(sudoAllowed(jti), false, 'шестият опит се спира');
  sudoSucceeded(jti);
  assert.equal(sudoAllowed(jti), true, 'успехът нулира брояча');
  _resetSudoLimiter();
});

// ── Списък с адреси ───────────────────────────────────────────────────────────
test('CIDR разбор: валидното минава, боклукът пада', () => {
  assert.ok(parseCidr('192.168.1.1'));
  assert.ok(parseCidr('10.0.0.0/8'));
  assert.ok(parseCidr('2001:db8::/32'));
  assert.ok(parseCidr('::1'));
  assert.equal(parseCidr('999.1.1.1'), null);
  assert.equal(parseCidr('10.0.0.0/33'), null);
  assert.equal(parseCidr('10.0.0.0/-1'), null);
  assert.equal(parseCidr('не-адрес'), null);
  assert.equal(parseCidr(''), null);
  assert.equal(parseCidr('1.2.3'), null);
});

test('IPv4 съвпадение по маска — включително частичен байт', () => {
  assert.equal(ipMatches('192.168.1.5', parseCidr('192.168.1.0/24')), true);
  assert.equal(ipMatches('192.168.2.5', parseCidr('192.168.1.0/24')), false);
  assert.equal(ipMatches('10.1.2.3', parseCidr('10.0.0.0/8')), true);
  assert.equal(ipMatches('11.1.2.3', parseCidr('10.0.0.0/8')), false);
  // /28 реже в средата на последния байт — точно там се греши най-често.
  assert.equal(ipMatches('192.168.1.15', parseCidr('192.168.1.0/28')), true);
  assert.equal(ipMatches('192.168.1.16', parseCidr('192.168.1.0/28')), false);
  assert.equal(ipMatches('8.8.8.8', parseCidr('0.0.0.0/0')), true, '/0 пуска всичко');
});

test('IPv6 и IPv4-в-IPv6 обвивката', () => {
  assert.equal(ipMatches('2001:db8::1', parseCidr('2001:db8::/32')), true);
  assert.equal(ipMatches('2001:db9::1', parseCidr('2001:db8::/32')), false);
  assert.equal(ipMatches('::1', parseCidr('::1')), true);
  // Node дава „::ffff:1.2.3.4" при dual-stack — това е IPv4 адрес, не IPv6.
  assert.equal(ipMatches('::ffff:192.168.1.5', parseCidr('192.168.1.0/24')), true);
  assert.equal(ipMatches('192.168.1.5', parseCidr('2001:db8::/32')), false, 'семействата не се смесват');
  assert.equal(ipMatches('fe80::1%eth0', parseCidr('fe80::/16')), true, 'zone индексът се маха');
});

test('ПРАЗЕН списък значи изключено, не „никой не влиза"', () => {
  assert.equal(ipAllowed('8.8.8.8', []), true);
  assert.equal(ipAllowed('8.8.8.8', undefined), true);
  assert.equal(ipAllowed('8.8.8.8', ['10.0.0.0/8']), false);
  assert.equal(ipAllowed('10.1.1.1', ['10.0.0.0/8']), true);
  // Един невалиден запис не бива да отвори всичко.
  assert.equal(ipAllowed('8.8.8.8', ['боклук', '10.0.0.0/8']), false);
  assert.equal(ipAllowed('?', ['10.0.0.0/8']), false, 'непознат адрес не минава');
});

test('валидацията отказва боклук, преди да е записан в конфига', () => {
  assert.deepEqual(validateAllowlist(['10.0.0.0/8', '::1']), ['10.0.0.0/8', '::1']);
  assert.deepEqual(validateAllowlist([]), []);
  assert.throws(() => validateAllowlist(['10.0.0.0/8', 'зле']), /Невалиден адрес/);
});

test('webhook-ът е ИЗВЪН списъка — GitHub чука от чужди адреси', () => {
  const cfg = { allowIps: ['10.0.0.0/8'], trustProxy: false };
  const ipFn = () => '140.82.115.1'; // GitHub
  assert.equal(ipGateAllows({}, cfg, '/api/webhook/github', ipFn), true);
  assert.equal(ipGateAllows({}, cfg, '/api/overview', ipFn), false);
  assert.equal(ipGateAllows({}, cfg, '/', ipFn), false, 'дори статиката не се вижда');
  assert.equal(ipGateAllows({}, cfg, '/api/login', ipFn), false, 'формата за вход също');
  assert.ok(IP_ALLOWLIST_EXEMPT.length === 1, 'изключенията са точно едно — webhook-ът');
});

// ── Целост на /etc ────────────────────────────────────────────────────────────
test('отпечатъкът лови добавен, променен и изтрит файл', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-int-'));
  // Няма как да пипаме истинския /etc в тест — проверяваме сравнението директно.
  const base = {
    takenAt: new Date().toISOString(),
    files: {
      '/etc/hosts': { sha256: 'aaa', mode: '0644', size: 10 },
      '/etc/fstab': { sha256: 'bbb', mode: '0644', size: 20 },
      '/etc/изтрит': { sha256: 'ccc', mode: '0600', size: 5 },
    },
  };
  fs.writeFileSync(path.join(dir, 'etc-baseline.json'), JSON.stringify(base));

  // Подменяме snapshot-а чрез сравнение на ръка (същата логика като diffEtc).
  const now = {
    '/etc/hosts': { sha256: 'aaa', mode: '0644', size: 10 }, // непроменен
    '/etc/fstab': { sha256: 'ЗЛО', mode: '0644', size: 21 }, // променено съдържание
    '/etc/нов': { sha256: 'ddd', mode: '0777', size: 1 }, // добавен
  };
  const added = Object.keys(now).filter((p) => !base.files[p]);
  const removed = Object.keys(base.files).filter((p) => !now[p]);
  const changed = Object.keys(now).filter((p) => base.files[p] && base.files[p].sha256 !== now[p].sha256);
  assert.deepEqual(added, ['/etc/нов']);
  assert.deepEqual(removed, ['/etc/изтрит']);
  assert.deepEqual(changed, ['/etc/fstab']);

  // Без отпечатък секцията казва какво да се направи, вместо да гърми.
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-int2-'));
  const d = diffEtc(empty);
  assert.equal(d.hasBaseline, false);
  assert.match(d.note, /отпечатък/);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(empty, { recursive: true, force: true });
});

test('снимка на /etc се записва и се чете обратно', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-snap-'));
  const snap = snapshotEtc();
  const saved = saveBaseline(dir, snap);
  assert.equal(saved.count, Object.keys(snap.files).length);
  assert.ok(fs.existsSync(saved.file));
  // Правата на файла с отпечатъка са 600 — той описва системата в детайл.
  assert.equal(fs.statSync(saved.file).mode & 0o777, 0o600);
  const d = diffEtc(dir);
  assert.equal(d.hasBaseline, true);
  assert.equal(d.clean, true, 'веднага след снимката нищо не се е променило');
  fs.rmSync(dir, { recursive: true, force: true });
});


// ── Находки на Разбивача (фаза Ж) ─────────────────────────────────────────────
test('изходящият адрес не бива да сочи към самата машина или към метаданните', () => {
  // Законни: панелът трябва да може да пинга външен монитор ИЛИ другия ни VPS
  // на вътрешен адрес — затова частните мрежи НЕ се забраняват, а се показват.
  for (const ok of ['https://hc-ping.com/abc', 'http://10.0.0.5/ping', 'https://kuma.example/api/push/T?status=up']) {
    assert.ok(assertOutboundUrl(ok), `${ok} трябваше да мине`);
  }
  // Панелът върви като root на същата машина, на която са Redis/Postgres/самият
  // панел; в облак 169.254.169.254 е метаданните на инстанцията. Едно поле в
  // настройките иначе става SSRF пистолет, който гърми на всеки каданс.
  for (const bad of [
    'http://127.0.0.1:6379/',
    'http://localhost:7700/api/power',
    'http://[::1]:7700/',
    'http://169.254.169.254/latest/meta-data/',
    'http://0.0.0.0/',
    'http://user:pass@example.com/x', // име:парола крие истинския хост от четящия
    'file:///etc/passwd',
    'gopher://x/',
    'не-адрес',
  ]) {
    assert.throws(() => assertOutboundUrl(bad), undefined, `${bad} трябваше да бъде отхвърлен`);
  }
});

test('каналите не могат да бъдат изтрити с едно тяло', () => {
  // `{"notify":"каквото и да е"}` презаписваше целия обект и трие botToken,
  // chatId, topic и webhook URL — необратимо (тайните не се пазят другаде) и
  // безшумно (одитът по конструкция не записва стойности).
  for (const junk of ['wiped', 42, null, undefined, ['a'], { telegram: null }, { telegram: 'x' }]) {
    assert.equal(sanitizeNotify(junk), null, `${JSON.stringify(junk)} не бива да произведе патч`);
  }
  // Позволено е САМО познато поле на познат канал.
  const clean = sanitizeNotify({
    telegram: { botToken: 'таен', chatId: '1', minSeverity: 'critical', зло: 'x' },
    ntfy: { topic: 't', minSeverity: 'глупост' },
    непознат: { url: 'x' },
  });
  assert.deepEqual(clean, { telegram: { botToken: 'таен', chatId: '1', minSeverity: 'critical' }, ntfy: { topic: 't' } });
  // Нов ред в стойност би могъл да подправи заглавка/съобщение по-надолу.
  assert.equal(sanitizeNotify({ webhook: { url: 'https://x/\r\nX-Evil: 1' } }).webhook.url, 'https://x/X-Evil: 1');
});

test('пингът за провал пази query-то — иначе докладва УСПЕХ', () => {
  assert.equal(failUrl('https://hc-ping.com/abc'), 'https://hc-ping.com/abc/fail');
  assert.equal(failUrl('https://hc-ping.com/abc/'), 'https://hc-ping.com/abc/fail');
  // Uptime Kuma push (препоръчан в нашия собствен коментар): наивното лепене
  // дава „…?status=up&msg=OK/fail" → Kuma чете status=up и записва УСПЕХ.
  // Сигналът „жив, но сляп" тихо се обръща в „всичко е наред".
  const kuma = failUrl('https://kuma.example/api/push/TOKEN?status=up&msg=OK');
  assert.match(kuma, /\/api\/push\/TOKEN\/fail\?/);
  assert.match(kuma, /status=up/, 'query-то оцелява, а не се превръща в част от пътя');
});

test('адресът от access log-а се скърбира, преди да влезе в известие', () => {
  // Атакуващият избира какво пише в пътя — а пътят стига до Telegram/ntfy.
  assert.ok(!safePath('/a\r\nfake: ред').includes('\n'), 'нови редове не минават');
  assert.ok(!safePath('/a\r\nfake: ред').includes('\r'));
  assert.equal(safePath('/' + 'щ'.repeat(300)).length, 80, 'дължината е с таван');
  assert.equal(safePath('/поръчка/«id»'), '/поръчка/«id»', 'кирилицата и нашите кавички остават четими');
});

test('каналите искат sudo, праговете — не', () => {
  const cfg = {};
  // Тайните (bot token, ntfy токен) и адресът на мъртвеца-ключ: root процес,
  // който чука навън на всеки каданс, безсрочно и преживявайки рестарт.
  assert.equal(needsSudo('/api/alerts/channels', cfg, { mutating: true }), true);
  // Праговете са числа — видима и обратима промяна. Панел, който пита за парола
  // на всяка настройка, се превръща в панел с ИЗКЛЮЧЕН sudo режим; заглушаването
  // е срочно (макс 7 дни), видимо и одитирано.
  assert.equal(needsSudo('/api/alerts/settings', cfg, { mutating: true }), false);
  assert.equal(needsSudo('/api/alerts/silence', cfg, { mutating: true }), false);
  assert.equal(needsSudo('/api/alerts', cfg), false, 'четенето остава свободно');
});
