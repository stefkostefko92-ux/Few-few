// backend/src/__tests__/containerHardening.test.js
// Втвърдяването на контейнерите не бива да изчезне тихо при следваща редакция
// на `docker-compose.yml`.
//
// ЗАЩО (одит сигурност, 16.08.2026): и трите наши услуги вече вървят
// НЕ-root (`USER node`, nginx-unprivileged) — това е основното. Двата
// предпазителя отгоре затварят остатъка:
//   • `no-new-privileges` блокира качването на права през setuid двоичен файл,
//     тоест обичайния път от „изпълнение на код в контейнера" към root в него;
//   • `cap_drop: ALL` маха и capabilities, закачени на файл.
//
// СЪЗНАТЕЛНО НЕ на postgres/redis: техните entrypoint-и свалят права САМИ
// (gosu/su-exec) и им трябват CHOWN/SETUID/SETGID — сваленето би ги счупило.
// Тестът проверява и това, за да не се „подобри" някой ден в авария.
//
// Тестът чете YAML-а като СТРУКТУРА, не с grep: подниз „cap_drop" в коментар
// не е втвърдяване, а точно такава заблуда вече е хващана в този проект.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const raw = readFileSync(join(ROOT, "docker-compose.yml"), "utf8");

/** Минимален четец: услуга → нейният блок текст. Достатъчен и без YAML зависимост. */
function serviceBlocks(src) {
  const lines = src.split("\n");
  const out = {};
  let cur = null;
  for (const line of lines) {
    const m = /^ {2}([a-z][a-z0-9_-]*):\s*$/.exec(line);
    if (m && !/^ {4}/.test(line)) { cur = m[1]; out[cur] = []; continue; }
    if (cur && /^\s*$/.test(line)) { out[cur].push(line); continue; }
    if (cur && /^ {4}/.test(line)) out[cur].push(line);
    else if (cur && !/^ {2}\S/.test(line)) out[cur].push(line);
    else if (/^\S/.test(line)) cur = null;              // излязохме от services:
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join("\n")]));
}

/** Стойност на списъчен ключ, БЕЗ коментарите — иначе коментар минава за настройка. */
function listValues(block, key) {
  const re = new RegExp(`^ {4}${key}:\\s*$`, "m");
  const m = re.exec(block);
  if (!m) return null;
  const rest = block.slice(m.index + m[0].length).split("\n");
  const vals = [];
  for (const line of rest) {
    if (/^ {6}- /.test(line)) { vals.push(line.replace(/^ {6}- /, "").trim()); continue; }
    if (/^\s*(#.*)?$/.test(line)) continue;
    break;
  }
  return vals;
}

const blocks = serviceBlocks(raw);
const OURS = ["backend", "bot", "frontend"];
const MANAGED = ["postgres", "redis"];

describe("втвърдяване на контейнерите", () => {
  it("намирам услугите (иначе тестът е сляп)", () => {
    for (const s of [...OURS, ...MANAGED]) {
      expect(blocks[s], `липсва услуга ${s}`).toBeTruthy();
    }
  });

  it.each(OURS)("%s: no-new-privileges + cap_drop ALL", (svc) => {
    expect(listValues(blocks[svc], "security_opt"), `${svc}: няма security_opt`)
      .toContain("no-new-privileges:true");
    expect(listValues(blocks[svc], "cap_drop"), `${svc}: няма cap_drop`)
      .toContain("ALL");
  });

  it.each(MANAGED)("%s: НЕ му се свалят capabilities (entrypoint-ът си сваля права сам)", (svc) => {
    expect(
      listValues(blocks[svc], "cap_drop"),
      `${svc}: сваленето на capabilities чупи gosu/su-exec в официалния образ`,
    ).toBeNull();
  });

  it("никоя услуга не е privileged и не добавя capabilities", () => {
    for (const [name, block] of Object.entries(blocks)) {
      expect(/^ {4}privileged:\s*true/m.test(block), `${name}: privileged`).toBe(false);
      expect(listValues(block, "cap_add"), `${name}: cap_add`).toBeNull();
    }
  });
});
