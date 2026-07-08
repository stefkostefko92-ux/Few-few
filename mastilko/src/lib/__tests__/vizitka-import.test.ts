import test from "node:test";
import assert from "node:assert/strict";
import { mapVizitkaToCard, vizitkaApiUrl } from "../vizitka-import";

const FULL = {
  source: "vizitka",
  display_name: "Мария Петрова",
  headline: "Фризьор · салон „Мария“",
  company: "Салон „Мария“",
  phone: "+359 888 555 111",
  email: "maria@example.com",
  website: "https://example.com",
  bio: "Дамско и мъжко подстригване.",
  card_url: "https://vizitka-bg.com/p/maria-petrova",
  photo_url: "https://vizitka-bg.com/photo/abc.png",
  style: { theme: "blue", accent: "#C026D3", avatar_shape: "rounded", font: "serif" },
};

test("пренася контактните полета в редактора", () => {
  const c = mapVizitkaToCard(FULL);
  assert.equal(c.name, "Мария Петрова");
  assert.equal(c.role, "Фризьор · салон „Мария“");
  assert.equal(c.company, "Салон „Мария“");
  assert.equal(c.phone, "+359 888 555 111");
  assert.equal(c.email, "maria@example.com");
  assert.equal(c.website, "example.com"); // без протокол
  assert.equal(c.slogan, "Дамско и мъжко подстригване.");
  assert.equal(c.qr, true);
  assert.equal(c.logo, "https://vizitka-bg.com/photo/abc.png");
});

test("пренася собствения цвят и мапва шрифта", () => {
  const c = mapVizitkaToCard(FULL);
  assert.equal(c.customColors, true);
  assert.equal(c.cacc, "#c026d3");
  assert.equal(c.font, "lora"); // serif → Лора
});

test("невалиден цвят се игнорира; system шрифт → без промяна", () => {
  const c = mapVizitkaToCard({
    display_name: "Иван",
    style: { accent: "не-цвят", font: "system" },
  });
  assert.equal(c.customColors, undefined);
  assert.equal(c.cacc, undefined);
  assert.equal(c.font, undefined);
});

test("без уебсайт ползва адреса на визитката, без протокол", () => {
  const c = mapVizitkaToCard({
    display_name: "Иван",
    card_url: "https://vizitka-bg.com/p/ivan",
  });
  assert.equal(c.website, "vizitka-bg.com/p/ivan");
});

test("липсващи полета стават празни низове, не хвърля", () => {
  const c = mapVizitkaToCard({ display_name: "Само име" });
  assert.equal(c.name, "Само име");
  assert.equal(c.role, "");
  assert.equal(c.logo, "");
});

test("дългите стойности се отрязват до 60 знака", () => {
  const long = "х".repeat(200);
  const c = mapVizitkaToCard({ display_name: long });
  assert.equal(c.name.length, 60);
});

test("vizitkaApiUrl енкодва токена", () => {
  assert.ok(vizitkaApiUrl("a.b.c").endsWith("/api/print/a.b.c"));
});
