// post-lint.test.mjs — node:test за линтера на социални постове (CI auto-discovery).
import { test } from "node:test";
import assert from "node:assert/strict";
import { lintPost, lintSource } from "./post-lint.mjs";

const codes = (fs) => new Set(fs.map((f) => f.code));

test("пост над лимита за X → HIGH too-long", () => {
  const f = lintPost({ platform: "x", text: "а".repeat(300) }, 0);
  assert.ok(f.some((x) => x.code === "too-long" && x.sev === "HIGH"));
});

test("пост в рамките на лимита → без too-long", () => {
  const f = lintPost({ platform: "x", text: "кратко" }, 0);
  assert.ok(!codes(f).has("too-long"));
});

test("празен текст → HIGH empty-text", () => {
  const f = lintPost({ platform: "x", text: "  " }, 0);
  assert.ok(f.some((x) => x.code === "empty-text" && x.sev === "HIGH"));
});

test("тайна в текста → HIGH secret-in-text", () => {
  // Ползваме Bearer токен (не sk-…), за да не трипваме repo secret-scan-а върху самия тест —
  // post-lint.SECRET_RE хваща и двете, а gitleaks/secret-scan няма Bearer правило.
  const f = lintPost({ platform: "linkedin", text: "токенът е Bearer abcdefghij0123456789xyz" }, 0);
  assert.ok(f.some((x) => x.code === "secret-in-text" && x.sev === "HIGH"));
});

test("медия без alt → MEDIUM no-alt", () => {
  const f = lintPost({ platform: "instagram", text: "снимка", hasMedia: true }, 0);
  assert.ok(f.some((x) => x.code === "no-alt" && x.sev === "MEDIUM"));
});

test("медия с alt → без no-alt", () => {
  const f = lintPost({ platform: "instagram", text: "снимка", hasMedia: true, alt: "описание на снимката" }, 0);
  assert.ok(!codes(f).has("no-alt"));
});

test("връзка без UTM → INFO no-utm", () => {
  const f = lintPost({ platform: "facebook", text: "виж", link: "https://carbonstealth.eu" }, 0);
  assert.ok(f.some((x) => x.code === "no-utm" && x.sev === "INFO"));
});

test("твърде много хаштагове за X → INFO too-many-hashtags", () => {
  const f = lintPost({ platform: "x", text: "пост", hashtags: ["#a", "#b", "#c", "#d", "#e"] }, 0);
  assert.ok(f.some((x) => x.code === "too-many-hashtags"));
});

test("невалиден JSON → HIGH bad-json", () => {
  const f = lintSource("{ не е json", "posts.json");
  assert.ok(f.some((x) => x.code === "bad-json" && x.sev === "HIGH"));
});

test("валиден чист план → 0 HIGH", () => {
  const src = JSON.stringify({ posts: [{ platform: "linkedin", text: "Ново от Carbon Stealth", link: "https://carbonstealth.eu?utm_source=linkedin" }] });
  const f = lintSource(src, "posts.json");
  assert.ok(!f.some((x) => x.sev === "HIGH"));
});

// Заглавие и миниатюра като двойка (23.11.2026, идея от youtube-agent-skill, наш код): заглавието и текстът на
// миниатюрата се виждат заедно — миниатюрата трябва да добавя, не да повтаря.
test("YouTube: заглавие над 100 знака → HIGH (твърд лимит); над 70 → INFO (отрязва се в търсенето)", () => {
  const long = lintPost({ platform: "youtube", text: "описание", title: "а".repeat(101), thumbnailText: "Една дума" }, 0);
  assert.ok(long.some((x) => x.code === "title-too-long" && x.sev === "HIGH"));
  const mid = lintPost({ platform: "youtube", text: "описание", title: "б".repeat(80), thumbnailText: "Една дума" }, 0);
  assert.ok(mid.some((x) => x.code === "title-truncated" && x.sev === "INFO"));
  assert.ok(!codes(mid).has("title-too-long"));
});

test("миниатюра, която повтаря заглавието → MEDIUM; която добавя → чисто", () => {
  const rep = lintPost({ platform: "youtube", text: "о", title: "Как да монтираш клип за 10 минути", thumbnailText: "Монтираш клип за 10 минути" }, 0);
  assert.ok(rep.some((x) => x.code === "thumb-repeats-title" && x.sev === "MEDIUM"));
  const add = lintPost({ platform: "youtube", text: "о", title: "Как да монтираш клип за 10 минути", thumbnailText: "Без Premiere" }, 0);
  assert.ok(!codes(add).has("thumb-repeats-title"));
  assert.ok(!codes(add).has("thumb-too-wordy"));
});

test("миниатюра над 5 думи → INFO; заглавие без текст на миниатюрата → INFO no-thumb-pair", () => {
  const wordy = lintPost({ platform: "youtube", text: "о", title: "Заглавие", thumbnailText: "едно две три четири пет шест" }, 0);
  assert.ok(wordy.some((x) => x.code === "thumb-too-wordy" && x.sev === "INFO"));
  const solo = lintPost({ platform: "youtube", text: "о", title: "Заглавие" }, 0);
  assert.ok(solo.some((x) => x.code === "no-thumb-pair" && x.sev === "INFO"));
  const ig = lintPost({ platform: "instagram", text: "пост" }, 0);
  assert.ok(!codes(ig).has("no-thumb-pair"), "само за платформи със заглавие");
});

test("YouTube описание над 5000 знака → HIGH too-long", () => {
  const f = lintPost({ platform: "youtube", text: "а".repeat(5001), title: "З", thumbnailText: "М" }, 0);
  assert.ok(f.some((x) => x.code === "too-long" && x.sev === "HIGH"));
});
