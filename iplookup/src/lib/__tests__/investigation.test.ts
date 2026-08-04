import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assessCgnat,
  blockersFor,
  buildBrief,
  requirementsFor,
  type CaseInput,
  wallClockToUtc,
} from "../investigation";
import { parseIp, type ParsedIp } from "../ip";
import type { LookupReport } from "../lookup";

function ip(value: string): ParsedIp {
  const parsed = parseIp(value);
  assert.ok(parsed, `невалиден адрес в теста: ${value}`);
  return parsed;
}

/** Минимален доклад — тестовете дописват само това, което ги интересува. */
function report(overrides: Partial<LookupReport> = {}): LookupReport {
  const base: LookupReport = {
    ip: ip("203.0.113.9"),
    local: { special: null, embedded: null, interfaceId: null, reverse: "", globallyRoutable: true },
    rdap: null,
    origin: null,
    ptr: null,
    provider: null,
    reputation: null,
    geofeed: null,
    totalMs: 0,
  };
  return { ...base, ...overrides };
}

function source<T>(data: T) {
  return { status: "ok" as const, data, source: "тест", sourceUrl: "https://example.invalid", ms: 1 };
}

const FULL: CaseInput = {
  observedAt: new Date("2026-08-01T10:00:00Z"),
  timezone: "Europe/Sofia",
  sourcePort: 51234,
  caseRef: "ДП 123/2026",
};

const NOW = new Date("2026-08-04T10:00:00Z");

// ── CGNAT ─────────────────────────────────────────────────────────────────

test("адрес в 100.64.0.0/10 е CGNAT без съмнение", () => {
  const found = assessCgnat(ip("100.100.5.5"), report());
  assert.equal(found.suspected, true);
  assert.equal(found.certainty, "сигурно");
});

test("шаблон в обратното име вдига подозрение, но само „вероятно“", () => {
  const found = assessCgnat(
    ip("203.0.113.9"),
    report({ ptr: source({ names: ["cgn-pool-12.example.net"], confirmed: [], forwardConfirmed: false }) }),
  );
  assert.equal(found.suspected, true);
  assert.equal(found.certainty, "вероятно");
  assert.match(found.reason, /cgn/);
});

test("мобилен оператор без обратно име дава най-слабата степен", () => {
  const found = assessCgnat(
    ip("203.0.113.9"),
    report({
      origin: source({ asn: 1234, asName: "EXAMPLE-MOBILE, BG" }),
      ptr: source({ names: [], confirmed: [], forwardConfirmed: false }),
    }),
  );
  assert.equal(found.suspected, true);
  assert.equal(found.certainty, "възможно");
});

test("липсата на признаци НЕ се представя като изключен CGNAT", () => {
  const found = assessCgnat(ip("203.0.113.9"), report());
  assert.equal(found.suspected, false);
  // Формулировката е част от договора с потребителя: инструментът не бива да
  // внушава сигурност, каквато няма.
  assert.match(found.reason, /НЕ го изключва/);
});

// ── Изисквания ────────────────────────────────────────────────────────────

test("при заподозрян CGNAT портът става задължителен", () => {
  const withCgnat = requirementsFor({ ...FULL, sourcePort: null }, {
    suspected: true,
    certainty: "сигурно",
    reason: "",
  });
  const port = withCgnat.find((item) => item.key === "sourcePort");
  assert.equal(port?.mandatory, true);
  assert.equal(port?.satisfied, false);

  const without = requirementsFor({ ...FULL, sourcePort: null }, {
    suspected: false,
    certainty: "възможно",
    reason: "",
  });
  assert.equal(without.find((item) => item.key === "sourcePort")?.mandatory, false);
});

test("моментът и часовата зона са винаги задължителни", () => {
  const list = requirementsFor(FULL, { suspected: false, certainty: "възможно", reason: "" });
  for (const key of ["observedAt", "timezone", "caseRef"]) {
    assert.equal(list.find((item) => item.key === key)?.mandatory, true, `${key} трябва да е задължително`);
  }
});

// ── Пречки ────────────────────────────────────────────────────────────────

test("липсващият момент е пречка, не бележка", () => {
  const input: CaseInput = { ...FULL, observedAt: null };
  const requirements = requirementsFor(input, { suspected: false, certainty: "възможно", reason: "" });
  const blockers = blockersFor(input, requirements, report(), NOW);
  assert.ok(blockers.some((text) => /момент/i.test(text)));
});

test("наблюдение отвъд срока на съхранение се отбелязва", () => {
  const input: CaseInput = { ...FULL, observedAt: new Date("2025-01-01T00:00:00Z") };
  const requirements = requirementsFor(input, { suspected: false, certainty: "възможно", reason: "" });
  const blockers = blockersFor(input, requirements, report(), NOW);
  assert.ok(blockers.some((text) => /давност|не пазят/i.test(text)));
});

test("момент в бъдещето се хваща", () => {
  const input: CaseInput = { ...FULL, observedAt: new Date("2027-01-01T00:00:00Z") };
  const requirements = requirementsFor(input, { suspected: false, certainty: "възможно", reason: "" });
  const blockers = blockersFor(input, requirements, report(), NOW);
  assert.ok(blockers.some((text) => /бъдещето/.test(text)));
});

