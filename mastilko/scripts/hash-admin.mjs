#!/usr/bin/env node
// Добавя/обновява админ в data/admins.json (bcrypt хеш). Употреба:
//   node scripts/hash-admin.mjs <потребител>            ← пита за паролата (препоръчано)
//   ADMIN_PASS=… node scripts/hash-admin.mjs <потребител>
// Папката за данни се взима от MASTILKO_DATA_DIR (по подразбиране ./data).
//
// Паролата УМИШЛЕНО не се приема като аргумент на командния ред — там влиза в
// историята на шела и се вижда в `ps` от всеки локален потребител.
import bcrypt from "bcryptjs";
import { promises as fs } from "fs";
import path from "path";
import readline from "readline";

const COST = 12; // по-висок от предишните 10; старите хешове пак се проверяват
                 // (cost-ът е вписан в самия хеш) — без нужда от миграция.

const [, , user] = process.argv;
if (!user) {
  console.error("Употреба: node scripts/hash-admin.mjs <потребител>");
  console.error("Паролата се въвежда интерактивно или през ADMIN_PASS=…");
  process.exit(1);
}

/** Чете паролата без да я показва на екрана. */
function askPassword(prompt) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error("Няма терминал — подай паролата през ADMIN_PASS=…"));
      return;
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Скриваме въведеното (без ехо).
    const onData = () => {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(prompt);
    };
    process.stdout.write(prompt);
    process.stdin.on("data", onData);
    rl.question("", (answer) => {
      process.stdin.off("data", onData);
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const pass = process.env.ADMIN_PASS || (await askPassword("Парола: "));
if (!pass || pass.length < 10) {
  console.error("✘ Паролата трябва да е поне 10 знака.");
  process.exit(1);
}

const dir = process.env.MASTILKO_DATA_DIR || path.join(process.cwd(), "data");
const file = path.join(dir, "admins.json");

let table = {};
try {
  table = JSON.parse(await fs.readFile(file, "utf8"));
} catch {
  /* първи админ — започваме от празно */
}
table[user] = bcrypt.hashSync(pass, COST);

await fs.mkdir(dir, { recursive: true, mode: 0o700 });
// mode 600: файлът носи bcrypt хешове — не бива да е четим за други локални
// потребители (systemd UMask=0077 важи за сервиза, не за ръчния скрипт).
await fs.writeFile(file, JSON.stringify(table, null, 2), { encoding: "utf8", mode: 0o600 });
await fs.chmod(file, 0o600);
console.log(`✔ Админ „${user}“ е записан в ${file} (mode 600, bcrypt cost ${COST})`);
