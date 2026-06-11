#!/usr/bin/env node
/* Promote a user to administrator. Usage:
   node dist/seed/admin.js <username>
   npm run promote --workspace server -- <username>
*/

import 'dotenv/config';
import { getDb } from '../db';

const username = process.argv[2];
if (!username) {
  console.error('Usage: node dist/seed/admin.js <username>');
  process.exit(1);
}

const db = getDb();
const user = db.prepare('SELECT id, is_admin FROM users WHERE username = ?').get(username) as { id: number; is_admin: number } | undefined;
if (!user) {
  console.error(`No user found with username "${username}"`);
  process.exit(2);
}
db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(user.id);
console.log(`User "${username}" (id=${user.id}) promoted to administrator.`);
