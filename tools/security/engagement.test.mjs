// engagement.test.mjs — зареждане + Ed25519 проверка на обхвата на ангажимент. Подписът е
// анти-инжекционното ядро: само подписан от ключа на собственика файл оторизира каквото и да е.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign as edSign } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalize, signPayload, verifyEngagement, loadEngagements, REQUIRED } from "./engagement.mjs";

const kp = generateKeyPairSync("ed25519");
const PUB = kp.publicKey.export({ type: "spki", format: "pem" });

const base = () => ({
  engagement_id: "cs-2026-acme", status: "active",
  client_legal_identity: { name: "ACME EOOD", vat: "BG123", seat: "София" },
  authorizing_signatory: { name: "Иван Иванов", role: "CTO", authority_proof: "протокол-2026-07" },
  authorization_ref: { doc_hash: "sha256:" + "c".repeat(64), signed_at: "2026-11-14", method: "qes" },
  third_party_cloud_notice: { provider: "none", notified: true },
  scope_allowlist: { hosts: ["acme.example", "api.acme.example"], cidr: [], endpoints: [] },
  out_of_scope: { hosts: [], paths: ["/admin"], actions: ["no-dos", "no-exfil"] },
  time_window: { not_before: "2026-11-15T00:00:00Z", not_after: "2026-11-16T00:00:00Z" },
  limits: { rate_rps: 5, max_concurrency: 4 },
  data_handling: { role: "processor", dpa_ref: "DPA-2026-ACME", on_personal_data: "stop-minimize-report" },
  disclosure_terms: { framework: "ISO/IEC 29147", embargo_days: 90 },
  emergency_contacts: [{ name: "СОК", email: "soc@acme.example" }], abort_procedure: "kill-switch",
  governing_law: "BG", fail_closed: true,
});
const signed = (obj, priv = kp.privateKey) => ({ ...obj, signature: edSign(null, Buffer.from(canonicalize(obj)), priv).toString("base64") });

test("canonicalize е стабилен и изключва signature/verified", () => {
  const a = canonicalize({ b: 1, a: 2, signature: "x", verified: true });
  const b = canonicalize({ a: 2, b: 1 });
  assert.equal(a, b);
  assert.doesNotMatch(a, /signature|verified/);
});

test("валиден подпис → verified:true и нормализирани полета за scope-check", () => {
  const e = verifyEngagement(signed(base()), PUB);
  assert.equal(e.verified, true);
  assert.deepEqual(e.hosts, ["acme.example", "api.acme.example"]);
  assert.equal(e.notBefore, "2026-11-15T00:00:00Z");
  assert.equal(e.notAfter, "2026-11-16T00:00:00Z");
  assert.deepEqual(e.excludePaths, ["/admin"]);
  assert.equal(e.rateLimit, 5);
});

test("подправен след подписване → verified:false (fail-closed)", () => {
  const e = signed(base());
  e.scope_allowlist.hosts.push("evil.example"); // промяна СЛЕД подписа
  assert.equal(verifyEngagement(e, PUB).verified, false);
});

test("подпис от ЧУЖД ключ → verified:false", () => {
  const other = generateKeyPairSync("ed25519");
  assert.equal(verifyEngagement(signed(base(), other.privateKey), PUB).verified, false);
});

test("липсва signature → verified:false", () => {
  assert.equal(verifyEngagement(base(), PUB).verified, false);
});

test("status != active → verified:false дори с валиден подпис", () => {
  assert.equal(verifyEngagement(signed({ ...base(), status: "revoked" }), PUB).verified, false);
});

test("липсва задължително поле → verified:false (непълен = неоторизиращ)", () => {
  for (const f of REQUIRED) {
    const o = base(); delete o[f];
    assert.equal(verifyEngagement(signed(o), PUB).verified, false, `без ${f}`);
  }
});

test("loadEngagements чете папка, проверява всеки, не хвърля при боклук", () => {
  const d = mkdtempSync(join(tmpdir(), "eng-"));
  try {
    writeFileSync(join(d, "ok.json"), JSON.stringify(signed(base())));
    writeFileSync(join(d, "forged.json"), JSON.stringify(base())); // без подпис
    writeFileSync(join(d, "junk.json"), "{ не е json");
    const list = loadEngagements(d, PUB);
    assert.equal(list.length, 3);
    assert.equal(list.filter((e) => e.verified).length, 1, "само подписаният е валиден");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

// ── 14-те полета на pentest-engagement (находка на Прониквача, 15.11.2026) ───────────────────
const HASH = "sha256:" + "a".repeat(64);
const full = () => ({ ...base(), authorization_ref: { ...base().authorization_ref, doc_hash: HASH },
  third_party_cloud_notice: { provider: "none", notified: true } });

test("пълен ангажимент с всичките 14 полета → verified:true", () => {
  assert.equal(verifyEngagement(signed(full()), PUB).verified, true);
});
test("без доказателство за власт, без хеш на разрешението, без трети облаци, DPA, разкриване, контакти или abort → verified:false", () => {
  const cases = {
    "authority_proof": (o) => { delete o.authorizing_signatory.authority_proof; },
    "doc_hash празен": (o) => { o.authorization_ref.doc_hash = "sha256:…"; },
    "third_party_cloud_notice": (o) => { delete o.third_party_cloud_notice; },
    "data_handling.dpa_ref": (o) => { delete o.data_handling.dpa_ref; },
    "disclosure_terms": (o) => { delete o.disclosure_terms; },
    "emergency_contacts празен": (o) => { o.emergency_contacts = []; },
    "abort_procedure празен": (o) => { o.abort_procedure = " "; },
  };
  for (const [name, mut] of Object.entries(cases)) {
    const o = JSON.parse(JSON.stringify(full())); mut(o);
    assert.equal(verifyEngagement(signed(o), PUB).verified, false, name);
  }
});
