import { test } from "node:test";
import assert from "node:assert/strict";
import {
  subdomainOf,
  isValidSubdomain,
  isValidDomain,
  RESERVED_SUBDOMAINS,
  PLATFORM_APEX,
} from "@/lib/domains";

test("subdomainOf връща етикета за наш поддомейн, иначе null", () => {
  assert.equal(subdomainOf(`shop.${PLATFORM_APEX}`), "shop");
  assert.equal(subdomainOf(`SHOP.${PLATFORM_APEX}:443`), "shop");
  assert.equal(subdomainOf(`a.b.${PLATFORM_APEX}`), null); // вложени поддомейни не
  assert.equal(subdomainOf("example.com"), null);
  assert.equal(subdomainOf(PLATFORM_APEX), null); // самият апекс не е поддомейн
});

test("isValidSubdomain: формат на DNS етикет", () => {
  assert.ok(isValidSubdomain("my-shop"));
  assert.ok(isValidSubdomain("a"));
  assert.ok(!isValidSubdomain("-bad"));
  assert.ok(!isValidSubdomain("bad-"));
  assert.ok(!isValidSubdomain("има кирилица"));
  assert.ok(!isValidSubdomain("твърде-дълъг-поддомейн-над-32-знака-неее"));
});

test("запазени поддомейни", () => {
  assert.ok(RESERVED_SUBDOMAINS.has("www"));
  assert.ok(RESERVED_SUBDOMAINS.has("api"));
});

test("isValidDomain: истински домейни, не нашия апекс", () => {
  assert.ok(isValidDomain("example.com"));
  assert.ok(isValidDomain("www.example.co.uk"));
  assert.ok(!isValidDomain("localhost"));
  assert.ok(!isValidDomain("няма"));
  assert.ok(!isValidDomain(`shop.${PLATFORM_APEX}`)); // нашият апекс не е „собствен домейн"
});
