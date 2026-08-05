// auditorProfile.test.ts — одиторският профил по Прил. № 29, т. 18–19.
//
// Дупката (одит 2026-08-05): дневникът стоеше зад `requireRole("MANAGER")`, а MANAGER ПИШЕ
// (цени, стоки, настройки). Значи достъпът до одиторския дневник не беше „аналог на
// администраторския, но САМО за четене", както иска т. 19.
//
// РЕШЕНИЕТО е отделен признак `readOnly`, наслагван върху ролята — не четвърта роля. Причината е
// в кода: `ROLE_ORDER` е ЛИНЕЕН (CASHIER<MANAGER<ADMIN) и одиторът не се вписва в него — където и
// да го сложиш, или взима правата за писане на MANAGER, или не вижда дневника.
//
// ГЛАВНИЯТ ИНВАРИАНТ, който тези тестове пазят: посоката на отказа. `requireRole` (пишещият вход)
// отказва одитора ПО ПОДРАЗБИРАНЕ, а `requireRead` изрично го допуска. Така нов пишещ маршрут,
// добавен от някого, който не е чувал за одитора, пада ЗАТВОРЕН. Обратната наредба би направила
// всеки пропуснат маршрут тиха дупка в СУПТО профила.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { csvCell, toCsv } from "../csv";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const auth = readFileSync(join(SRC, "lib", "auth.ts"), "utf8");

test("requireRole отказва одитора — пишещият вход е fail-closed", () => {
  const body = auth.slice(auth.indexOf("export async function requireRole"));
  assert.match(body, /s\.readOnly/, "requireRole трябва да проверява readOnly");
  assert.match(body, /throw jsonError\(403/, "и да отказва с 403");
});

test("requireRead съществува и НЕ проверява readOnly (четенето е позволено)", () => {
  const i = auth.indexOf("export async function requireRead");
  assert.ok(i > -1, "requireRead липсва");
  const body = auth.slice(i);
  assert.doesNotMatch(body.slice(0, body.indexOf("\n}") + 2), /readOnly/,
    "четящият вход не бива да отказва одитора — иначе профилът е безсмислен");
});

test("requireRole минава ПРЕЗ requireRead (една проверка на ролята, не две копия)", () => {
  const body = auth.slice(auth.indexOf("export async function requireRole"), auth.indexOf("export async function requireRead"));
  assert.match(body, /await requireRead\(min\)/,
    "иначе йерархията се дублира и двете копия ще дрейфнат");
});

test("сесията пренася readOnly (иначе флагът умира при вход)", () => {
  assert.match(auth, /readOnly\?:\s*boolean/, "SessionData носи признака");
  assert.match(auth, /readOnly:\s*payload\.readOnly === true/, "и се чете от JWT-то строго");
  const login = readFileSync(join(SRC, "app", "api", "auth", "login", "route.ts"), "utf8");
  assert.match(login, /readOnly:\s*user\.readOnly/, "входът трябва да го сложи в сесията");
});

test("одиторският дневник и експортът са ЧЕТЯЩИ входове", () => {
  for (const rel of [["app", "api", "audit", "route.ts"], ["app", "api", "audit", "export", "route.ts"]]) {
    const s = readFileSync(join(SRC, ...rel), "utf8");
    const get = s.slice(s.indexOf("export async function GET"));
    assert.match(get.slice(0, 600), /requireRead\("MANAGER"\)/,
      `${rel.join("/")}: GET трябва да ползва requireRead, иначе одиторът не вижда дневника`);
  }
});

test("експортът уважава СЪЩИТЕ филтри като четящия маршрут (т. 18)", () => {
  const exp = readFileSync(join(SRC, "app", "api", "audit", "export", "route.ts"), "utf8");
  assert.match(exp, /searchParams\.get\("action"\)/, "филтърът по действие");
  assert.match(exp, /searchParams\.get\("from"\)/, "и по период");
  assert.match(exp, /23,\s*59,\s*59,\s*999/, "„до“ трябва да включва целия ден, иначе изрязва последния");
  assert.match(exp, /text\/csv/, "четим формат");
});

test("CSV екранирането е по RFC 4180 (кавичка, запетая, нов ред в детайлите)", () => {
  // Функцията е в `lib/csv.ts`, не в маршрута — първата ѝ версия живееше вътре в route.ts и
  // тестът я вадеше с `new Function`, което се спъна в TypeScript анотациите. Кръпка в теста
  // би скрила, че функцията просто не е на мястото си.
  assert.equal(csvCell("прост"), "прост");
  assert.equal(csvCell('с "кавичка"'), '"с ""кавичка"""');
  assert.equal(csvCell("с,запетая"), '"с,запетая"');
  assert.equal(csvCell("два\nреда"), '"два\nреда"');
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(undefined), "");
});

test("toCsv слага BOM и CRLF (иначе Excel отваря кирилицата като боклук)", () => {
  const out = toCsv([["а", "б"], ["в", "г"]]);
  assert.ok(out.startsWith("\ufeff"), "липсва BOM");
  assert.match(out, /\r\n/, "редовете се делят с CRLF по RFC 4180");
});

test("нито един ПИШЕЩ маршрут не ползва requireRead (иначе одиторът може да пише)", () => {
  const bad: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (e !== "route.ts") continue;
      const s = readFileSync(p, "utf8");
      for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
        const i = s.indexOf(`export async function ${m}`);
        if (i < 0) continue;
        const next = s.slice(i).search(/\nexport async function /) ;
        const body = next > 0 ? s.slice(i, i + next) : s.slice(i);
        if (/requireRead\(/.test(body)) bad.push(`${p.slice(p.indexOf("/app/"))}: ${m}`);
      }
    }
  };
  walk(join(SRC, "app", "api"));
  assert.deepEqual(bad, [], "мутиращ метод зад requireRead — одиторът би могъл да пише");
});
