// Цялост на компилацията (Прил. № 29, т. 4 — защита от външни модули и промяна на кода).
//
// При компилация: манифест със SHA-256 на всеки файл на сървъра, подписан с Ed25519 ключа на
// производителя (само в CI). При старт: Electron проверява подписа и всеки хеш, ПРЕДИ да пусне
// сървъра. Променен, добавен или липсващ файл → отказ от старт.
//
// Един модул за компилацията (scripts/integrity-manifest.mjs), Electron (main.js) и тестовете.
// CommonJS и само вградени модули на Node — тича и в главния процес на Electron без билд.

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MANIFEST = "integrity-manifest.json";
const SIGNATURE = "integrity-manifest.sig";

/** Кешът на Next се пише по време на работа — не е част от компилацията. */
function ignored(rel) {
  return rel === MANIFEST || rel === SIGNATURE || rel === ".next/cache" || rel.startsWith(".next/cache/");
}

/** JSON със сортирани ключове — един и същ текст при всяка компилация, за да е подписът повторим. */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/** Всички файлове под root (относителни пътища с „/“), сортирани, без игнорираните. */
function listFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(root, abs).split(path.sep).join("/");
      if (ignored(rel)) continue;
      if (e.isDirectory()) walk(abs);
      else if (e.isFile() || e.isSymbolicLink()) out.push(rel);
    }
  };
  walk(root);
  return out.sort();
}

function buildManifest(root, meta) {
  const files = {};
  for (const rel of listFiles(root)) files[rel] = sha256File(path.join(root, rel));
  return { app: "Carbon Stealth POS", version: meta.version, createdAt: meta.createdAt, algorithm: "sha256", files };
}

function signManifest(manifestText, privateKeyPem) {
  return crypto.sign(null, Buffer.from(manifestText, "utf8"), crypto.createPrivateKey(privateKeyPem)).toString("base64");
}

function signatureValid(manifestText, signature, publicKeyPem) {
  try {
    return crypto.verify(
      null,
      Buffer.from(manifestText, "utf8"),
      crypto.createPublicKey(publicKeyPem),
      Buffer.from(signature, "base64")
    );
  } catch {
    return false;
  }
}

/**
 * Проверка на инсталацията.
 * verified — подписът е валиден и всеки файл съвпада; unsigned — няма манифест, подпис или
 * публичен ключ, но наличното съвпада; tampered — подпис, хеш, липсващ или излишен файл.
 */
function verifyInstall(root, { manifestText, signature, publicKeyPem }) {
  const problems = [];
  if (!manifestText) return { state: "unsigned", problems: ["липсва манифест на компилацията"] };

  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    return { state: "tampered", problems: ["манифестът не е валиден JSON"] };
  }
  const canSign = Boolean(signature && publicKeyPem);
  if (canSign && !signatureValid(manifestText, signature, publicKeyPem)) {
    return { state: "tampered", problems: ["подписът на манифеста не е валиден"] };
  }

  const expected = manifest && typeof manifest.files === "object" ? manifest.files : {};
  const actual = new Set(listFiles(root));
  for (const [rel, hash] of Object.entries(expected)) {
    if (!actual.has(rel)) problems.push(`липсва ${rel}`);
    else if (sha256File(path.join(root, rel)) !== hash) problems.push(`променен ${rel}`);
    actual.delete(rel);
  }
  for (const rel of actual) problems.push(`добавен ${rel}`);

  if (problems.length > 0) return { state: "tampered", problems };
  return canSign ? { state: "verified", problems } : { state: "unsigned", problems: ["компилацията не е подписана"] };
}

/** Проверка от диска: манифест и подпис до сървъра, публичният ключ — до main.js. */
function verifyFromDisk(serverRoot, publicKeyFile) {
  const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null);
  const signature = read(path.join(serverRoot, SIGNATURE));
  return verifyInstall(serverRoot, {
    manifestText: read(path.join(serverRoot, MANIFEST)),
    signature: signature ? signature.trim() : null,
    publicKeyPem: read(publicKeyFile),
  });
}

module.exports = {
  MANIFEST,
  SIGNATURE,
  canonicalJson,
  buildManifest,
  signManifest,
  verifyInstall,
  verifyFromDisk,
};
