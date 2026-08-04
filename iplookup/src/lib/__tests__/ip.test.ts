import assert from "node:assert/strict";
import { test } from "node:test";

import {
  embeddedIpv4,
  expandIpv6,
  formatIpv6,
  inCidr,
  interfaceIdentifier,
  isGloballyRoutable,
  looksLikeHostname,
  parseIp,
  reverseName,
  specialRange,
} from "../ip";

/** Кратко: разбира адреса или пада тестът (пази нататъшните проверки от `null`). */
function must(input: string) {
  const parsed = parseIp(input);
  assert.ok(parsed, `очаквах валиден адрес: ${input}`);
  return parsed;
}

test("IPv4 — валидни форми", () => {
  assert.equal(must("8.8.8.8").normalized, "8.8.8.8");
  assert.equal(must("0.0.0.0").version, 4);
  assert.deepEqual(must("192.168.1.1").bytes, [192, 168, 1, 1]);
  assert.equal(must("  1.2.3.4  ").normalized, "1.2.3.4", "външните интервали се махат");
});

test("IPv4 — водещата нула се отхвърля (осмичната двусмислица е SSRF повърхност)", () => {
  assert.equal(parseIp("010.0.0.1"), null);
  assert.equal(parseIp("192.168.01.1"), null);
  // Нулата сама по себе си е валидна — отхвърля се само ИЗЛИШНАТА водеща нула.
  assert.ok(parseIp("10.0.0.1"));
});

test("IPv4 — невалидни форми", () => {
  for (const bad of ["256.0.0.1", "1.2.3", "1.2.3.4.5", "1.2.3.-1", "", "1.2.3.4a", "999.999.999.999"]) {
    assert.equal(parseIp(bad), null, `трябваше да е невалиден: ${bad}`);
  }
});

test("IPv6 — разбор и каноничен запис по RFC 5952", () => {
  assert.equal(must("2001:0db8:0000:0000:0000:0000:0000:0001").normalized, "2001:db8::1");
  assert.equal(must("2001:DB8::1").normalized, "2001:db8::1", "малки букви");
  assert.equal(must("::").normalized, "::");
  assert.equal(must("::1").normalized, "::1");
  assert.equal(
    must("2606:4700:4700::1111").expanded,
    "2606:4700:4700:0000:0000:0000:0000:1111",
  );
});

test("IPv6 — една нулева група НЕ се съкращава (RFC 5952 §4.2.2)", () => {
  // Средната група е една-единствена нула → „::“ там не спестява нищо.
  assert.equal(formatIpv6(must("2001:db8:0:1:1:1:1:1").bytes), "2001:db8:0:1:1:1:1:1");
});

test("IPv6 — най-дългата поредица печели, при равенство най-лявата", () => {
  assert.equal(must("2001:0:0:1:0:0:0:1").normalized, "2001:0:0:1::1");
  assert.equal(must("1:0:0:2:0:0:3:4").normalized, "1::2:0:0:3:4", "при равенство — най-лявата");
});

test("IPv6 — вграден IPv4 в текстов вид", () => {
  const parsed = must("::ffff:192.0.2.128");
  assert.equal(parsed.bytes.length, 16);
  assert.deepEqual(parsed.bytes.slice(12), [192, 0, 2, 128]);
});

test("IPv6 — невалидни форми", () => {
  for (const bad of [
    "2001:db8::1::2", // две съкращения
    "12345::1", // група над 4 знака
    "fe80::1%eth0", // зонов идентификатор
    "2001:db8:0:0:0:0:0:0:1", // девет групи
    ":::",
    "gggg::1",
  ]) {
    assert.equal(parseIp(bad), null, `трябваше да е невалиден: ${bad}`);
  }
});

test("IPv6 — формата от URL със скоби и порт", () => {
  assert.equal(must("[2001:db8::1]:443").normalized, "2001:db8::1");
});

test("expandIpv6 връща осем пълни групи", () => {
  assert.equal(expandIpv6(must("::1").bytes), "0000:0000:0000:0000:0000:0000:0000:0001");
});

test("inCidr — граници на блока", () => {
  const cgnat = must("100.64.0.0").bytes;
  assert.ok(inCidr(cgnat, "100.64.0.0/10"));
  assert.ok(inCidr(must("100.127.255.255").bytes, "100.64.0.0/10"), "последният адрес в блока");
  assert.ok(!inCidr(must("100.128.0.0").bytes, "100.64.0.0/10"), "първият адрес след блока");
  assert.ok(!inCidr(must("100.63.255.255").bytes, "100.64.0.0/10"), "последният адрес преди блока");
});

test("inCidr — /0 хваща всичко, версиите не се смесват", () => {
  assert.ok(inCidr(must("8.8.8.8").bytes, "0.0.0.0/0"));
  assert.ok(!inCidr(must("2001:db8::1").bytes, "10.0.0.0/8"), "IPv6 адрес срещу IPv4 блок");
});

