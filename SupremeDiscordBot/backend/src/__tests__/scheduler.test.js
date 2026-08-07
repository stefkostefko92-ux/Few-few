// backend/src/__tests__/scheduler.test.js
// Структурни гейтове върху планировчика. Не пускаме реални cron задачи —
// проверяваме двете свойства, чиято липса е невидима до продукцията.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "services", "scheduler.js"),
  "utf-8",
);
// Коментарите съдържат същите шаблони — режем ги, иначе тестът чете обяснение
// вместо код (грешка, която вече сме правили веднъж).
const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

describe("scheduler", () => {
  it("всяка задача носи ЯВНА часова зона", () => {
    // Без `timezone` node-cron ползва локалната зона на процеса. Всеки коментар
    // във файла пише „UTC“, но нищо не го налагаше: сменен TZ в образа размества
    // всяко разписание безшумно. Най-опасна е дневната ролка („5 0 * * *“), която
    // смята „вчера“ — изместена граница на деня значи дублирани или липсващи дни.
    const schedules = code.match(/cron\.schedule\(/g) || [];
    const withTz = code.match(/\}\), TZ\);/g) || [];
    expect(schedules.length).toBeGreaterThan(0);
    expect(withTz.length, "задача без TZ").toBe(schedules.length);
  });


  it("всяка задача има УНИКАЛНО име за ключалката", () => {
    // CRITICAL, доказан с изпълнен експеримент срещу node-cron 4.5.0 (07.08.2026):
    // три задачи подаваха един и същ низ („* * * * *“) като име, а обвивката
    // `job()` ключира анти-застъпването именно по него. node-cron вика всички
    // задачи със същия израз В ЕДИН tick, последователно: първата добавя ключа и
    // спира на първия `await` (DB I/O), а втората и третята виждат зает ключ и се
    // ПРОПУСКАТ. Завинаги. Така авто-затварянето на анкети и НАСРОЧЕНИТЕ
    // СЪОБЩЕНИЯ (платена функция) не се бяха изпълнявали нито веднъж.
    //
    // Предишният структурен гейт проверяваше, че всяка задача минава през `job()`
    // — но не и че входовете ѝ са РАЗЛИЧИМИ. Точно там мина дефектът.
    const names = [...code.matchAll(/job\(\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect([...new Set(dupes)], `повторено име на задача: ${[...new Set(dupes)].join(" · ")}`).toEqual([]);
  });

  it("името на задачата не е самият cron израз (нечетимо в лога и лесно се повтаря)", () => {
    const names = [...code.matchAll(/job\(\s*"([^"]+)"/g)].map((m) => m[1]);
    const cronish = names.filter((n) => /^[\d*/,\-\s]+$/.test(n));
    expect(cronish, `име-израз: ${cronish.join(" · ")}`).toEqual([]);
  });

  it("всяка задача минава през обвивката job() (анти-застъпване + Sentry)", () => {
    const schedules = [...code.matchAll(/cron\.schedule\("([^"]+)",\s*([\w(]+)/g)];
    const bare = schedules.filter((m) => m[2] !== "job(").map((m) => m[1]);
    expect(bare, `гол callback без job(): ${bare.join(" · ")}`).toEqual([]);
  });
});

// ─── Провалът на задача се ЧУВА ─────────────────────────────────────────────
// ДЕФЕКТЪТ (Наблюдателят, одит 07.08.2026): обвивката `job()` имаше Sentry
// клон, но той беше НЕДОСТИЖИМ — всяка от десетте задачи има собствен
// try/catch, който гълта грешката и пише само в конзолата. Cron задача можеше
// да се проваля при всяко задействане месеци наред без нито едно събитие в
// таблото. Този клас вече ни изгоря: три задачи споделяха ключ за заключване и
// две никога не се изпълняваха — открихме го при одит, не от аларма.
describe("нито един провал не се гълта мълчаливо", () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "services", "scheduler.js"),
    "utf-8",
  );
  const code = src.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");

  it("нула гол console.error в catch — всичко минава през jobFail", () => {
    // Гол лог значи провал, видим само за човек, който точно тогава гледа
    // контейнерния лог. `jobFail` е единственият път навън.
    expect(code).not.toMatch(/console\.error\(\s*"\[Scheduler\]/);
  });

  it("jobFail докладва в Sentry, не само в конзолата", () => {
    const fn = code.slice(code.indexOf("async function jobFail"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toContain("captureException");
    expect(body).toContain("tags: { job: name }"); // без таг не се вижда КОЯ задача
  });

  it("всяка от 10-те задачи има СВОЕ име в jobFail — не общо „scheduler“", () => {
    const names = [...code.matchAll(/jobFail\("([a-z-]+)"/g)].map((m) => m[1]);
    expect(new Set(names).size, `имената се повтарят: ${names.join(", ")}`).toBe(names.length);
    expect(names.length).toBeGreaterThanOrEqual(10);
  });
});


// ─── Пулс на дневните задачи ────────────────────────────────────────────────
// `jobFail` прави провала чуваем, но задача, която ПРЕСТАНЕ ДА СЕ ПУСКА, не се
// проваля — просто мълчи, и не се различава от „нямаше работа". Точно това ни
// се случи с трите задачи, споделящи ключ за заключване.
describe("дневните задачи оставят пулс, за да се вижда, че още работят", () => {
  const src2 = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "services", "scheduler.js"),
    "utf-8",
  );
  const code2 = src2.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");

  it("има помощник, който пише в одитния дневник", () => {
    expect(code2).toContain("async function jobHeartbeat");
    expect(code2).toMatch(/action:\s*`JOB_OK_/);
  });

  it("пулсът НИКОГА не поваля задачата — той е диагностика, не работа", () => {
    const fn = code2.slice(code2.indexOf("async function jobHeartbeat"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body, "пулсът може да хвърли и да събори задачата").toContain("catch");
  });

  it("покрити са именно ДНЕВНИТЕ/седмичните, не минутните", () => {
    // Минутна задача би заляла дневника; дневната мълчи незабелязано.
    for (const name of ["archive-cleanup", "retention-weekly", "trial-expiry-dm", "daily-metrics-rollup"]) {
      expect(code2, `${name} няма пулс`).toContain(`jobHeartbeat("${name}"`);
    }
    expect(code2, "минутна задача пише пулс — това ще залее одита").not.toContain('jobHeartbeat("scheduled-messages"');
  });
});
