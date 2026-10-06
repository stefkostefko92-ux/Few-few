'use strict';
// Admin sessions end on a password change; the server-side rotation script; the password rules.
// A throwaway SQLite file per run: created with the OLD admin_users schema to prove the migration.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'panev-auth-'));
const DB_PATH = path.join(dir, 'panev.db');
process.env.DB_PATH = DB_PATH;
process.env.JWT_SECRET = 'panev-test-secret-0123456789abcdef0123456789';
process.env.NODE_ENV = 'test';

// The schema before token_version existed, with one admin in it.
const Database = require('better-sqlite3');
const old = new Database(DB_PATH);
old.exec(`CREATE TABLE admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  name TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), last_login_at TEXT)`);
old.prepare('INSERT INTO admin_users (email, password_hash, name) VALUES (?, ?, ?)').run('info@example.test', 'x', 'Admin');
old.close();

const db = require('../lib/db');
const auth = require('../lib/auth');
const jwt = require('jsonwebtoken');
const SCRIPT = path.join(__dirname, '..', 'scripts', 'admin-password.js');

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

function call(token) {
  const req = { cookies: { [auth.COOKIE_NAME]: token } };
  const res = { code: 200, status(c) { this.code = c; return this; }, json() { return this; } };
  let passed = false;
  auth.requireAdmin(req, res, () => { passed = true; });
  return passed ? 200 : res.code;
}

test('the migration adds token_version to an existing database', () => {
  const admin = db.getAdminByEmail('info@example.test');
  assert.equal(admin.token_version, 0);
});

test('a password change ends every older session', async () => {
  const admin = db.getAdminByEmail('info@example.test');
  const before = auth.issueToken(admin);
  assert.equal(call(before), 200);
  db.updateAdminPassword(admin.id, await auth.hashPassword('sTrong-Unrelated-41'));
  assert.equal(call(before), 401);
  assert.equal(call(auth.issueToken(db.getAdminById(admin.id))), 200);
});

test('a token without token_version (issued before this change) is refused', () => {
  const admin = db.getAdminByEmail('info@example.test');
  const legacy = jwt.sign({ sub: admin.id, email: admin.email }, process.env.JWT_SECRET, { expiresIn: '4h' });
  assert.equal(call(legacy), 401);
});

test('password rules refuse what is guessed first', () => {
  const email = 'info@example.test';
  for (const pw of ['short', 'vX9-kq2.mPz', 'Panev-Ascensori!!', 'MyAdminPassword1', 'information-desk-9', 'Holiday' + '2024!', 'Holiday-' + '2024', 'aaaaaaaaaaaaaaa']) {
    assert.ok(auth.passwordProblem(pw, email), pw);
  }
  assert.equal(auth.passwordProblem('violet-cabinet-lantern-73', email), null);
});

test('the server script: new random password once, --revoke, unknown email fails', () => {
  const env = { ...process.env, ADMIN_PASSWORD: '' };
  const v0 = db.getAdminByEmail('info@example.test').token_version;
  const out = execFileSync('node', [SCRIPT, 'info@example.test'], { env, encoding: 'utf8' });
  const pw = /: (\S{24})\n/.exec(out)[1];
  assert.equal(auth.passwordProblem(pw), null);
  const after = db.getAdminByEmail('info@example.test');
  assert.equal(after.token_version, v0 + 1);
  execFileSync('node', [SCRIPT, '--revoke', 'info@example.test'], { env });
  assert.equal(db.getAdminByEmail('info@example.test').token_version, v0 + 2);
  assert.match(execFileSync('node', [SCRIPT, '--list'], { env, encoding: 'utf8' }), /info@example\.test/);
  assert.equal(spawnSync('node', [SCRIPT, 'nobody@example.test'], { env }).status, 1);
});

test('the server script takes a chosen password only from a pipe, never from the environment', async () => {
  const email = 'info@example.test';
  const run = (args, input, extra = {}) =>
    spawnSync('node', [SCRIPT, ...args], { env: { ...process.env, ADMIN_PASSWORD: '', ...extra }, input, encoding: 'utf8' });
  const v0 = db.getAdminByEmail(email).token_version;
  const chosen = 'violet-cabinet-lantern-73';
  const ok = run(['--stdin', email], `${chosen}\n`);
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(!ok.stdout.includes(chosen), 'a chosen password is never printed');
  assert.ok(await auth.verifyPassword(chosen, db.getAdminByEmail(email).password_hash));
  assert.equal(db.getAdminByEmail(email).token_version, v0 + 1);
  for (const [input, why] of [['Summer' + '2026!\n', 'weak'], ['\n', 'empty'], [`${chosen}\nsecond-line-here-99\n`, 'two lines']]) {
    assert.equal(run(['--stdin', email], input).status, 1, why);
  }
  const fromEnv = run([email], '', { ADMIN_PASSWORD: 'grape-harbor-compass-58' });
  assert.equal(fromEnv.status, 1);
  assert.match(fromEnv.stderr, /--stdin/);
  assert.equal(db.getAdminByEmail(email).token_version, v0 + 1, 'nothing changed after the refusals');
});
