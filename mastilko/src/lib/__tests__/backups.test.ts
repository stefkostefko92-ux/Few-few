import test from "node:test";
import assert from "node:assert/strict";
import { MAX_BACKUPS, backupKey, pushBackup, readBackups, takeBackup } from "@/lib/backups";

/** localStorage в паметта — backups.ts иска само get/set/remove. */
function store() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    raw: m,
  };
}

const K = "mastilko-cv";

test("копия: най-новото е първо", () => {
  const s = store();
  pushBackup(s, K, "A", new Date("2026-09-25T10:00:00Z"));
  pushBackup(s, K, "B", new Date("2026-09-25T11:00:00Z"));
  assert.deepEqual(readBackups(s, K).map((b) => b.data), ["B", "A"]);
});

test("ДВА линка подред вече не губят оригиналния проект", () => {
  // Точно сценарият от прегледа: проект = CV, отваря линк А (копие = CV),
  // после линк Б (копие = А). С едно място CV-то изчезваше завинаги.
  const s = store();
  pushBackup(s, K, "моето CV"); // при отваряне на линк А
  pushBackup(s, K, "дизайн А"); // при отваряне на линк Б
  const all = readBackups(s, K).map((b) => b.data);
  assert.ok(all.includes("моето CV"), "оригиналът трябва да е още там");
});

test("еднакво с най-новото копие не се дублира", () => {
  const s = store();
  pushBackup(s, K, "A");
  pushBackup(s, K, "A");
  assert.equal(readBackups(s, K).length, 1);
});

test(`пазят се най-много ${MAX_BACKUPS} копия`, () => {
  const s = store();
  for (const d of ["1", "2", "3", "4", "5"]) pushBackup(s, K, d);
  assert.deepEqual(readBackups(s, K).map((b) => b.data), ["5", "4", "3"]);
});

test("takeBackup маха копието и го връща; последното чисти ключа", () => {
  const s = store();
  pushBackup(s, K, "A");
  pushBackup(s, K, "B");
  assert.equal(takeBackup(s, K, 1)?.data, "A");
  assert.deepEqual(readBackups(s, K).map((b) => b.data), ["B"]);
  assert.equal(takeBackup(s, K, 0)?.data, "B");
  assert.equal(s.raw.has(backupKey(K)), false, "празен списък не оставя боклук в хранилището");
  assert.equal(takeBackup(s, K, 0), null);
});

test("старият формат (проектът записан директно) се чете като едно копие", () => {
  // Копия, направени от предишната версия на кода, не бива да се губят.
  const s = store();
  s.setItem(backupKey(K), JSON.stringify({ name: "Иван" }));
  const list = readBackups(s, K);
  assert.equal(list.length, 1);
  assert.equal(JSON.parse(list[0]!.data).name, "Иван");
});

test("повреден запис → няма копия, не хвърля", () => {
  const s = store();
  s.setItem(backupKey(K), "{ това не е json");
  assert.deepEqual(readBackups(s, K), []);
  s.setItem(backupKey(K), JSON.stringify([{ at: 1, data: null }, "низ"]));
  assert.deepEqual(readBackups(s, K), [], "елементи с грешна форма се пропускат");
});

test("забранено хранилище → няма копия, не хвърля", () => {
  const broken = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {},
    removeItem: () => {},
  };
  assert.deepEqual(readBackups(broken, K), []);
});