test("specialRange — частни, CGNAT, документационни", () => {
  assert.equal(specialRange(must("192.168.1.1"))?.cidr, "192.168.0.0/16");
  assert.equal(specialRange(must("100.100.1.1"))?.cidr, "100.64.0.0/10");
  assert.equal(specialRange(must("203.0.113.7"))?.cidr, "203.0.113.0/24");
  assert.equal(specialRange(must("127.0.0.1"))?.cidr, "127.0.0.0/8");
  assert.equal(specialRange(must("fe80::1"))?.cidr, "fe80::/10");
  assert.equal(specialRange(must("fd00::1"))?.cidr, "fc00::/7");
  assert.equal(specialRange(must("8.8.8.8")), null, "публичен адрес няма специален диапазон");
});

test("specialRange — по-тесният блок бие по-широкия", () => {
  // 192.0.2.0/24 (документационен) е вътре в общото пространство, но не и в
  // 192.0.0.0/24 — проверката е, че редът в таблицата не разменя двата.
  assert.equal(specialRange(must("192.0.2.1"))?.name, "Документационен (TEST-NET-1)");
  assert.equal(specialRange(must("192.0.0.1"))?.name, "Служебен блок на IETF");
});

test("isGloballyRoutable — питаме външни източници само за смислени адреси", () => {
  assert.ok(isGloballyRoutable(must("1.1.1.1")));
  assert.ok(isGloballyRoutable(must("2606:4700::1111")));
  assert.ok(!isGloballyRoutable(must("10.1.2.3")));
  assert.ok(!isGloballyRoutable(must("::1")));
});

test("reverseName — in-addr.arpa и ip6.arpa", () => {
  assert.equal(reverseName(must("8.8.4.4")), "4.4.8.8.in-addr.arpa");
  assert.equal(
    reverseName(must("2001:db8::1")),
    "1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa",
  );
});

test("embeddedIpv4 — 6to4 носи публичния IPv4 в чист вид", () => {
  const found = embeddedIpv4(must("2002:c000:0204::1"));
  assert.equal(found?.mechanism, "6to4");
  assert.equal(found?.ipv4, "192.0.2.4");
});

test("embeddedIpv4 — Teredo (стойностите са с обърнати битове)", () => {
  // RFC 4380: префикс 2001:0000, сървър 192.0.2.45, флагове, ~порт, ~клиент.
  // Порт 40000 = 0x9C40 → ~ = 0x63BF. Клиент 203.0.113.9 → ~ = 52.255.142.246.
  const found = embeddedIpv4(must("2001:0:c000:022d:0:63bf:34ff:8ef6"));
  assert.equal(found?.mechanism, "Teredo");
  assert.equal(found?.serverIpv4, "192.0.2.45");
  assert.equal(found?.port, 40000);
  assert.equal(found?.ipv4, "203.0.113.9");
});

test("embeddedIpv4 — NAT64 и IPv4-mapped", () => {
  assert.equal(embeddedIpv4(must("64:ff9b::c000:221"))?.ipv4, "192.0.2.33");
  assert.equal(embeddedIpv4(must("::ffff:8.8.8.8"))?.mechanism, "IPv4-mapped");
});

test("embeddedIpv4 — обикновен IPv6 няма вграден адрес", () => {
  assert.equal(embeddedIpv4(must("2606:4700::1111")), null);
  assert.equal(embeddedIpv4(must("8.8.8.8")), null, "IPv4 адресът няма какво да вгражда");
});

test("interfaceIdentifier — EUI-64 възстановява MAC адреса", () => {
  // MAC 00:1a:2b:3c:4d:5e → U/L битът се обръща (00 → 02) и се вмъква ff:fe.
  const id = interfaceIdentifier(must("2001:db8::21a:2bff:fe3c:4d5e"));
  assert.equal(id?.kind, "eui64");
  assert.equal(id?.mac, "00:1a:2b:3c:4d:5e");
  assert.equal(id?.oui, "00:1A:2B");
});

test("interfaceIdentifier — временен адрес не издава хардуер", () => {
  const id = interfaceIdentifier(must("2a02:1234:5678:9abc:d1e2:f3a4:b5c6:d7e8"));
  assert.equal(id?.kind, "opaque");
  assert.equal(id?.mac, undefined);
});

test("interfaceIdentifier — ръчно зададен сървърен адрес", () => {
  assert.equal(interfaceIdentifier(must("2001:4860:4860::8888"))?.kind, "low-byte");
});

test("looksLikeHostname — домейн срещу адрес", () => {
  assert.ok(looksLikeHostname("carbonstealth.eu"));
  assert.ok(looksLikeHostname("под.домейн.example.com".replace(/[а-я.]+\./g, "sub.")));
  assert.ok(!looksLikeHostname("8.8.8.8"), "адресът не е домейн");
  assert.ok(!looksLikeHostname("2001:db8::1"));
  assert.ok(!looksLikeHostname("не е домейн"));
  assert.ok(!looksLikeHostname("localhost"), "без точка не е публичен домейн");
});
