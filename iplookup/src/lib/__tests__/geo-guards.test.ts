import assert from "node:assert/strict";
import { test } from "node:test";

import { classifyNetwork, constrainGeoClaim, looksLikeMobilePool, stripSubCity } from "../geo-guards";

test("кварталът се реже — базата няма откъде да го знае", () => {
  // Реалният изход на DB-IP за GPRS пула на Йеттел, зад който стоят милиони
  // абонати в цялата страна.
  assert.equal(stripSubCity("Sofia (Rayon Mladost)"), "Sofia");
  assert.equal(stripSubCity("Sofia (Poligona)"), "Sofia");
  assert.equal(stripSubCity("Sofia - Rayon Lyulin"), "Sofia");
  assert.equal(stripSubCity("Пловдив (Район Тракия)"), "Пловдив");
});

test("нормалните имена на градове остават цели", () => {
  assert.equal(stripSubCity("Sofia"), "Sofia");
  assert.equal(stripSubCity("Велико Търново"), "Велико Търново");
  assert.equal(stripSubCity("Frankfurt am Main"), "Frankfurt am Main");
  assert.equal(stripSubCity("Sankt-Peterburg"), "Sankt-Peterburg");
  // Тире вътре в името не е квартал.
  assert.equal(stripSubCity("Baden-Baden"), "Baden-Baden");
});

test("мобилните пулове се разпознават по самопризнанието на оператора", () => {
  assert.ok(looksLikeMobilePool("Mobiltel_GPRS_Network"));
  assert.ok(looksLikeMobilePool("BTC-Mobile Internet Data Service"));
  assert.ok(looksLikeMobilePool("VIVACOM Mobile Core Network"));
  assert.ok(looksLikeMobilePool("Yettel Bulgaria EAD - public GPRS/3G"));
  assert.ok(looksLikeMobilePool("Telenor Bulgaria - GPRS services"));
  assert.ok(looksLikeMobilePool(undefined, "LTE pool"));
});

test("обикновените мрежи не се маркират като мобилни", () => {
  assert.ok(!looksLikeMobilePool("NETERRA-HOSTING"));
  assert.ok(!looksLikeMobilePool("BTC-Broadband"));
  assert.ok(!looksLikeMobilePool(""));
  assert.ok(!looksLikeMobilePool(undefined));
  // Думата трябва да е отделна — иначе всяко „automobile" би паднало в капана.
  assert.ok(!looksLikeMobilePool("AUTOMOBILE-CLUB-NET"));
});

test("мобилен пул пада до държава, дори когато базата предлага квартал", () => {
  const claim = constrainGeoClaim({
    country: "BG",
    city: "Sofia (Rayon Mladost)",
    latitude: 42.62,
    longitude: 23.37,
    mobilePool: true,
  });
  assert.equal(claim.granularity, "country");
  assert.equal(claim.city, undefined, "градът НЕ бива да излиза");
  assert.equal(claim.latitude, undefined, "координатите също не");
  assert.equal(claim.medianErrorKm, 207);
  assert.match(claim.limitedBecause ?? "", /мобилен пул/);
  assert.match(claim.limitedBecause ?? "", /642|1416/, "числото обяснява по-добре от абзац текст");
});

test("инфраструктурен адрес запазва града, но изчистен от квартал", () => {
  const claim = constrainGeoClaim({
    country: "BG",
    city: "Sofia (Poligona)",
    latitude: 42.66,
    longitude: 23.38,
    networkClass: "infrastructure",
  });
  assert.equal(claim.granularity, "city");
  assert.equal(claim.city, "Sofia");
  assert.equal(claim.latitude, 42.66);
  assert.equal(claim.medianErrorKm, 16);
  assert.equal(claim.limitedBecause, undefined);
});

test("без град остава ниво държава", () => {
  const claim = constrainGeoClaim({ country: "DE", networkClass: "infrastructure" });
  assert.equal(claim.granularity, "country");
  assert.equal(claim.city, undefined);
});

test("празно име на град не се превръща в празен низ", () => {
  const claim = constrainGeoClaim({ country: "BG", city: "(Rayon X)", networkClass: "infrastructure" });
  assert.equal(claim.city, undefined);
  assert.equal(claim.granularity, "country");
});

// ── Безопасната посока по подразбиране ────────────────────────────────────

test("непознат клас мрежа НЕ показва град", () => {
  // Реален пропуск, намерен при проверка срещу живата база: пул на Йеттел с
  // име „Yettel Bulgaria - GoWeb" не съдържа нито „GPRS", нито „mobile", а
  // базата охотно предлагаше „Sofia (Rayon Mladost)". Ако неизвестното минава
  // за фиксирана връзка, инструментът твърди квартал за цяла страна.
  const claim = constrainGeoClaim({
    country: "BG",
    city: "Sofia (Rayon Mladost)",
    latitude: 42.66,
    longitude: 23.37,
    networkClass: "unknown",
  });
  assert.equal(claim.granularity, "country");
  assert.equal(claim.city, undefined);
  assert.equal(claim.latitude, undefined);
  assert.match(claim.limitedBecause ?? "", /не може да се отличи/i);
});

test("липсващият клас се третира като непознат, не като фиксиран", () => {
  const claim = constrainGeoClaim({ country: "BG", city: "Sofia" });
  assert.equal(claim.granularity, "country");
  assert.equal(claim.city, undefined);
});

test("класификацията разпознава трите случая", () => {
  assert.equal(classifyNetwork("VIVACOM Mobile Core Network"), "mobile");
  assert.equal(classifyNetwork("NETERRA-HOSTING"), "infrastructure");
  assert.equal(classifyNetwork("AlphaVPS dedicated servers"), "infrastructure");
  assert.equal(classifyNetwork("Yettel Bulgaria - GoWeb"), "unknown");
  assert.equal(classifyNetwork("BTC-Broadband"), "unknown");
  assert.equal(classifyNetwork(""), "unknown");
});

test("мобилното бие инфраструктурното при двусмислено име", () => {
  // „Mobile Core Network" съдържа и „mobile", и нищо инфраструктурно — но
  // важното е редът: намери ли се мобилен признак, той решава.
  assert.equal(classifyNetwork("Mobile Cloud Servers"), "mobile");
});

test("PTR имената също носят признаци за инфраструктура", () => {
  assert.equal(classifyNetwork("SOME-NET", undefined, "vps-12.example.com"), "infrastructure");
  assert.equal(classifyNetwork("SOME-NET", undefined, "srv01.hosting.example"), "infrastructure");
  // Мобилният признак в което и да е поле пак бие.
  assert.equal(classifyNetwork("SOME-NET", "EXAMPLE MOBILE", "vps-12.example.com"), "mobile");
});
