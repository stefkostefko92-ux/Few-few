// manifest-lint.test.mjs — node:test за FiveM линтера (CI auto-discovery).
import { test } from "node:test";
import assert from "node:assert/strict";
import { lintFile } from "./manifest-lint.mjs";

const codes = (fs) => new Set(fs.map((f) => f.code));

test("манифест без fx_version → HIGH no-fx-version", () => {
  const f = lintFile("game 'gta5'\nserver_script 'sv.lua'", "fxmanifest.lua");
  assert.ok(codes(f).has("no-fx-version"));
  assert.ok(f.some((x) => x.code === "no-fx-version" && x.sev === "HIGH"));
});

test("пълен манифест → без no-fx-version/no-game", () => {
  const f = lintFile("fx_version 'cerulean'\ngame 'gta5'\nserver_script 'sv.lua'", "fxmanifest.lua");
  assert.ok(!codes(f).has("no-fx-version"));
  assert.ok(!codes(f).has("no-game"));
});

test("client раздава пари без сървърна заявка → HIGH client-authoritative", () => {
  const f = lintFile("RegisterCommand('rich', function() AddMoney(1000000) end)", "client.lua");
  assert.ok(f.some((x) => x.code === "client-authoritative" && x.sev === "HIGH"));
});

test("client с TriggerServerEvent → без client-authoritative", () => {
  const f = lintFile("RegisterCommand('buy', function() TriggerServerEvent('shop:buy') end)", "client.lua");
  assert.ok(!codes(f).has("client-authoritative"));
});

test("сървърен net event без source → HIGH no-source-check", () => {
  const f = lintFile("RegisterNetEvent('shop:buy')\nAddEventHandler('shop:buy', function(item) giveItem(item) end)", "server.lua");
  assert.ok(f.some((x) => x.code === "no-source-check" && x.sev === "HIGH"));
});

test("сървърен handler, който ползва source → без no-source-check", () => {
  const f = lintFile("RegisterNetEvent('shop:buy')\nAddEventHandler('shop:buy', function(item)\n  local src = source\n  validate(src, item)\nend)", "server.lua");
  assert.ok(!codes(f).has("no-source-check"));
});

test("SQL конкатенация → HIGH sql-concat", () => {
  const f = lintFile("MySQL.query('SELECT * FROM users WHERE id = ' .. id)", "server.lua");
  assert.ok(f.some((x) => x.code === "sql-concat" && x.sev === "HIGH"));
});

test("твърдо вписана тайна → HIGH hardcoded-secret", () => {
  const f = lintFile("local steam_webApiKey = 'ABCDEF0123456789ABCDEF'", "config.lua");
  assert.ok(f.some((x) => x.code === "hardcoded-secret" && x.sev === "HIGH"));
});

test("чист сървърен ресурс → 0 находки", () => {
  const f = lintFile("local src = source\nMySQL.query('SELECT 1 WHERE id = ?', { id })", "server.lua");
  assert.equal(f.length, 0);
});
