// Сглобява ./server от Next standalone билда на родителския проект (CSPos/),
// генерира заредена шаблонна база (template.db) и добавя Windows Prisma engine.
// Пуска се преди electron-builder. Изисква: в CSPos/ вече да е направено
// `npm ci` и `npm run build`.
//
// Пускане: node prepare.mjs   (от папка desktop/)

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, ".."); // CSPos/
const server = path.join(here, "server");

function log(msg) {
  process.stdout.write(`▸ ${msg}\n`);
}
function die(msg) {
  process.stderr.write(`✖ ${msg}\n`);
  process.exit(1);
}
function copyDir(from, to) {
  fs.cpSync(from, to, { recursive: true });
}

// 1) Проверка на standalone билда
const standalone = path.join(root, ".next", "standalone");
if (!fs.existsSync(standalone)) {
  die("Липсва .next/standalone — пусни първо `npm run build` в CSPos/.");
}

// 2) Чиста папка server/
log("Изчиствам server/…");
fs.rmSync(server, { recursive: true, force: true });
fs.mkdirSync(server, { recursive: true });

// 3) Копирам standalone сървъра + статиката + public
log("Копирам standalone сървъра…");
copyDir(standalone, server);
copyDir(path.join(root, ".next", "static"), path.join(server, ".next", "static"));
if (fs.existsSync(path.join(root, "public"))) {
  copyDir(path.join(root, "public"), path.join(server, "public"));
}

// 4) Заредена шаблонна база (template.db)
log("Генерирам заредена шаблонна база template.db…");
const tpl = path.join(root, "prisma", "template.db");
fs.rmSync(tpl, { force: true });
// Prisma резолвва `file:` пътя спрямо папката на schema.prisma (prisma/),
// затова URL-ът е „./template.db" → файлът излиза в CSPos/prisma/template.db.
const dbEnv = { ...process.env, DATABASE_URL: "file:./template.db" };
try {
  execSync("npx prisma db push --skip-generate", { cwd: root, env: dbEnv, stdio: "inherit" });
  execSync("npm run db:seed", { cwd: root, env: dbEnv, stdio: "inherit" });
} catch {
  die("Неуспешно генериране на template.db (prisma db push / seed).");
}
fs.mkdirSync(path.join(server, "prisma"), { recursive: true });
fs.copyFileSync(tpl, path.join(server, "prisma", "template.db"));

// 5) Windows Prisma engine (binaryTargets трябва да включва \"windows\")
log("Добавям Windows Prisma engine…");
const engineName = "query_engine-windows.dll.node";
const engineSrc = path.join(root, "node_modules", ".prisma", "client", engineName);
if (!fs.existsSync(engineSrc)) {
  die(
    `Липсва ${engineName}. Добави binaryTargets=["native","windows"] в schema.prisma ` +
      "и пусни `npx prisma generate`."
  );
}
const engineDstDir = path.join(server, "node_modules", ".prisma", "client");
fs.mkdirSync(engineDstDir, { recursive: true });
fs.copyFileSync(engineSrc, path.join(engineDstDir, engineName));

log("Готово. Следва: electron-builder --win");
