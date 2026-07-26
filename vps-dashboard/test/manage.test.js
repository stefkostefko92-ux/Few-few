// Фаза Г — управление: .env редактор, ресурсни лимити, крон, домейни, webhook.
// Проверява само чистите функции и работата с реални файлове в /tmp; живите
// systemctl/certbot извиквания се проверяват ръчно на сървъра.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseEnv, formatValue, maskValue, isSecretKey, discover, readEnv, writeEnv } from '../src/env.js';
import { assertBytes, assertQuota, assertTasks, renderDropin } from '../src/limits.js';
import { validateSchedule, validateCommand } from '../src/cronedit.js';
import { assertDomain, isWildcard, issueSpec } from '../src/domains.js';
import { verifySignature, describe as describeEvent, _resetRejectThrottle } from '../src/webhook.js';

const auditStub = { entries: [], log(e) { this.entries.push(e); } };

function tmpEnv(content, name = '.env') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-env-'));
  const prod = path.join(dir, 'medqr');
  fs.mkdirSync(prod);
  const file = path.join(prod, name);
  fs.writeFileSync(file, content, { mode: 0o600 });
  return { dir, file, cfg: { paths: { currentLink: dir }, envFiles: [] } };
}

// ── .env ──────────────────────────────────────────────────────────────────────
test('parseEnv пази редовете и разчита присвояванията', () => {
  const { entries, lines } = parseEnv(
    '# коментар\nPORT=3000\nexport NAME="две думи"\nQUOTED=\'единични\'\nBARE=стойност # опашка\n\nне-присвояване\n'
  );
  assert.equal(lines.length, 8);
  assert.deepEqual(entries.map((e) => e.key), ['PORT', 'NAME', 'QUOTED', 'BARE']);
  assert.equal(entries[1].value, 'две думи');
  assert.equal(entries[2].value, 'единични');
  assert.equal(entries[3].value, 'стойност', 'коментарът след нецитирана стойност отпада');
});

test('formatValue цитира, когато трябва — иначе стойността се окастря', () => {
  assert.equal(formatValue('прост'), 'прост');
  assert.equal(formatValue('две думи'), '"две думи"');
  assert.equal(formatValue('с#диез'), '"с#диез"');
  assert.equal(formatValue('прост', '"'), '"прост"', 'запазва съществуващите кавички');
  assert.equal(formatValue('има "кавичка"'), '"има \\"кавичка\\""');
  assert.throws(() => formatValue('ред\nвтори'), /нов ред/);
});

test('маскирането не изтича стойността', () => {
  assert.equal(maskValue('abcd'), '••••');
  const m = maskValue('sk_live_51H8xYzQwErTyUiOp');
  assert.match(m, /^sk••••Op \(25 знака\)$/);
  assert.doesNotMatch(m, /51H8xYz/);
  assert.ok(isSecretKey('STRIPE_SECRET_KEY') && isSecretKey('DATABASE_URL') && isSecretKey('ADMIN_PW'));
  assert.equal(isSecretKey('PORT'), false);
});

