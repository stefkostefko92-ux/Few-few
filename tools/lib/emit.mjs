// tools/lib/emit.mjs — безопасно извеждане на голям изход + изходен код.
//
// ДЕФЕКТЪТ, който това затваря (тих, скъп, и засягаше 20+ инструмента):
//
//   console.log(JSON.stringify(huge));
//   process.exit(0);
//
// Когато stdout е ТРЪБА (а точно така го четат CI, таблото и всеки скрипт: `node tool --json | …`),
// записът в Node е АСИНХРОНЕН. `process.exit()` не изчаква буфера — процесът умира и остатъкът се
// губи. Границата е размерът на тръбата: **65 536 байта**. При пренасочване към ФАЙЛ същият код
// работи, защото файловите записи са синхронни — затова дефектът е невидим при ръчна проверка.
//
// Измерено: `quarantine-review --json` дава 544 528 байта към файл и 65 536 през тръба — 88% от
// данните изчезват МЪЛЧАЛИВО. Консуматор, който не валидира, действа върху отрязан JSON.
//
// Поправката е да НЕ убиваме процеса: задаваме `process.exitCode` и оставяме Node да излезе сам,
// след като изпразни stdout. Кодът на изход е същият; разликата е, че данните пристигат цели.
//
//   import { emitJson, finish } from "../lib/emit.mjs";
//   emitJson(data, hasFindings ? 1 : 0);   // печата и задава кода — БЕЗ process.exit
//   finish(1);                             // само кода, за текстов изход

/** Задава изходния код, без да убива процеса (stdout се изпразва естествено). */
export function finish(code = 0) {
  process.exitCode = code;
}

/**
 * Извежда JSON и задава изходния код. НЕ вика `process.exit` — точно това режеше изхода.
 * `space` по подразбиране 2 (четимо за човек и за diff).
 */
export function emitJson(value, code = 0, space = 2) {
  process.stdout.write(JSON.stringify(value, null, space) + "\n");
  finish(code);
}

/** Същото за произволен текст (големи текстови отчети също се режат). */
export function emitText(text, code = 0) {
  process.stdout.write(String(text));
  if (!String(text).endsWith("\n")) process.stdout.write("\n");
  finish(code);
}

/**
 * За РАННИТЕ изходи на върха на модула: `if (JSON_OUT) { print; exit }` не може да стане
 * `finish()`, защото кодът след if-а щеше да продължи (текстовият отчет би се залепил за JSON-а).
 * Тук изходът е безопасен, защото `process.exit` тръгва чак СЛЕД като write() е потвърдил flush
 * през callback-а си — данните са в тръбата, преди процесът да умре.
 *
 *   if (JSON_OUT) await emitJsonNow(data, hasFindings ? 1 : 0);
 */
export async function emitJsonNow(value, code = 0, space = 2) {
  await new Promise((r) => process.stdout.write(JSON.stringify(value, null, space) + "\n", r));
  process.exit(code);
}
