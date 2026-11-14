// Манифест на компилацията (Прил. № 29, т. 4): SHA-256 на всеки файл на сървъра + Ed25519 подпис.
//
//   node scripts/integrity-manifest.mjs desktop/server
//
// Подписът се прави само когато CSPOS_SIGNING_KEY (PKCS#8 PEM) е зададен — в CI, от тайните на
// репото. Ключът никога не се пише на диска и не влиза в репото. Без ключ манифестът пак се
// записва: инсталацията ще е „неподписана“ и в режим СУПТО няма да продава.

import { createRequire } from "node:module";
import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const integrity = require(join(root, "desktop", "integrity.js"));

const target = process.argv[2] ? resolve(process.argv[2]) : join(root, "desktop", "server");
if (!existsSync(target)) {
  process.stderr.write(`✖ Няма папка ${target} — пусни първо desktop/prepare.mjs.\n`);
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
// стар подпис не бива да остава до нов манифест
rmSync(join(target, integrity.SIGNATURE), { force: true });
const manifest = integrity.buildManifest(target, { version, createdAt: new Date().toISOString() });
const text = integrity.canonicalJson(manifest);
writeFileSync(join(target, integrity.MANIFEST), text);
process.stdout.write(`▸ Манифест: ${Object.keys(manifest.files).length} файла, версия ${version}.\n`);

const key = process.env.CSPOS_SIGNING_KEY;
if (key && key.trim()) {
  writeFileSync(join(target, integrity.SIGNATURE), integrity.signManifest(text, key));
  const pub = join(root, "desktop", "integrity-public.pem");
  const check = integrity.verifyFromDisk(target, pub);
  if (check.state !== "verified") {
    process.stderr.write(`✖ Подписът не се проверява с desktop/integrity-public.pem: ${check.problems.join("; ")}\n`);
    process.exit(1);
  }
  process.stdout.write("▸ Подписан и проверен с публичния ключ.\n");
} else {
  process.stdout.write("⚠ CSPOS_SIGNING_KEY не е зададен — компилацията е НЕПОДПИСАНА (в режим СУПТО няма да продава).\n");
}
