// Провизиониране на администратор от СЪРВЪРА (не от сайта).
//
// Саморегистрацията с имейл от ADMIN_EMAILS е забранена (иначе първият, който
// познае адреса, си взема правата). Затова админ акаунтът се създава оттук.
//
//   npm run admin:add -- ivan@example.com            # маркира съществуващ акаунт
//   npm run admin:add -- ivan@example.com --create   # създава акаунт с временна парола
//   npm run admin:add -- ivan@example.com --revoke   # отнема правата
//
// Пуска се като потребителя на услугата, за да не се счупят правата на базата:
//   sudo -u vizitka DATA_DIR=/opt/vizitka/data npm run admin:add -- <имейл>
import crypto from 'node:crypto';
import db from '../src/db.js';
import { hashPassword } from '../src/auth.js';
import { uniqueSlug } from '../src/slug.js';

const args = process.argv.slice(2);
const email = (args.find((a) => !a.startsWith('--')) || '').trim().toLowerCase();
const create = args.includes('--create');
const revoke = args.includes('--revoke');

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
  console.error('Употреба: npm run admin:add -- <имейл> [--create] [--revoke]');
  process.exit(1);
}

const user = db.prepare('SELECT id, email, is_admin FROM users WHERE email = ?').get(email);

if (revoke) {
  if (!user) {
    console.error(`Няма акаунт с имейл ${email}.`);
    process.exit(1);
  }
  db.prepare('UPDATE users SET is_admin = 0 WHERE id = ?').run(user.id);
  console.log(`Правата на ${email} са отнети.`);
  process.exit(0);
}

if (!user && !create) {
  console.error(
    `Няма акаунт с имейл ${email}.\n` +
      `Добави --create, за да го създам с временна парола, която веднага да смениш.`
  );
  process.exit(1);
}

if (!user) {
  const tempPassword = crypto.randomBytes(12).toString('base64url');
  const info = db
    .prepare('INSERT INTO users (email, password_hash, is_admin) VALUES (?, ?, 1)')
    .run(email, await hashPassword(tempPassword));
  // Privacy-by-default: профилът тръгва скрит, както при обикновена регистрация.
  db.prepare(
    'INSERT INTO profiles (user_id, slug, type, display_name, is_public) VALUES (?, ?, ?, ?, 0)'
  ).run(info.lastInsertRowid, uniqueSlug('admin'), 'personal', 'Администратор');
  console.log(`Създаден админ акаунт ${email}.`);
  console.log(`Временна парола: ${tempPassword}`);
  console.log('СМЕНИ я веднага след първия вход (Табло → Настройки на акаунта).');
  process.exit(0);
}

db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(user.id);
console.log(`${email} вече е администратор.`);
