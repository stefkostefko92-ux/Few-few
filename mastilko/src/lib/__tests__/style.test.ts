import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  contrastRatio,
  contrastGrade,
  accentTextOn,
  qrSafeColor,
  StyleSchemaShape,
} from "@/lib/style";

test("контраст: черно/бяло е 21:1, еднакви цветове са 1:1", () => {
  assert.equal(Math.round(contrastRatio("#000000", "#ffffff")!), 21);
  assert.equal(Math.round(contrastRatio("#3A2E28", "#3A2E28")!), 1);
});

test("контраст: невалиден цвят → null (не хвърля)", () => {
  assert.equal(contrastRatio("не-цвят", "#ffffff"), null);
});

test("оценка: границите са 7 (AAA), 4.5 (AA) и 3 (едър текст)", () => {
  assert.equal(contrastGrade(21).ok, true);
  assert.equal(contrastGrade(7).label, "AAA");
  assert.equal(contrastGrade(4.5).label, "AA");
  // Между 3 и 4.5 минава само за ЕДЪР текст — затова още е `ok`.
  assert.equal(contrastGrade(4.49).label, "AA (едър текст)");
  assert.equal(contrastGrade(2.99).ok, false, "под 3:1 е слаб");
});

test("акцентен текст: слаб акцент пада на основния цвят (AA за дребен текст)", () => {
  // Теракота: акцентът върху бледия фон е 3.31:1 → трябва да върне fg.
  assert.equal(accentTextOn("#c25e3f", "#f7dfd3", "#3A2E28"), "#3A2E28");
  // Достатъчно тъмен акцент се запазва.
  assert.equal(accentTextOn("#000000", "#ffffff", "#333333"), "#000000");
});

test("QR: светъл акцент пада на тъмно (четимост на скенера)", () => {
  assert.equal(qrSafeColor("#f7dfd3"), "#1B1B1B");
  assert.equal(qrSafeColor("#1745 6A".replace(" ", "")), "#17456A");
});

test("схема: bgImage приема САМО качено изображение (data:image/…)", () => {
  const S = z.object({ bgImage: StyleSchemaShape.bgImage });
  assert.equal(S.safeParse({ bgImage: "" }).success, true);
  assert.equal(S.safeParse({ bgImage: "data:image/webp;base64,AAAA" }).success, true);
  // Точно това вкарваше втори, външен url() в CSS-а през споделен линк.
  assert.equal(S.safeParse({ bgImage: 'x"), url("https://evil.example/t.png' }).success, false);
  assert.equal(S.safeParse({ bgImage: "https://evil.example/t.png" }).success, false);
});
