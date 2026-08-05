import assert from "node:assert/strict";
import { test } from "node:test";

import { clientIpOptionsFromEnv, pickClientIp, type ClientIpOptions } from "../client-ip";

/** Превръща обикновен обект в четец на заглавия (регистърът не е значим). */
function headers(map: Record<string, string>) {
  const lower = Object.fromEntries(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]));
  return (name: string) => lower[name.toLowerCase()];
}

const ONE_HOP: ClientIpOptions = { trustedHops: 1, trustCloudflare: false };

test("едно наше прокси — истината е последният запис", () => {
  const result = pickClientIp(headers({ "x-forwarded-for": "203.0.113.9" }), ONE_HOP);
  assert.equal(result?.ip.normalized, "203.0.113.9");
  assert.equal(result?.via, "x-forwarded-for");
});

test("подправено заглавие не мести резултата", () => {
  // Клиентът е написал „1.2.3.4“ сам; нашият Nginx е допълнил истинския адрес.
  const result = pickClientIp(
    headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }),
    ONE_HOP,
  );
  assert.equal(result?.ip.normalized, "203.0.113.9", "вземаме отдясно, не отляво");
});

test("две доверени прокси-та — броим два записа отдясно", () => {
  const result = pickClientIp(
    headers({ "x-forwarded-for": "9.9.9.9, 203.0.113.9, 198.51.100.7" }),
    { trustedHops: 2, trustCloudflare: false },
  );
  assert.equal(result?.ip.normalized, "203.0.113.9");
});

test("повече доверени прокси-та, отколкото записи — по-добре нищо, отколкото лъжа", () => {
  const result = pickClientIp(headers({ "x-forwarded-for": "203.0.113.9" }), {
    trustedHops: 3,
    trustCloudflare: false,
  });
  assert.equal(result, null);
});

test("Cloudflare заглавието се ползва САМО когато сме го разрешили", () => {
  const head = headers({ "cf-connecting-ip": "203.0.113.5", "x-forwarded-for": "198.51.100.7" });
  assert.equal(pickClientIp(head, ONE_HOP)?.ip.normalized, "198.51.100.7", "по подразбиране не вярваме");
  const trusted = pickClientIp(head, { trustedHops: 1, trustCloudflare: true });
  assert.equal(trusted?.ip.normalized, "203.0.113.5");
  assert.equal(trusted?.via, "cf-connecting-ip");
});

test("x-real-ip е резервен път", () => {
  const result = pickClientIp(headers({ "x-real-ip": "203.0.113.9" }), ONE_HOP);
  assert.equal(result?.via, "x-real-ip");
});

test("портът се маха при IPv4, IPv6 в скоби се разбира", () => {
  assert.equal(
    pickClientIp(headers({ "x-forwarded-for": "203.0.113.9:51234" }), ONE_HOP)?.ip.normalized,
    "203.0.113.9",
  );
  assert.equal(
    pickClientIp(headers({ "x-forwarded-for": "[2001:db8::1]:443" }), ONE_HOP)?.ip.normalized,
    "2001:db8::1",
  );
});

test("боклук вместо адрес не минава", () => {
  assert.equal(pickClientIp(headers({ "x-forwarded-for": "не-е-адрес" }), ONE_HOP), null);
  assert.equal(pickClientIp(headers({}), ONE_HOP), null);
  assert.equal(pickClientIp(headers({ "x-forwarded-for": "" }), ONE_HOP), null);
});

test("настройките от средата имат безопасни стойности по подразбиране", () => {
  assert.deepEqual(clientIpOptionsFromEnv({}), { trustedHops: 1, trustCloudflare: false });
  assert.deepEqual(clientIpOptionsFromEnv({ IPLOOKUP_TRUSTED_HOPS: "2", IPLOOKUP_TRUST_CLOUDFLARE: "1" }), {
    trustedHops: 2,
    trustCloudflare: true,
  });
  // Безсмислена стойност → връщаме се към безопасното, не към нула хопа.
  assert.equal(clientIpOptionsFromEnv({ IPLOOKUP_TRUSTED_HOPS: "0" }).trustedHops, 1);
  assert.equal(clientIpOptionsFromEnv({ IPLOOKUP_TRUSTED_HOPS: "глупост" }).trustedHops, 1);
});
