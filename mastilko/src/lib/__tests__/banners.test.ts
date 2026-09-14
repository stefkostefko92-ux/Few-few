import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { BannerSchema, readBanners, writeBanners } from "@/lib/banners";

// Банерите са ЕДИНСТВЕНОТО сървърно състояние в продукта. Валидацията им е и
// защитата срещу XSS (`javascript:`), срещу изтичане на IP към чужд домейн
// (външно изображение) и срещу трекинг през style (не-hex цвят).
// banners.ts чете MASTILKO_DATA_DIR ЛЕНИВО (вътре в dataDir()).
const dir = mkdtempSync(path.join(os.tmpdir(), "mastilko-banners-"));
process.env.MASTILKO_DATA_DIR = dir;

const OK = {
  id: "b1",
  title: "Заглавие",
  text: "",
  cta: "",
  href: "https://carbonstealth.eu",
  image: "",
  imageAlt: "",
  bg: "#DE9A32",
  fg: "#3A2E28",
  placement: "all" as const,
  active: true,
  order: 0,
};

test("банери: запис → прочит (roundtrip, подредени по order)", async () => {
  await writeBanners([
    { ...OK, id: "втори", order: 1 },
    { ...OK, id: "първи", order: 0 },
  ]);
  const list = await readBanners();
  assert.deepEqual(list.map((b) => b.id), ["първи", "втори"]);
});

test("банери: повреден JSON файл → падаме на подразбирането, не хвърляме", async () => {
  writeFileSync(path.join(dir, "banners.json"), "{ това не е JSON", "utf8");
  const list = await readBanners();
  assert.ok(list.length > 0, "трябва да върне банера по подразбиране");
});

test("валидация: javascript: линк се отхвърля (XSS)", () => {
  assert.equal(BannerSchema.safeParse({ ...OK, href: "javascript:alert(1)" }).success, false);
});

test("валидация: външно изображение се отхвърля (изтичане на IP)", () => {
  assert.equal(BannerSchema.safeParse({ ...OK, image: "https://evil.example/x.png" }).success, false);
  // protocol-relative също — иначе „//evil.example“ минава за вътрешен път
  assert.equal(BannerSchema.safeParse({ ...OK, image: "//evil.example/x.png" }).success, false);
  assert.equal(BannerSchema.safeParse({ ...OK, image: "/banners/ok.png" }).success, true);
});

test("валидация: цветът е само hex (без url()/трекинг през style)", () => {
  assert.equal(BannerSchema.safeParse({ ...OK, bg: "url(https://evil.example)" }).success, false);
  assert.equal(BannerSchema.safeParse({ ...OK, fg: "red" }).success, false);
  assert.equal(BannerSchema.safeParse({ ...OK, bg: "#fff" }).success, true);
});
