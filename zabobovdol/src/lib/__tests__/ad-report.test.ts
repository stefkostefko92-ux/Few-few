import test from "node:test";
import assert from "node:assert/strict";
import {
  advertiserText,
  bannersInMonth,
  buildAdReport,
  daysInMonth,
  formatEur,
  formatInt,
  formatPercent,
  lastMonths,
  monthEnd,
  monthKey,
  monthLabel,
  monthStart,
  toCents,
  type StatRow,
} from "@/lib/ad-report";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const NB = " ";

test("месеците: ключ, граници, брой дни и етикет на български", () => {
  assert.equal(monthKey(day("2026-10-23")), "2026-10");
  assert.equal(monthStart("2026-10").toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(monthEnd("2026-12").toISOString(), "2027-01-01T00:00:00.000Z");
  assert.equal(daysInMonth("2028-02"), 29);
  assert.equal(daysInMonth("2026-02"), 28);
  assert.equal(monthLabel("2026-09"), "септември 2026");
  assert.throws(() => monthStart("2026-1"));
});

test("последните месеци: най-новият първи, през годината", () => {
  assert.deepEqual(lastMonths(day("2026-02-10"), 4), ["2026-02", "2026-01", "2025-12", "2025-11"]);
});

test("банери в месеца: брои само създадените до края на месеца", () => {
  const created = [day("2026-08-15"), day("2026-09-30"), day("2026-10-02")];
  assert.equal(bannersInMonth(created, "2026-08"), 1);
  assert.equal(bannersInMonth(created, "2026-09"), 2);
  assert.equal(bannersInMonth(created, "2026-10"), 3);
  assert.equal(bannersInMonth(created, "2026-07"), 0);
});

test("цената в цели центове, без float грешки", () => {
  assert.equal(toCents(20), 2000);
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents(-5), 0);
  assert.equal(toCents(Number.NaN), 0);
});

test("отчетът: импресии = прегледи на началната, кликове = banner_click от нея", () => {
  const rows: StatRow[] = [
    // септември — завършен месец
    { day: day("2026-09-01"), metric: "view", path: "/", count: 600 },
    { day: day("2026-09-20"), metric: "view", path: "/", count: 650 },
    { day: day("2026-09-20"), metric: "banner_click", path: "/", count: 25 },
    // шум, който не бива да се брои
    { day: day("2026-09-20"), metric: "view", path: "/uslugi", count: 9999 },
    { day: day("2026-09-20"), metric: "banner_click", path: "/uslugi", count: 50 },
    { day: day("2026-09-20"), metric: "share_click", path: "/", count: 70 },
    { day: day("2026-09-21"), metric: "view", path: "/", count: -4 },
    // по-стар месец извън прозореца
    { day: day("2026-05-05"), metric: "view", path: "/", count: 100 },
  ];
  const [oct, sep, aug] = buildAdReport(rows, {
    today: day("2026-10-23"),
    months: 3,
    priceEur: 20,
    bannersFor: (m) => (m === "2026-09" ? 2 : 0),
  });

  assert.equal(sep.month, "2026-09");
  assert.equal(sep.partial, false);
  assert.equal(sep.views, 1250);
  assert.equal(sep.clicks, 25);
  assert.equal(sep.banners, 2);
  assert.equal(sep.clicksPerBanner, 12.5);
  assert.equal(sep.priceCents, 2000);
  // 20 € × 1000 / 1250 прегледа = 16,00 €
  assert.equal(sep.cpmCents, 1600);
  // 2 банера × 20 € / 25 клика = 1,60 € средно на клик
  assert.equal(sep.cpcCents, 160);
  assert.equal(sep.ctr, 25 / (1250 * 2));
  assert.equal(sep.lowViews, false);
  assert.equal(sep.lowClicks, false);

  // Месец без данни: нищо не се дели на нула.
  assert.equal(aug.views, 0);
  assert.equal(aug.cpmCents, null);
  assert.equal(aug.cpcCents, null);
  assert.equal(aug.ctr, null);
  assert.equal(aug.clicksPerBanner, null);
  assert.equal(aug.lowViews, true);

  // Текущият месец е непълен: цената се взема пропорционално на изминалите дни.
  assert.equal(oct.partial, true);
  assert.equal(oct.daysCounted, 23);
  assert.equal(oct.daysInMonth, 31);
  assert.equal(oct.priceCents, Math.round((2000 * 23) / 31));
});

test("кликове без публикуван банер → поне един банер (без делене на нула)", () => {
  const [m] = buildAdReport(
    [
      { day: day("2026-09-03"), metric: "view", path: "/", count: 10 },
      { day: day("2026-09-03"), metric: "banner_click", path: "/", count: 3 },
    ],
    { today: day("2026-09-30"), months: 1, priceEur: 20, bannersFor: () => 0 },
  );
  assert.equal(m.banners, 1);
  // 30 от 30 дни → пълната цена 20 €; 1 банер / 3 клика = 6,67 €
  assert.equal(m.priceCents, 2000);
  assert.equal(m.cpcCents, 667);
  assert.equal(m.lowViews, true);
  assert.equal(m.lowClicks, true);
});

test("нулева цена → без цена на 1000 и на клик", () => {
  const [m] = buildAdReport([{ day: day("2026-09-03"), metric: "view", path: "/", count: 500 }], {
    today: day("2026-10-01"),
    months: 2,
    priceEur: 0,
    bannersFor: () => 1,
  }).slice(1);
  assert.equal(m.views, 500);
  assert.equal(m.cpmCents, null);
  assert.equal(m.cpcCents, null);
});

test("форматиране: цели числа, евро, проценти", () => {
  assert.equal(formatInt(7), "7");
  assert.equal(formatInt(1234), `1${NB}234`);
  assert.equal(formatInt(1234567), `1${NB}234${NB}567`);
  assert.equal(formatEur(1621), `16,21${NB}€`);
  assert.equal(formatEur(5), `0,05${NB}€`);
  assert.equal(formatEur(123456), `1${NB}234,56${NB}€`);
  assert.equal(formatPercent(0.01234), `1,2${NB}%`);
});

test("текстът за рекламодателя: само общи броеве, цена и предупреждение при малко данни", () => {
  const [, sep] = buildAdReport(
    [
      { day: day("2026-09-01"), metric: "view", path: "/", count: 1250 },
      { day: day("2026-09-01"), metric: "banner_click", path: "/", count: 25 },
    ],
    { today: day("2026-10-05"), months: 2, priceEur: 20, bannersFor: () => 2 },
  );
  const text = advertiserText(sep, "За Бобов дол", 20);
  assert.match(text, /^През септември 2026 началната страница на „За Бобов дол“ е отворена 1 250 пъти\./);
  assert.match(text, /общо 25 пъти \(средно 12,5 на банер при 2 банера\)/);
  assert.match(text, /20,00 € на месец това е 16,00 € на 1000 показвания и средно 1,60 € на клик/);
  assert.doesNotMatch(text, /ориентировъчни/);
  assert.match(text, /без бисквитки/);

  const [oct] = buildAdReport([{ day: day("2026-10-02"), metric: "view", path: "/", count: 1 }], {
    today: day("2026-10-05"),
    months: 1,
    priceEur: 20,
    bannersFor: () => 0,
  });
  const partial = advertiserText(oct, "За Бобов дол", 20);
  assert.match(partial, /^От 1 до 5 октомври 2026 /);
  assert.match(partial, /отворена 1 път\./);
  assert.match(partial, /ориентировъчни/);
  // Без банери не говорим за кликове.
  assert.doesNotMatch(partial, /натиснати/);
});
