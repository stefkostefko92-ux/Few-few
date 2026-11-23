// engagement.mjs — обхватът на оторизиран пентест като ПОДПИСАН артефакт (ядро: оторизация).
// Правната рамка (Правния Разбирач, 2026-11-15): оторизацията трябва да е проверима ИЗВЪН канала —
// подписан файл, не твърдение на целта/задачата/URL (confused deputy → ти извършваш НК чл. 319а /
// IT art. 615-ter, не насадилият текста). Затова единственият източник на „разрешено" е
// `.security/engagements/<id>.json`, подписан с Ed25519 ключа на собственика (частният ключ е САМО
// на сървъра; публичният е в репото). Подправен/инжектиран/непълен файл → `verified:false` =
// несъществуващ. Реалните ангажименти (истински цели/клиенти) живеят само на сървъра, не в репо.
//
//   node tools/security/engagement.mjs verify <файл>          # проверка на един файл
//   node tools/security/engagement.mjs list [папка]           # всички + статус
//   node tools/security/engagement.mjs sign <файл> <priv.pem> # подпис (ключът НЕ се пази никъде)
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { verify as edVerify, sign as edSign } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isMain } from "../lib/is-main.mjs";
import { emitJson } from "../lib/emit.mjs";

const ROOT = process.env.CLAUDE_PROJECT_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const ENGAGEMENTS_DIR = join(ROOT, ".security", "engagements");
export const PUBKEY_PATH = join(ROOT, ".security", "pubkey.ed25519.pem");
// Полетата, без които ангажиментът НЕ оторизира — всичките 14 от умението `pentest-engagement`
// (стъпка 0, т. 2). Дотогава се проверяваха 10 и `verified:true` не доказваше доказателството за
// власт, хеша на разрешението, третите облаци, DPA, разкриването, контактите и abort (находка на
// Прониквача, 15.11.2026).
export const REQUIRED = ["engagement_id", "status", "client_legal_identity", "authorizing_signatory",
  "authorization_ref", "scope_allowlist", "out_of_scope", "time_window", "limits",
  "third_party_cloud_notice", "data_handling", "disclosure_terms", "emergency_contacts", "abort_procedure",
  "governing_law"];
const DOC_HASH_RE = /^sha256:[0-9a-f]{64}$/i;
const nonEmpty = (v) => typeof v === "string" ? v.trim().length > 0 : v != null;

/** Вложените изисквания, които самото присъствие на полето не доказва. Празен масив = пълен. */
export function contentGaps(obj) {
  const gaps = [];
  if (!nonEmpty(obj.authorizing_signatory?.authority_proof)) gaps.push("подписалият е без доказателство за власт (authority_proof)");
  if (!DOC_HASH_RE.test(String(obj.authorization_ref?.doc_hash || ""))) gaps.push("authorization_ref.doc_hash не е sha256:<64 hex>");
  if (!nonEmpty(obj.data_handling?.role) || !nonEmpty(obj.data_handling?.dpa_ref)) gaps.push("data_handling без роля или DPA (dpa_ref)");
  if (!Array.isArray(obj.emergency_contacts) || obj.emergency_contacts.length === 0) gaps.push("няма контакти за спешност");
  if (!nonEmpty(obj.abort_procedure)) gaps.push("няма abort процедура");
  if (typeof obj.disclosure_terms !== "object" || obj.disclosure_terms === null) gaps.push("няма условия за разкриване");
  if (typeof obj.third_party_cloud_notice !== "object" || obj.third_party_cloud_notice === null) gaps.push("няма данни за трети облаци");
  return gaps;
}

/** Стабилна каноникализация (сортирани ключове, без signature/verified) за подпис/проверка. */
export function canonicalize(obj) {
  const skip = new Set(["signature", "verified"]);
  const norm = (v) => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === "object") return Object.keys(v).filter((k) => !skip.has(k)).sort().reduce((a, k) => (a[k] = norm(v[k]), a), {});
    return v;
  };
  return JSON.stringify(norm(obj));
}

export function signPayload(obj, privateKeyPem) {
  return edSign(null, Buffer.from(canonicalize(obj)), privateKeyPem).toString("base64");
}

