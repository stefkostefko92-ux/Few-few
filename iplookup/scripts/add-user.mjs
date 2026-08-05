#!/usr/bin/env node
/**
 * Завежда служител в следственото издание.
 *
 * Паролата се въвежда интерактивно и НЕ минава през аргументите на командата —
 * там би останала и в историята на обвивката, и в списъка на процесите.
 *
 * Употреба:
 *   node scripts/add-user.mjs <идентификатор> "<име>" "<структура>" <роля>
 *
 * Роли: operator (заявител) · supervisor (ръководител) · auditor (одитор).
 * Споделени акаунти са забранени — един служител, един идентификатор, защото
 * одиторският запис трябва да сочи човек, не длъжност.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { randomBytes, scryptSync } from "node:crypto";

const [id, name, unit, role] = process.argv.slice(2);
const ROLES = ["operator", "supervisor", "auditor"];

if (!id || !name || !unit || !ROLES.includes(role)) {
  process.stderr.write(
    'Употреба: node scripts/add-user.mjs <идентификатор> "<име>" "<структура>" <operator|supervisor|auditor>\n',
  );
  process.exit(2);
}

/** Същият формат като `src/lib/session.ts` — параметрите живеят в самия хеш. */
function hashPassword(password) {
  const params = { N: 32768, r: 8, p: 1, maxmem: 128 * 32768 * 8 * 2 };
  const salt = randomBytes(16);
  const derived = scryptSync(password.normalize("NFKC"), salt, 64, params);
  return ["scrypt", params.N, params.r, params.p, salt.toString("base64"), derived.toString("base64")].join("$");
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

const password = await ask("Парола (поне 12 знака): ");
if (password.length < 12) {
  process.stderr.write("Твърде къса парола.\n");
  process.exit(1);
}
const again = await ask("Повтори: ");
if (password !== again) {
  process.stderr.write("Паролите не съвпадат.\n");
  process.exit(1);
}

const path = process.env.IPLOOKUP_USERS_FILE?.trim() || join(process.cwd(), "data", "users.json");
mkdirSync(dirname(path), { recursive: true, mode: 0o700 });

const users = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];
if (users.some((user) => user.id === id)) {
  process.stderr.write(`Служител „${id}" вече съществува. Изключи го или смени идентификатора.\n`);
  process.exit(1);
}

users.push({ id, name, unit, role, passwordHash: hashPassword(password) });
writeFileSync(path, `${JSON.stringify(users, null, 2)}\n`, { mode: 0o600 });

process.stdout.write(`\nЗаведен: ${id} (${name}, ${unit}, ${role})\nФайл: ${path}\n`);
