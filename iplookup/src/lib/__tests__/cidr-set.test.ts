import assert from "node:assert/strict";
import { test } from "node:test";

import { CidrSet, parseCidrLines } from "../cidr-set";
import { parseIp } from "../ip";

/** Байтовете на адрес — тестовете говорят с текст, наборът работи с байтове. */
function bytes(ip: string): number[] {
  const parsed = parseIp(ip);
  assert.ok(parsed, `невалиден адрес в теста: ${ip}`);
  return parsed.bytes;
}

test("намира блока и връща стойността му", () => {
  const set = new CidrSet([
    { cidr: "52.0.0.0/8", value: "AWS" },
    { cidr: "2600:1f00::/24", value: "AWS IPv6" },
  ]);
  assert.equal(set.match(bytes("52.1.2.3"))?.value, "AWS");
  assert.equal(set.match(bytes("2600:1f00::1"))?.value, "AWS IPv6");
  assert.equal(set.match(bytes("8.8.8.8")), null);
});

test("най-тесният блок печели, независимо от реда на подаване", () => {
  const set = new CidrSet([
    { cidr: "52.0.0.0/8", value: "широк" },
    { cidr: "52.94.1.0/24", value: "тесен" },
  ]);
  assert.equal(set.match(bytes("52.94.1.5"))?.value, "тесен");
  assert.equal(set.match(bytes("52.94.2.5"))?.value, "широк");
});

test("версиите не се смесват", () => {
  const set = new CidrSet([{ cidr: "0.0.0.0/0", value: "всичко IPv4" }]);
  assert.equal(set.match(bytes("1.2.3.4"))?.value, "всичко IPv4");
  assert.equal(set.match(bytes("2001:db8::1")), null, "IPv4 блок не хваща IPv6 адрес");
});

test("невалидните записи се пропускат, а не събарят набора", () => {
  const set = new CidrSet([
    { cidr: "не-е-cidr", value: "х" },
    { cidr: "10.0.0.0/33", value: "твърде дълъг префикс" },
    { cidr: "10.0.0.0", value: "без префикс" },
    { cidr: "10.0.0.0/8", value: "валиден" },
  ]);
  assert.equal(set.size, 1);
  assert.equal(set.match(bytes("10.1.1.1"))?.value, "валиден");
});

test("границите на блока са точни", () => {
  const set = new CidrSet([{ cidr: "100.64.0.0/10", value: "CGNAT" }]);
  assert.ok(set.match(bytes("100.64.0.0")));
  assert.ok(set.match(bytes("100.127.255.255")));
  assert.equal(set.match(bytes("100.128.0.0")), null);
  assert.equal(set.match(bytes("100.63.255.255")), null);
});

test("празният набор не гърми", () => {
  const set = new CidrSet<string>([]);
  assert.equal(set.size, 0);
  assert.equal(set.match(bytes("1.1.1.1")), null);
});

test("parseCidrLines — коментари, празни редове и голи адреси", () => {
  const parsed = parseCidrLines(
    ["# коментар", "", "185.220.101.1", "  10.0.0.0/8  ", "2001:db8::1", "1.2.3.4 # в края"].join("\n"),
  );
  assert.deepEqual(parsed, ["185.220.101.1/32", "10.0.0.0/8", "2001:db8::1/128", "1.2.3.4/32"]);
});