/** Проверява подпис + задължителни полета + активен статус. Връща обекта с `verified` и
 *  нормализирани полета за scope-check. Fail-closed: всяко съмнение → verified:false. */
export function verifyEngagement(obj, publicKeyPem) {
  const out = { ...obj, verified: false, warnings: [] };
  try {
    if (!obj || typeof obj !== "object") return out;
    for (const f of REQUIRED) if (obj[f] == null) { out.warnings.push(`липсва ${f}`); }
    if (out.warnings.length) return out;
    out.warnings.push(...contentGaps(obj));
    if (out.warnings.length) return out;
    if (obj.status !== "active") { out.warnings.push(`статус ${obj.status} != active`); return out; }
    if (!obj.signature) { out.warnings.push("няма подпис"); return out; }
    const ok = edVerify(null, Buffer.from(canonicalize(obj)), publicKeyPem, Buffer.from(obj.signature, "base64"));
    if (!ok) { out.warnings.push("подписът не съвпада (подправен или чужд ключ)"); return out; }
    // Нормализация към формата на scope-check.
    out.id = obj.engagement_id;
    out.hosts = [...(obj.scope_allowlist?.hosts || []), ...(obj.scope_allowlist?.cidr || [])];
    out.notBefore = obj.time_window?.not_before;
    out.notAfter = obj.time_window?.not_after;
    out.excludePaths = obj.out_of_scope?.paths || [];
    out.rateLimit = obj.limits?.rate_rps ?? null;
    out.verified = true;
    return out;
  } catch (e) { out.warnings.push("грешка при проверка: " + e.message); return out; }
}

function readPubKey() {
  if (process.env.ENGAGEMENT_PUBKEY) return process.env.ENGAGEMENT_PUBKEY;
  if (existsSync(PUBKEY_PATH)) return readFileSync(PUBKEY_PATH, "utf8");
  return null; // няма ключ → всичко остава verified:false (fail-closed)
}

/** Зарежда и проверява всички ангажименти от папка. Не хвърля при боклук (всеки лош файл →
 *  verified:false), за да не може един повреден файл да събори пазача. */
export function loadEngagements(dir = ENGAGEMENTS_DIR, pubKey = readPubKey()) {
  if (!dir || !existsSync(dir) || !pubKey) return [];
  const out = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "example.json")) {
    try { out.push(verifyEngagement(JSON.parse(readFileSync(join(dir, f), "utf8")), pubKey)); }
    catch { out.push({ id: f, verified: false, warnings: ["непарсваем JSON"] }); }
  }
  return out;
}

if (isMain(import.meta.url)) {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === "verify") {
    const pub = readPubKey(); if (!pub) { console.error("✗ няма публичен ключ (.security/pubkey.ed25519.pem или ENGAGEMENT_PUBKEY)"); process.exit(2); }
    const e = verifyEngagement(JSON.parse(readFileSync(a, "utf8")), pub);
    console.log(e.verified ? `✓ валиден ангажимент ${e.id} · хостове: ${e.hosts.join(", ")} · до ${e.notAfter}` : `✗ НЕвалиден: ${e.warnings.join("; ")}`);
    process.exit(e.verified ? 0 : 1);
  } else if (cmd === "list") {
    const list = loadEngagements(a || ENGAGEMENTS_DIR);
    if (!list.length) { console.log("няма ангажименти (или липсва публичен ключ)"); process.exit(0); }
    for (const e of list) console.log(`${e.verified ? "✓" : "✗"} ${e.id || "?"} ${e.verified ? `· ${e.hosts.join(",")} · ${e.notBefore}…${e.notAfter}` : "· " + e.warnings.join("; ")}`);
  } else if (cmd === "sign") {
    if (!a || !b) { console.error("употреба: engagement.mjs sign <файл.json> <private.pem>"); process.exit(2); }
    const obj = JSON.parse(readFileSync(a, "utf8")); delete obj.signature;
    emitJson({ ...obj, signature: signPayload(obj, readFileSync(b, "utf8")) }); // не console.log+exit: тръбата реже на 64 KiB
  } else {
    console.error("употреба: engagement.mjs verify|list|sign …"); process.exit(2);
  }
}
