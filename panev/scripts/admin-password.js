// ============================================================
//  PANEV ASCENSORI — admin password on the server (no login needed)
//  Usage (on the server, as the service user):
//    node scripts/admin-password.js --list               admins and their last login
//    node scripts/admin-password.js <email>              new random password, shown ONCE (preferred)
//    … | node scripts/admin-password.js --stdin <email>  the password piped on stdin (same rules as /admin)
//    node scripts/admin-password.js --revoke <email>     end every session, keep the password
//  Every password change and --revoke bump token_version: all sessions of that admin end at once.
//  A chosen password comes only through a pipe: on the command line or in ADMIN_PASSWORD it would stay
//  in the shell history and the process environment (a stale ADMIN_PASSWORD from the first seed would
//  even become the new password silently), so the script refuses it.
// ============================================================

'use strict';

require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const db = require('../lib/db');
const auth = require('../lib/auth');

function fail(message) {
  process.stderr.write(`✗ ${message}\n`);
  process.exit(1);
}

function randomPassword() {
  for (;;) {
    const pw = crypto.randomBytes(18).toString('base64url'); // 24 characters
    if (!auth.passwordProblem(pw)) return pw;
  }
}

/** The password from a pipe: one line, the trailing newline dropped. A terminal would echo it — refused. */
function passwordFromStdin() {
  if (process.stdin.isTTY) fail('--stdin чете паролата от тръба, не от терминала (виж DEPLOY.md §7а)');
  const raw = fs.readFileSync(0, 'utf8');
  const pw = raw.replace(/\r?\n$/, '');
  if (!pw) fail('Празна парола на stdin');
  if (/[\r\n]/.test(pw)) fail('На stdin се очаква един ред — само паролата');
  return pw;
}

async function main(argv) {
  if (process.env.ADMIN_PASSWORD) {
    fail('ADMIN_PASSWORD не се чете от тук (остава в историята и средата) — махни я и подай паролата през --stdin');
  }
  const [first, second] = argv;
  if (first === '--list') {
    for (const a of db.listAdmins()) {
      process.stdout.write(`${a.id}\t${a.email}\t${a.name || ''}\tсъздаден ${a.created_at}\tпоследен вход ${a.last_login_at || '—'}\n`);
    }
    return;
  }
  const mode = first === '--revoke' || first === '--stdin' ? first : null;
  const email = String((mode ? second : first) || '').trim().toLowerCase();
  if (!email || email.startsWith('--')) fail('Подай имейла на админа (или --list)');
  const admin = db.getAdminByEmail(email);
  if (!admin) fail(`Няма админ с имейл ${email} (виж --list)`);

  if (mode === '--revoke') {
    db.revokeAdminSessions(admin.id);
    process.stdout.write(`✓ Всички сесии на ${admin.email} са прекратени.\n`);
    return;
  }

  const chosen = mode === '--stdin';
  const password = chosen ? passwordFromStdin() : randomPassword();
  const problem = auth.passwordProblem(password, admin.email);
  if (problem) fail(problem);
  db.updateAdminPassword(admin.id, await auth.hashPassword(password));
  process.stdout.write(`✓ Нова парола за ${admin.email}; всички стари сесии са прекратени.\n`);
  if (!chosen) process.stdout.write(`  Паролата (показва се само сега): ${password}\n`);
}

main(process.argv.slice(2)).catch((err) => fail(err.message));
