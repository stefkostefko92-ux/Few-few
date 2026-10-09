import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  contrastRatio,
  contrastGrade,
  accentTextOn,
  readableAccent,
  textOnSolid,
  qrSafeColor,
  StyleSchemaShape,
} from "@/lib/style";
import { THEMES } from "@/lib/themes";

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

test("четим акцент: достатъчният акцент се връща НЕПИПНАТ", () => {
  // Вече минава 4.5:1 → никаква намеса (иначе бихме потъмнявали без нужда).
  assert.equal(readableAccent("#000000", "#ffffff"), "#000000");
});

test("четим акцент: медено жълто върху кремаво се затъмнява до AA, но остава злато", () => {
  // Точно двойката от грамотата и поканата: #DE9A32 на #F9EBCF = 2.03:1.
  const out = readableAccent("#DE9A32", "#F9EBCF");
  const ratio = contrastRatio(out, "#F9EBCF")!;
  assert.ok(ratio >= 4.5, `очаква ≥4.5:1, получено ${ratio.toFixed(2)}`);
  // Не е паднало на кафявото на текста — тонът е запазен: R > G > B, както
  // при златото, и синьото остава най-слабият канал.
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(out.slice(i, i + 2), 16));
  assert.ok(r! > g! && g! > b!, `тонът се загуби: ${out}`);
});

test("четим акцент: върху ТЪМЕН фон изсветлява, вместо да затъмнява", () => {
  // Тъмносиньо върху почти черно — 1.72:1, тоест наистина има нужда от намеса.
  const out = readableAccent("#1F3F55", "#06131F");
  assert.ok(contrastRatio(out, "#06131F")! >= 4.5);
  // Изсветляване значи по-висока яркост от изходния цвят.
  assert.ok(relLuminanceOf(out) > relLuminanceOf("#1F3F55"), `не изсветли: ${out}`);
});

test("четим акцент: невалиден цвят се връща както е (не хвърля)", () => {
  assert.equal(readableAccent("не-цвят", "#ffffff"), "не-цвят");
  assert.equal(readableAccent("#DE9A32", "не-цвят"), "#DE9A32");
});

test("текст върху плоскост: средно тъмна плоскост ВСЕ ПАК стига до AA", () => {
  // Регресията, която задачата иска: ваучерът. Бледото розово върху теракота
  // е 3.15:1, а кафявото на текста — 3.10:1, тоест „по-добрият от двата“ пак
  // пада под AA. Помощникът трябва да бутне избрания, докато мине.
  // Освен това бледото ИЗГЛЕЖДА по-добрият кандидат (3.15 > 3.10), но таванът
  // му е чисто бяло = 4.23:1 и пак не стига — затова посоката се избира по
  // достижимия таван, а не по подадените цветове.
  const out = textOnSolid("#C25E3F", "#F4D9CC", "#3A2E28");
  const ratio = contrastRatio(out, "#C25E3F")!;
  assert.ok(ratio >= 4.5, `очаква ≥4.5:1 върху теракота, получено ${ratio.toFixed(2)} (${out})`);
  // Тъмната посока е с по-висок таван → резултатът е по-тъмен от подадения fg.
  assert.ok(relLuminanceOf(out) <= relLuminanceOf("#3A2E28"), `сбъркана посока: ${out}`);
});

test("текст върху плоскост: върху тъмна плоскост печели и се доизсветлява светлото", () => {
  // Бяло върху почти черно вече минава → връща се непипнато.
  assert.equal(textOnSolid("#1B1B1B", "#FFFFFF", "#3A2E28"), "#FFFFFF");
  // Синята лента на баджа: бледото е по-добрата посока, но 3.56:1 не стига.
  const out = textOnSolid("#5B7E99", "#E3EBF0", "#3A2E28");
  assert.ok(contrastRatio(out, "#5B7E99")! >= 4.5, `лентата на баджа остава под AA: ${out}`);
});

test("текст върху плоскост: при равни печели ТЪМНИЯТ (сигурно на печат)", () => {
  // Един и същ цвят подаден два пъти → еднакви съотношения → тъмният клон.
  // #CCCCCC на #808080 е 2.06:1, тоест ще бъде и доизтъмнен до AA.
  const out = textOnSolid("#808080", "#CCCCCC", "#CCCCCC");
  assert.ok(relLuminanceOf(out) < relLuminanceOf("#CCCCCC"), `не пое тъмния клон: ${out}`);
  assert.ok(contrastRatio(out, "#808080")! >= 4.5);
});

test("текст върху плоскост: невалиден цвят не хвърля и пак дава четимо", () => {
  // Каквото и да липсва, изходът трябва да е валиден hex и да минава AA.
  for (const pair of [["не-цвят", "#3A2E28"], ["#FFFFFF", "не-цвят"], ["", ""]] as const) {
    const out = textOnSolid("#C25E3F", pair[0], pair[1]);
    assert.match(out, /^#[0-9a-fA-F]{6}$/, `не е hex: ${out}`);
    assert.ok(contrastRatio(out, "#C25E3F")! >= 4.5, `под AA: ${out}`);
  }
  // Невалиден ФОН не може да се прецени → връща подадения тъмен цвят.
  assert.equal(textOnSolid("не-цвят", "#FFFFFF", "#3A2E28"), "#3A2E28");
});

test("всичките 6 топли теми: и двата помощника дават AA", () => {
  // Смисълът да са ИЗЧИСЛИМИ, а не твърдо зададени цветове: потребителят може
  // да избере всяка тема през ThemePicker, а axe сканирането хваща само
  // заредената по подразбиране. Тук минаваме през целия списък.
  for (const t of THEMES) {
    const ink = readableAccent(t.accent, t.bg);
    const inkRatio = contrastRatio(ink, t.bg)!;
    assert.ok(inkRatio >= 4.5, `тема „${t.name}“: акцентен текст ${inkRatio.toFixed(2)}:1 (${ink})`);

    const on = textOnSolid(t.accent, t.bg, t.fg);
    const onRatio = contrastRatio(on, t.accent)!;
    assert.ok(onRatio >= 4.5, `тема „${t.name}“: текст върху акцента ${onRatio.toFixed(2)}:1 (${on})`);
  }
});

/** Малка обвивка — тестът чете яркост, за да провери посоката на корекцията. */
function relLuminanceOf(hex: string): number {
  // Косвено през contrastRatio спрямо черно: расте монотонно с яркостта.
  return contrastRatio(hex, "#000000")!;
}

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
  // Правилният префикс вече НЕ стига: `"` след него излизаше от url("…").
  assert.equal(
    S.safeParse({ bgImage: 'data:image/png;base64,AA"), url("https://evil.example/p.png' }).success,
    false,
  );
  assert.equal(S.safeParse({ bgImage: "data:image/svg+xml;base64,PHN2Zz4=" }).success, false, "SVG може да носи скрипт");
  assert.equal(S.safeParse({ bgImage: "data:image/png;base64,iVBORw0KGgo=" }).success, true);
  assert.equal(S.safeParse({ bgImage: "data:image/jpeg;base64,/9j/4AAQ" }).success, true);
});
