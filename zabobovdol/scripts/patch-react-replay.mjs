#!/usr/bin/env node
// Кръпка за React #418 (грешка при хидратация) във вградения в Next.js React.
//
// Бъгът (поправен в React 19.3, още липсва в React-а на next@15.5.x):
// host елемент (<main>, <div>), чието дете е клиентски компонент с още
// незареден JS чънк, „спира“ (SuspenseException) по време на хидратацията.
// React го пуска отново (replaySuspendedUnitOfWork), но БЕЗ да върне курсора
// на хидратацията — елементът търси себе си сред СОБСТВЕНИТЕ си деца, не се
// намира и React рисува целия документ наново на клиента: премигване, загубен
// фокус и въведен текст. При съвпадащи тагове — тиха грешна хидратация.
// Под натоварване: 1–3 % от зарежданията.
//
// Поправката е дословно редовете от upstream React 19.3 (същата функция): при
// повторното изпълнение на HostComponent, ако той е текущият родител на
// хидратацията — курсорът се връща на самия елемент.
//
// Пуска се преди `next build` и `next dev` (Dockerfile ползва
// `npm ci --ignore-scripts`, затова НЕ е postinstall). Идемпотентна е. Ако
// React в Next вече съдържа поправката — нищо не прави. Ако мястото липсва
// (друга версия на Next) — билдът ПАДА: без кръпка бъгът се връща тихо.
// Махнете скрипта след обновяване до Next с React ≥ 19.3.

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MARK = "/* zbd: React 19.3 replay-hydration fix */";

/**
 * Вмъква поправката в изходния код на react-dom клиента.
 * @param {string} src
 * @returns {{ src: string, status: "patched" | "already-patched" | "fixed-upstream" | "no-replay" }}
 */
export function patchReplaySource(src) {
  if (src.includes(MARK)) return { src, status: "already-patched" };
  // Продукционната сборка: replaySuspendedUnitOfWork; development: replayBeginWork.
  const start = src.search(/function (?:replayBeginWork|replaySuspendedUnitOfWork)\(unitOfWork\) \{\n(?:(?!function )[\s\S])*?switch \(/);
  if (start === -1) return { src, status: "no-replay" };
  const end = src.indexOf("function throwAndUnwindWorkLoop(", start);
  if (end === -1) throw new Error("patch-react-replay: краят на replay функцията не е намерен");
  const body = src.slice(start, end);
  if (body.includes("=== hydrationParentFiber")) return { src, status: "fixed-upstream" };
  const re = /( *)case 5:\n( *)resetHooksOnUnwind\((next|unitOfWork)\);\n/g;
  const hits = [...body.matchAll(re)];
  if (hits.length !== 1) {
    throw new Error(`patch-react-replay: очаквах 1 място „case 5: resetHooksOnUnwind(...)“, намерих ${hits.length}`);
  }
  for (const id of ["hydrationParentFiber", "nextHydratableInstance", "isHydrating", "function popToNextHostParent("]) {
    if (!src.includes(id)) throw new Error(`patch-react-replay: липсва „${id}“ — друга версия на React`);
  }
  const [whole, , ind, v] = hits[0];
  const fix =
    `${ind}${MARK}\n` +
    `${ind}var fiber = ${v};\n` +
    `${ind}fiber === hydrationParentFiber &&\n` +
    `${ind}  (isHydrating\n` +
    `${ind}    ? (popToNextHostParent(fiber),\n` +
    `${ind}      5 === fiber.tag &&\n` +
    `${ind}        null != fiber.stateNode &&\n` +
    `${ind}        (nextHydratableInstance = fiber.stateNode))\n` +
    `${ind}    : (popToNextHostParent(fiber), (isHydrating = !0)));\n`;
  const at = start + hits[0].index + whole.length;
  return { src: src.slice(0, at) + fix + src.slice(at), status: "patched" };
}

// Файловете с клиента на React, които Next вгражда (stable и experimental канал).
const FILES = [
  "react-dom-client.production.js",
  "react-dom-client.development.js",
  "react-dom-profiling.profiling.js",
  "react-dom-profiling.development.js",
];

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const nextDir = join(root, "node_modules", "next", "dist", "compiled");
  const required = join(nextDir, "react-dom", "cjs", "react-dom-client.production.js");
  if (!existsSync(required)) throw new Error(`patch-react-replay: няма ${required} — пуснете npm ci`);
  let changed = 0;
  for (const channel of ["react-dom", "react-dom-experimental"]) {
    for (const f of FILES) {
      const file = join(nextDir, channel, "cjs", f);
      if (!existsSync(file)) continue;
      const { src, status } = patchReplaySource(readFileSync(file, "utf8"));
      if (status === "no-replay") throw new Error(`patch-react-replay: ${channel}/${f} — replay функцията не е намерена`);
      if (status === "patched") {
        writeFileSync(file, src);
        changed++;
      }
      console.log(`patch-react-replay: ${channel}/${f} — ${status}`);
    }
  }
  // Webpack кешира модулите от node_modules по версията на пакета, не по
  // съдържанието — без това старият (некърпен) React остава в билда.
  if (changed > 0) rmSync(join(root, ".next", "cache", "webpack"), { recursive: true, force: true });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
