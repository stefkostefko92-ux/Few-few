#!/usr/bin/env node
// Гейт: изключенията от покритието не растат мълчаливо.
//
// ЗАЩО СЪЩЕСТВУВА. `/* c8 ignore */` е честен инструмент — има код, който не
// може да бъде изпълнен в тест без реален външен хост или без да се отслаби
// самата защита. Но е и най-лесният начин да се вдигне покритието, без да се
// напише тест: гейтът от 100 % функции спира да значи каквото и да е, ако
// някой може просто да заглуши парчето, което го проваля.
//
// Затова тук се проверяват две неща, и двете евтини:
//   • ВСЯКО изключение носи обяснение след `--`. Без него следващият човек
//     не може да прецени дали още е оправдано.
//   • Общият брой не надхвърля таван, вдигнат СЪЗНАТЕЛНО в този файл.
//     Числото е ръчно нарочно: вдигането му е решение, което се вижда в диф.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Папките, в които гейтът за покритие изобщо важи. */
const CORENI = ["erp-ascensori/src/lib"];

/**
 * Числото е ТОЧНО колкото има днес (три блока: два в `rete.ts`, един в
 * `entities.ts`) — гейтът е храпов механизъм, а запас би значел, че следващите
 * три изключения минават мълчаливо.
 *
 * Вдига се само заедно с обяснение в комита защо новото не може да е тест. Не
 * се сваля автоматично — падането му е добра новина и заслужава ръка.
 */
const TAVAN = 3;

function* fajlove(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e === "__tests__" || e === "node_modules") continue;
      yield* fajlove(p);
    } else if (e.endsWith(".ts") || e.endsWith(".tsx")) yield p;
  }
}

const bezObjasnenie = [];
let obshto = 0;

for (const koren of CORENI) {
  for (const f of fajlove(koren)) {
    const src = readFileSync(f, "utf8");
    const linii = src.split("\n");
    linii.forEach((red, i) => {
      const m = /c8 ignore (?:start|next\s*\d*)(.*)$/.exec(red);
      if (!m) return;
      obshto += 1;
      // Обяснението може да продължи на следващия ред в блоков коментар.
      const opashka = (m[1] + " " + (linii[i + 1] ?? "")).trim();
      if (!/--\s*\S/.test(m[1]) && !/--\s*\S/.test(opashka))
        bezObjasnenie.push(`${relative(".", f)}:${i + 1}`);
    });
  }
}

if (bezObjasnenie.length) {
  console.error("✖ Изключение от покритието без обяснение след `--`:");
  for (const r of bezObjasnenie) console.error(`  · ${r}`);
  console.error(
    "\n  Напиши ЗАЩО кодът не може да бъде тестван, не какво прави.",
  );
  process.exit(1);
}

if (obshto > TAVAN) {
  console.error(
    `✖ ${obshto} изключения от покритието при таван ${TAVAN}.\n` +
      "  Ако новото е оправдано, вдигни TAVAN в tools/ci/c8-ignore-audit.mjs\n" +
      "  в СЪЩИЯ комит — така решението се вижда в диф, вместо да се разтвори.",
  );
  process.exit(1);
}

console.log(`✔ ${obshto}/${TAVAN} изключения от покритието, всички с обяснение`);