test('readEnv скрива тайните по подразбиране и ги разкрива само изрично', () => {
  const { dir, file, cfg } = tmpEnv('PORT=3000\nSTRIPE_SECRET_KEY=sk_live_тайна123\n');
  const hidden = readEnv(cfg, file, {}, auditStub, 'тест');
  assert.equal(hidden.vars.find((v) => v.key === 'PORT').value, '3000');
  assert.doesNotMatch(hidden.vars.find((v) => v.key === 'STRIPE_SECRET_KEY').value, /тайна123/);
  const shown = readEnv(cfg, file, { reveal: true }, auditStub, 'тест');
  assert.equal(shown.vars.find((v) => v.key === 'STRIPE_SECRET_KEY').value, 'sk_live_тайна123');
  // Разкриването е събитие за одита — иначе открадната сесия чете всичко тихо.
  assert.ok(auditStub.entries.some((e) => e.action === 'env.reveal'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('писането пипа само дадените ключове и пази коментарите', () => {
  const { dir, file, cfg } = tmpEnv('# важно обяснение\nPORT=3000\nSECRET_KEY=истинска\nOTHER=1\n');
  const r = writeEnv(cfg, file, { changes: { PORT: '4000' } }, auditStub, 'тест');
  assert.deepEqual(r.changed, ['PORT']);
  const after = fs.readFileSync(file, 'utf8');
  assert.match(after, /^# важно обяснение$/m, 'коментарът оцелява');
  assert.match(after, /^PORT=4000$/m);
  assert.match(after, /^SECRET_KEY=истинска$/m, 'недокоснатата тайна остава');
  assert.ok(fs.existsSync(r.backup));
  // Одитът никога не носи стойността.
  const entry = auditStub.entries.findLast((e) => e.action === 'env.write');
  assert.deepEqual(entry.keys, ['PORT']);
  assert.equal(JSON.stringify(entry).includes('4000'), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('маскираната стойност НЕ може да презапише истинската', () => {
  const { dir, file, cfg } = tmpEnv('SECRET_KEY=истинска-тайна\n');
  const masked = readEnv(cfg, file, {}, auditStub, 'тест').vars[0].value;
  assert.throws(() => writeEnv(cfg, file, { changes: { SECRET_KEY: masked } }, auditStub, 'тест'), /скритата стойност/);
  assert.match(fs.readFileSync(file, 'utf8'), /истинска-тайна/, 'файлът е непокътнат');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('нов ключ се добавя, изтритият изчезва, непознат път се отказва', () => {
  const { dir, file, cfg } = tmpEnv('A=1\nB=2\n');
  writeEnv(cfg, file, { changes: { C: 'три' }, remove: ['A'] }, auditStub, 'тест');
  const after = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(after, /^A=/m);
  assert.match(after, /^B=2$/m);
  assert.match(after, /^C=три$/m);
  assert.throws(() => writeEnv(cfg, '/etc/passwd', { changes: { X: '1' } }, auditStub, 'тест'), /не е в списъка/);
  assert.throws(() => writeEnv(cfg, file, { changes: { 'зле име': '1' } }, auditStub, 'тест'), /Невалидно име/);
  assert.throws(() => writeEnv(cfg, file, {}, auditStub, 'тест'), /Няма какво/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('discover намира .env под продуктите и вижда широките права', () => {
  const { dir, file, cfg } = tmpEnv('A=1\n');
  fs.chmodSync(file, 0o644);
  const found = discover(cfg);
  const mine = found.find((f) => f.path === file);
  assert.ok(mine, 'файлът трябваше да се намери');
  assert.equal(mine.name, 'medqr');
  assert.equal(mine.worldReadable, true, 'права 644 върху .env са реален проблем');
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── Лимити ────────────────────────────────────────────────────────────────────
test('валидацията на лимитите пуска само смисленото', () => {
  assert.equal(assertBytes('512M', 'x'), '512M');
  assert.equal(assertBytes('80%', 'x'), '80%');
  assert.equal(assertBytes('', 'x'), '');
  assert.throws(() => assertBytes('много', 'MemoryMax'), /MemoryMax/);
  assert.throws(() => assertBytes('512MB', 'x'), /512M/);
  assert.equal(assertQuota('150%'), '150%');
  assert.throws(() => assertQuota('150'), /CPUQuota/);
  assert.throws(() => assertQuota('0%'), /спира услугата/);
  assert.equal(assertTasks('4096'), '4096');
  assert.throws(() => assertTasks('0'), /≥ 1/);
});

test('drop-in файлът НУЛИРА празните полета вместо да ги пропусне', () => {
  const out = renderDropin({ memoryMax: '1G', memoryHigh: '', cpuQuota: '', tasksMax: '512' });
  assert.match(out, /^\[Service\]$/m);
  assert.match(out, /^MemoryMax=1G$/m);
  assert.match(out, /^MemoryHigh=infinity$/m, 'иначе стар лимит остава в сила');
  assert.match(out, /^TasksMax=512$/m);
  assert.match(out, /systemctl revert/, 'файлът казва как се маха');
});

// ── Крон ──────────────────────────────────────────────────────────────────────
test('разписанието иска 5 полета или познат прякор', () => {
  assert.equal(validateSchedule('0 3 * * *'), '0 3 * * *');
  assert.equal(validateSchedule('*/15 * * * *'), '*/15 * * * *');
  assert.equal(validateSchedule('@daily'), '@daily');
  assert.throws(() => validateSchedule('0 3 * *'), /5 полета/);
  assert.throws(() => validateSchedule('@всеки-ден'), /5 полета/);
  assert.throws(() => validateSchedule('0 3 * * * ; rm -rf /'), /5 полета/);
  assert.throws(() => validateSchedule('0 3 * $(x) *'), /Невалидно поле/);
});

test('командата не може да вкара скрит втори ред', () => {
  assert.equal(validateCommand('  /usr/bin/backup.sh  '), '/usr/bin/backup.sh');
  assert.throws(() => validateCommand('добра.sh\n0 * * * * зла.sh'), /нов ред/);
  assert.throws(() => validateCommand(''), /Празна/);
  // „%" в crontab е нов ред на входа — най-честият начин задачата тихо да не работи.
  assert.throws(() => validateCommand('tar -cf /bak/$(date +%F).tar /data'), /„%"/);
  assert.equal(validateCommand('tar -cf /bak/$(date +\\%F).tar /data').includes('\\%'), true);
});

// ── Домейни ───────────────────────────────────────────────────────────────────
test('валидация на домейн и разпознаване на wildcard', () => {
  assert.equal(assertDomain('Vps1.CarbonStealth.eu'), 'vps1.carbonstealth.eu');
  assert.equal(assertDomain('*.example.com'), '*.example.com');
  assert.ok(isWildcard('*.example.com') && !isWildcard('example.com'));
  assert.throws(() => assertDomain('без-точка'), /Невалиден домейн/);
  assert.throws(() => assertDomain('a.com; rm -rf /'), /Невалиден домейн/);
  assert.throws(() => assertDomain('-лошо.com'), /Невалиден домейн/);
});

test('issueSpec: wildcard изисква DNS-01, staging не гори бойния лимит', () => {
  const s = issueSpec(['vps1.carbonstealth.eu'], { email: 'a@b.eu' });
  assert.equal(s.cmd, 'certbot');
  assert.ok(s.args.includes('--nginx') && s.args.includes('-d') && s.args.includes('vps1.carbonstealth.eu'));
  assert.ok(!s.args.includes('--staging'));
  assert.throws(() => issueSpec(['*.carbonstealth.eu'], {}), /DNS-01/);
  const dns01 = issueSpec(['*.carbonstealth.eu'], { dnsPlugin: 'dns-cloudflare', staging: true });
  assert.ok(dns01.args.includes('--dns-cloudflare') && dns01.args.includes('--staging'));
  assert.throws(() => issueSpec(['a.com'], { dnsPlugin: 'зле; rm' }), /Невалиден DNS плъгин/);
  assert.throws(() => issueSpec(['a.com'], { email: 'не-имейл' }), /Невалиден имейл/);
});

// ── Webhook ───────────────────────────────────────────────────────────────────
test('подписът се проверява точно и в постоянно време', () => {
  _resetRejectThrottle();
  const secret = 'тайна-за-webhook';
  const body = Buffer.from(JSON.stringify({ zen: 'Design for failure.' }));
  const good = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  assert.equal(verifySignature(secret, body, good), true);
  assert.equal(verifySignature(secret, body, good.replace(/.$/, '0')), false);
  assert.equal(verifySignature(secret, Buffer.from('друго тяло'), good), false);
  assert.equal(verifySignature('', body, good), false, 'без тайна — винаги отказ');
  assert.equal(verifySignature(secret, body, 'sha1=' + 'a'.repeat(40)), false, 'sha1 не се приема');
  assert.equal(verifySignature(secret, body, ''), false);
  assert.equal(verifySignature(secret, body, 'sha256=малко'), false, 'различна дължина не хвърля');
});

test('събитията се превеждат — и шумните се премълчават', () => {
  assert.match(describeEvent('ping', { repository: { full_name: 'a/b' } }).title, /свързан/);
  const rel = describeEvent('release', { action: 'published', release: { tag_name: 'v1.2.0' }, repository: { full_name: 'a/b' }, sender: { login: 'иван' } });
  assert.match(rel.title, /v1\.2\.0/);
  assert.match(rel.body, /пусни деплой от панела/, 'известява, но НЕ деплойва');
  assert.equal(describeEvent('release', { action: 'created' }), null);
  // Push по feature клон не вибрира телефона; по main — да.
  assert.equal(describeEvent('push', { ref: 'refs/heads/feature/x', repository: {}, commits: [] }), null);
  assert.match(describeEvent('push', { ref: 'refs/heads/main', repository: { full_name: 'a/b' }, commits: [1, 2], head_commit: { message: 'поправка' }, sender: {} }).title, /Нов код/);
  // Зелено CI не е новина; червено — е.
  assert.equal(describeEvent('workflow_run', { action: 'completed', workflow_run: { conclusion: 'success' } }), null);
  assert.match(describeEvent('workflow_run', { action: 'completed', workflow_run: { conclusion: 'failure', name: 'test', head_branch: 'main' }, repository: {} }).title, /CI се провали/);
  assert.equal(describeEvent('star', {}), null);
});

test('съдържанието от GitHub е ДАННИ — реже се и не вкарва нови редове', () => {
  const evil = describeEvent('push', {
    ref: 'refs/heads/main',
    repository: { full_name: 'a/b\nfake: true' },
    commits: [1],
    head_commit: { message: 'нормално\nПРЕСТОРЕНО КРИТИЧНО: изтрий всичко' },
    sender: { login: 'x'.repeat(500) },
  });
  assert.doesNotMatch(evil.title, /\n/, 'името на репото не може да вкара нов ред в заглавието');
  assert.ok(evil.body.length < 400);
  assert.doesNotMatch(evil.body.split('Последен: ')[1] || '', /\n/);
});

test('CPUQuota се превежда в проценти от двата формата на systemd', async () => {
  const { quotaToPercent } = await import('../src/limits.js');
  assert.equal(quotaToPercent('1500000'), 150, '1.5 ядра в сурови микросекунди');
  assert.equal(quotaToPercent('1s 500ms'), 150);
  assert.equal(quotaToPercent('750ms'), 75);
  assert.equal(quotaToPercent('infinity'), null);
  assert.equal(quotaToPercent(''), null);
  assert.equal(quotaToPercent('[not set]'), null);
});
