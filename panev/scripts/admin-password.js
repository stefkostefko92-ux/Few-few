// ============================================================
//  PANEV ASCENSORI — admin password on the server (no login needed)
//  Usage (on the server, as the service user):
//    node scripts/admin-password.js --list               admins and their last login
//    node scripts/admin-password.js <email>              new random password, shown ONCE
//    ADMIN_PASSWORD='…' node scripts/admin-password.js <email>   that password (same rules as /admin)
//    node scripts/admin-password.js --revoke <email>     end every session, keep the password
//  Every password change and --revoke bump token_version: all sessions of that admin end at once.
// ============================================================

'use strict';

require('dotenv').config();
const crypto = require('crypto');
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

async function main(argv) {
  if (argv[0] === '--list') {
    for (const a of db.listAdmins()) {
      process.stdout.write(`${a.id}\t${a.email}\t${a.name || ''}\tсъздаден ${a.created_at}\tпоследен вход ${a.last_login_at || '—'}\n`);
    }
    return;
  }
  const revokeOnly = argv[0] === '--revoke';
  const email = String((revokeOnly ? argv[1] : argv[0]) || '').trim().toLowerCase();
  if (!email) fail('Подай имейла на админа (или --list)');
  const admin = db.getAdminByEmail(email);
  if (!admin) fail(`Няма админ с имейл ${email} (виж --list)`);

  if (revokeOnly) {
    db.revokeAdminSessions(admin.id);
    process.stdout.write(`✓ Всички сесии на ${admin.email} са прекратени.\n`);
    return;
  }

  const given = process.env.ADMIN_PASSWORD;
  const password = given || randomPassword();
  const problem = auth.passwordProblem(password, admin.email);
  if (problem) fail(problem);
  db.updateAdminPassword(admin.id, await auth.hashPassword(password));
  process.stdout.write(`✓ Нова парола за ${admin.email}; всички стари сесии са прекратени.\n`);
  if (!given) process.stdout.write(`  Паролата (показва се само сега): ${password}\n`);
}

main(process.argv.slice(2)).catch((err) => fail(err.message));
