// routeGuards.test.ts — т. 19 Прил. № 29: одиторският профил чете всичко, не пише нищо.
//
// Механиката (виж auth.ts): `requireRole` отказва readOnly, `requireRead` го допуска, а голото
// `requireSession()` НЕ гледа readOnly. Затова правилото е структурно и се проверява статично:
//   • всеки пишещ хендлър (POST/PUT/PATCH/DELETE) минава през `requireRole(`;
//   • никой четящ хендлър (GET) не ползва `requireRole(` — иначе одиторът не вижда справката.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const API = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "api");

/** Пишещи маршрути, които по природа не изискват роля (вход/изход). */
const WRITE_EXEMPT = new Set(["auth/login/route.ts:POST", "auth/logout/route.ts:POST"]);

interface Handler {
  key: string;
  method: string;
  body: string;
}

function handlers(): Handler[] {
  const out: Handler[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) {
        walk(p);
        continue;
      }
      if (e !== "route.ts") continue;
      const src = readFileSync(p, "utf8")
        // коментарите не са код — „дотук стоеше зад requireRole“ не бива да се брои
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
        const i = src.indexOf(`export async function ${m}`);
        if (i < 0) continue;
        const next = src.slice(i + 10).search(/\nexport (async )?function /);
        const body = next > 0 ? src.slice(i, i + 10 + next) : src.slice(i);
        out.push({ key: `${p.slice(API.length + 1)}:${m}`, method: m, body });
      }
    }
  };
  walk(API);
  return out;
}

test("има какво да се проверява (обхождането намира маршрутите)", () => {
  assert.ok(handlers().length > 40);
});

test("всеки пишещ хендлър минава през requireRole (одиторът не пише)", () => {
  const bad = handlers()
    .filter((h) => h.method !== "GET" && !WRITE_EXEMPT.has(h.key))
    .filter((h) => !/requireRole\(/.test(h.body))
    .map((h) => h.key);
  assert.deepEqual(bad, [], "пишещ хендлър без requireRole — readOnly профилът би могъл да пише");
});

test("никой четящ хендлър не ползва requireRole (одиторът вижда справките)", () => {
  const bad = handlers()
    .filter((h) => h.method === "GET")
    .filter((h) => /requireRole\(/.test(h.body))
    .map((h) => h.key);
  assert.deepEqual(bad, [], "GET зад requireRole — одиторският профил е блокиран от справка");
});

test("справките по т. 18 и дневникът по т. 16 са достъпни за одитора", () => {
  const keys = new Map(handlers().map((h) => [h.key, h.body]));
  for (const k of ["export/supto/route.ts:GET", "audit/route.ts:GET", "audit/verify/route.ts:GET"]) {
    const body = keys.get(k);
    assert.ok(body, `липсва ${k}`);
    assert.match(body!, /requireRead\("MANAGER"\)/, `${k} трябва да е requireRead("MANAGER")`);
  }
});

test("администраторът може да създаде одиторски профил (readOnly в схемата на users)", () => {
  const users = readFileSync(join(API, "users", "route.ts"), "utf8");
  assert.match(users, /readOnly:\s*z\.boolean\(\)/, "POST/PATCH на users трябва да приемат readOnly");
});