test("чуждестранна регистрация се отбелязва като различен ред", () => {
  const rep = report({ rdap: source({ name: "EXAMPLE-NET", country: "DE", contacts: [], remarks: [] }) });
  const requirements = requirementsFor(FULL, { suspected: false, certainty: "възможно", reason: "" });
  const blockers = blockersFor(FULL, requirements, rep, NOW);
  assert.ok(blockers.some((text) => /DE/.test(text) && /правна помощ/.test(text)));
});

test("пълен вход при български оператор не оставя пречки", () => {
  const rep = report({
    rdap: source({
      name: "EXAMPLE-BG",
      country: "BG",
      abuse: { role: "abuse", email: "abuse@example.bg" },
      contacts: [],
      remarks: [],
    }),
  });
  const requirements = requirementsFor(FULL, { suspected: false, certainty: "възможно", reason: "" });
  assert.deepEqual(blockersFor(FULL, requirements, rep, NOW), []);
});

// ── Черновата ─────────────────────────────────────────────────────────────

test("черновата носи адреса, момента и ограничението", () => {
  const brief = buildBrief(ip("203.0.113.9"), FULL, report(), NOW);
  assert.match(brief.draft, /203\.0\.113\.9/);
  assert.match(brief.draft, /2026-08-01 10:00:00 UTC/);
  assert.match(brief.draft, /Europe\/Sofia/);
  assert.match(brief.draft, /ДП 123\/2026/);
  // Ограничението е задължителна част от документа — без него справката може да
  // бъде прочетена като локализация, каквато не е.
  assert.match(brief.draft, /НЕ установява адрес на жилище/);
  assert.match(brief.draft, /не е основание/i);
});

test("черновата маркира липсващите полета, вместо да ги скрие", () => {
  const brief = buildBrief(
    ip("203.0.113.9"),
    { observedAt: null, timezone: "", sourcePort: null, caseRef: "" },
    report(),
    NOW,
  );
  assert.match(brief.draft, /ЗАДЪЛЖИТЕЛНО/);
  assert.ok(brief.blockers.length >= 3, "празният вход трябва да даде няколко пречки");
});

test("при CGNAT черновата съдържа бележката за порт", () => {
  const brief = buildBrief(ip("100.100.5.5"), { ...FULL, sourcePort: null }, report(), NOW);
  assert.match(brief.draft, /CGNAT/);
  assert.match(brief.draft, /ЗАДЪЛЖИТЕЛЕН/);
});

test("произходът на данните влиза в черновата, включително падналите източници", () => {
  const rep = report({
    rdap: source({ name: "EXAMPLE-BG", contacts: [], remarks: [] }),
    ptr: {
      status: "error",
      source: "Обратен DNS (PTR)",
      sourceUrl: "https://example.invalid",
      ms: 10,
      message: "падна",
    },
  });
  const brief = buildBrief(ip("203.0.113.9"), FULL, rep, NOW);
  assert.match(brief.draft, /източникът беше недостъпен/);
});

// ── Часови зони ───────────────────────────────────────────────────────────

test("стенен часовник в София → UTC, зимно време (+2)", () => {
  // 15 януари: България е в EET, тоест UTC+2.
  const utc = wallClockToUtc("2026-01-15T13:00", "Europe/Sofia");
  assert.equal(utc?.toISOString(), "2026-01-15T11:00:00.000Z");
});

test("стенен часовник в София → UTC, лятно време (+3)", () => {
  // 15 август: България е в EEST, тоест UTC+3. Ако превръщането ползваше
  // фиксирано отместване, тук щеше да сгреши с цял час — и искането до
  // оператора щеше да сочи грешен интервал.
  const utc = wallClockToUtc("2026-08-15T13:00", "Europe/Sofia");
  assert.equal(utc?.toISOString(), "2026-08-15T10:00:00.000Z");
});

test("UTC входът остава непроменен", () => {
  assert.equal(wallClockToUtc("2026-08-15T13:00", "UTC")?.toISOString(), "2026-08-15T13:00:00.000Z");
});

test("зона западно от Гринуич", () => {
  // Ню Йорк през август е UTC−4.
  assert.equal(
    wallClockToUtc("2026-08-15T13:00", "America/New_York")?.toISOString(),
    "2026-08-15T17:00:00.000Z",
  );
});

test("секундите се уважават, а боклукът се отхвърля", () => {
  assert.equal(wallClockToUtc("2026-08-15T13:00:45", "UTC")?.toISOString(), "2026-08-15T13:00:45.000Z");
  for (const bad of ["", "вчера", "2026-13-45T99:99", "2026-08-15"]) {
    assert.equal(wallClockToUtc(bad, "UTC"), null, `трябваше да е невалиден: ${bad}`);
  }
});

test("непозната зона връща null, вместо тихо да сгреши часа", () => {
  assert.equal(wallClockToUtc("2026-08-15T13:00", "Няма/Такава"), null);
});

test("30 февруари не се превърта тихо в 2 март", () => {
  assert.equal(wallClockToUtc("2026-02-30T12:00", "UTC"), null);
  assert.ok(wallClockToUtc("2028-02-29T12:00", "UTC"), "високосната година е валидна");
});
