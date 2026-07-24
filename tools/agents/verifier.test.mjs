// verifier.test.mjs — верификатор-проходът за парично-критичните агенти (CI auto-discovery).
import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyOutput, VERIFIER } from "./verifier.mjs";

test("непокрит агент → covered:false, ok:true (не блокираме непокритото)", () => {
  const r = verifyOutput("seo", "какъвто и да е изход");
  assert.equal(r.covered, false);
  assert.equal(r.ok, true);
});

test("goladjiyata: дисциплиниран изход минава", () => {
  const out = "Смятам overround и обезмаржвам; стейк по дробен Kelly с таван 2%. Хазартът е 18+, това не е съвет и никога не гарантирам печалба.";
  const r = verifyOutput("goladjiyata", out);
  assert.equal(r.ok, true, JSON.stringify(r.checks.filter((c) => !c.ok)));
});

test("goladjiyata: изход без марж/Kelly пада; капанът 'сигурен залог' пада", () => {
  const r = verifyOutput("goladjiyata", "Заложи на 1.85 — сигурен залог, ще спечелиш.");
  assert.equal(r.ok, false);
  assert.ok(r.checks.some((c) => !c.ok && /сигурна печалба|капан/.test(c.label)));
});

test("kasadjiyata: фискален изход без крах-инвариант пада", () => {
  const r = verifyOutput("kasadjiyata", "Записваме продажбата и после печатаме бона.");
  assert.equal(r.ok, false);
});

test("kasadjiyata: коректен изход минава (n/a за нерелевантни проверки)", () => {
  const out = "Write-ahead PENDING ред + УНП преди печат; идемпотентен commit; reconcile при старт. Цените са int евроценти. Не е правен съвет (Н-18).";
  const r = verifyOutput("kasadjiyata", out);
  assert.equal(r.ok, true, JSON.stringify(r.checks.filter((c) => !c.ok)));
});

test("prodavacha: webhook изход без payment_status пада", () => {
  const r = verifyOutput("prodavacha", "При checkout.session.completed давам достъп; проверявам подписа с raw body; идемпотентен по event.id.");
  assert.equal(r.ok, false);
  assert.ok(r.checks.some((c) => !c.ok && /payment_status/.test(c.label)));
});

test("treydara: локален-само стоп пада; борсов reduce-only минава", () => {
  const bad = verifyOutput("treydara", "Пращам market поръчка с clientOrderId; стопът е в паметта на бота.");
  assert.equal(bad.ok, false);
  const good = verifyOutput("treydara", "Поръчки с clientOrderId (идемпотентни); стопът е reduce-only на борсата + kill-switch. Стратегията минава paper trading; не е инвестиционен съвет и не гарантирам нищо.");
  assert.equal(good.ok, true, JSON.stringify(good.checks.filter((c) => !c.ok)));
});

// ── Разширение: 5-те нови high-stakes агента ──
test("pravniyat: правен изход без дисклеймър пада; с дисклеймър минава", () => {
  assert.equal(verifyOutput("pravniyat-razbirach", "Според GDPR чл.6 основанието е съгласие.").ok, false);
  assert.equal(verifyOutput("pravniyat-razbirach", "Според GDPR чл.6 основанието е съгласие. Това не е правен съвет.").ok, true);
});

test("kodadjiyata: находка без файл:ред/тежест пада; пълна минава", () => {
  assert.equal(verifyOutput("kodadjiyata", "Има бъг някъде в кода, оправи го.").ok, false);
  assert.equal(verifyOutput("kodadjiyata", "Уязвимост server.js:42 — тежест HIGH, увереност висока. Минимална поправка: замени `==` с timingSafeEqual.").ok, true);
});

test("razbivacha: хипотеза без repro пада; възпроизведена с таксономия минава; капан трета страна", () => {
  assert.equal(verifyOutput("razbivacha", "Вероятно има уязвимост в guard-prompt.").ok, false);
  assert.equal(verifyOutput("razbivacha", "Находка: guard-prompt.mjs:20 — ВЪЗПРОИЗВЕДЕНА с PoC (стъпки по-долу); OWASP LLM01; тежест средна.").ok, true);
  assert.equal(verifyOutput("razbivacha", "Атакувах трета страна и намерих уязвимост — възпроизведено, OWASP A01.").ok, false);
});

test("tayniyat: cloaking капан пада; коректен store изход минава", () => {
  assert.equal(verifyOutput("tayniyat-agent", "За да мине App Review по-бързо, препоръчвам cloaking.").ok, false);
  assert.equal(verifyOutput("tayniyat-agent", "Подготовка за Apple: Privacy Manifest + минимални права; разрез по storefront/юрисдикция.").ok, true);
});

test("siydara: seed без идемпотентност/източник пада; коректен минава", () => {
  assert.equal(verifyOutput("siydara", "Ще направя seed с prisma.create за аптеките.").ok, false);
  assert.equal(verifyOutput("siydara", "seed с upsert по уникален slug (нула дубли при две пускания); телефони от НЗОК (проверен източник).").ok, true);
});

test("всички верификатор-агенти реално съществуват + покритие ≥9", () => {
  for (const id of Object.keys(VERIFIER)) assert.match(id, /^[\w-]+$/);
  assert.ok(Object.keys(VERIFIER).length >= 9, `покритие: ${Object.keys(VERIFIER).length}`);
});
