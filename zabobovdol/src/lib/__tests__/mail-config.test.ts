import test from "node:test";
import assert from "node:assert/strict";
import {
  MAIL_ERRORS,
  errorCodeOf,
  hintForCode,
  openSmtpKey,
  parseMailForm,
  resolveSmtp,
  sealSmtpKey,
} from "@/lib/mail-config-core";

const SECRET = "s".repeat(40);
const OTHER = "o".repeat(40);
const good = {
  host: "smtp-relay.brevo.com",
  port: "587",
  user: "8b1a2c001@smtp-brevo.com",
  key: "xsmtpsib-abc123",
  fromName: "За Бобов дол",
  fromEmail: "no-reply@carbonstealth.eu",
};
const prod = { production: true, keySaved: false };

test("пощата: правилна форма на Brevo минава, хостът и адресът — с малки букви", () => {
  const r = parseMailForm({ ...good, host: "SMTP-Relay.Brevo.com", fromEmail: "No-Reply@CarbonStealth.eu" }, prod);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.values.host, "smtp-relay.brevo.com");
    assert.equal(r.values.port, 587);
    assert.equal(r.values.fromEmail, "no-reply@carbonstealth.eu");
    assert.equal(r.values.key, "xsmtpsib-abc123");
  }
});

test("пощата: в продукция сървърът е само име — без IP, localhost и адрес с http", () => {
  for (const host of ["127.0.0.1", "localhost", "10.0.0.5", "::1", "http://smtp-relay.brevo.com", "smtp", ""]) {
    const r = parseMailForm({ ...good, host }, prod);
    assert.ok(!r.ok, host);
    if (!r.ok) assert.equal(r.errors.host, MAIL_ERRORS.host);
  }
  // В разработка — localhost/IP се приемат (локален тестов SMTP).
  assert.ok(parseMailForm({ ...good, host: "127.0.0.1" }, { production: false, keySaved: false }).ok);
});

test("пощата: само портовете на Brevo", () => {
  for (const port of ["25", "0", "abc", "", "5870"]) assert.ok(!parseMailForm({ ...good, port }, prod).ok, port);
  for (const port of ["587", "2525", "465"]) assert.ok(parseMailForm({ ...good, port }, prod).ok, port);
});

test("пощата: нови редове и заглавия не минават (SMTP/header injection)", () => {
  const bad = [
    { user: "a\r\nMAIL FROM:<x@y.z>" },
    { user: "two words" },
    { key: "abc\r\nRCPT TO:<x@y.z>" },
    { fromName: 'Ime <x@y.z>' },
    { fromName: "Ime\r\nBcc: x@y.z" },
    { fromName: "a".repeat(81) },
    { fromEmail: "x@y.z\r\nBcc: a@b.c" },
    { fromEmail: "x@y.z, a@b.c" },
    { fromEmail: "not-an-email" },
  ];
  for (const b of bad) assert.ok(!parseMailForm({ ...good, ...b }, prod).ok, JSON.stringify(b));
});

test("пощата: празен ключ — само ако има записан и сървърът/логинът са същите", () => {
  const noKey = { ...good, key: "" };
  let r = parseMailForm(noKey, prod);
  assert.ok(!r.ok && r.errors.key === MAIL_ERRORS.key);

  const saved = { host: good.host, user: good.user };
  r = parseMailForm(noKey, { production: true, keySaved: true, saved });
  assert.ok(r.ok && r.values.key === null);

  r = parseMailForm({ ...noKey, host: "smtp.evil.example" }, { production: true, keySaved: true, saved });
  assert.ok(!r.ok && r.errors.key === MAIL_ERRORS.keyNewServer);
  r = parseMailForm({ ...noKey, user: "other@smtp-brevo.com" }, { production: true, keySaved: true, saved });
  assert.ok(!r.ok && r.errors.key === MAIL_ERRORS.keyNewServer);
});

test("пощата: ключът се шифрова и чете обратно; подправен или с друга тайна — null", () => {
  const enc = sealSmtpKey(SECRET, "xsmtpsib-abc123");
  assert.ok(!enc.includes("xsmtpsib"));
  assert.notEqual(enc, sealSmtpKey(SECRET, "xsmtpsib-abc123"), "случаен IV при всяко шифроване");
  assert.equal(openSmtpKey(SECRET, enc), "xsmtpsib-abc123");
  assert.equal(openSmtpKey(OTHER, enc), null);
  const raw = Buffer.from(enc, "base64");
  raw[raw.length - 1] ^= 1;
  assert.equal(openSmtpKey(SECRET, raw.toString("base64")), null);
  assert.equal(openSmtpKey(SECRET, "кратко"), null);
  assert.throws(() => sealSmtpKey("short", "x"));
});

test("пощата: панелът е над .env; изключен панел или счупен ключ — .env; нищо — без поща", () => {
  const env = { SMTP_HOST: "smtp.env.example", SMTP_PORT: "587", SMTP_USER: "u", SMTP_PASS: "p", SMTP_FROM: "env@x.bg" };
  const db = {
    enabled: "1",
    host: "smtp-relay.brevo.com",
    port: "2525",
    user: "id@smtp-brevo.com",
    keyEnc: sealSmtpKey(SECRET, "k1"),
    fromName: "За Бобов дол",
    fromEmail: "no-reply@carbonstealth.eu",
  };

  let r = resolveSmtp(db, env, SECRET);
  assert.equal(r.params?.source, "панел");
  assert.equal(r.params?.port, 2525);
  assert.equal(r.params?.secure, false);
  assert.equal(r.params?.pass, "k1");
  assert.deepEqual(r.params?.from, { name: "За Бобов дол", address: "no-reply@carbonstealth.eu" });

  r = resolveSmtp({ ...db, port: "465" }, env, SECRET);
  assert.equal(r.params?.secure, true);

  r = resolveSmtp({ ...db, enabled: "0" }, env, SECRET);
  assert.equal(r.params?.source, ".env");
  assert.equal(r.panelKeyBroken, false);

  r = resolveSmtp(db, env, OTHER);
  assert.equal(r.params?.source, ".env");
  assert.equal(r.panelKeyBroken, true);

  r = resolveSmtp({ ...db, port: "25" }, env, SECRET);
  assert.equal(r.params?.source, ".env");

  assert.equal(resolveSmtp({}, {}, SECRET).params, null);
  r = resolveSmtp({}, { SMTP_HOST: "h.example", SMTP_PORT: "587" }, SECRET);
  assert.equal(r.params?.user, undefined);
  assert.equal(r.params?.from, "no-reply@carbonstealth.eu");
});

test("пощата: само кодът на грешката, никога текстът на сървъра", () => {
  assert.equal(errorCodeOf({ code: "EAUTH", response: "535 x@y.z bad" }), "EAUTH");
  assert.equal(errorCodeOf({ code: "eauth" }), "EERROR");
  assert.equal(errorCodeOf(new Error("x@y.z")), "EERROR");
  assert.equal(errorCodeOf(null), "EERROR");
  assert.match(hintForCode("EAUTH"), /логин или ключ/);
  assert.match(hintForCode("ECONNECTION"), /2525/);
  assert.match(hintForCode("EXYZ"), /EXYZ/);
});
