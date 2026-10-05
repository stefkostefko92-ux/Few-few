import { describe, it, expect } from "vitest";
import { finalKeywords, isImageKey, isSharedKey, mergeSection, safeHref, safeImage } from "../cms";

describe("mergeSection — схемата идва от подразбирането", () => {
  const def = { title: "Заглавие", image: "/a.webp", items: [{ q: "?" }], count: "3" };

  it("нови полета се появяват автоматично при стар запис", () => {
    expect(mergeSection(def, { title: "Мое" })).toEqual({ ...def, title: "Мое" });
  });

  it("изоставени ключове (старите плочки на галерията) отпадат", () => {
    const out = mergeSection(def, { title: "x", tiles: [{ kind: "green" }] });
    expect(out).not.toHaveProperty("tiles");
  });

  it("стойност от грешен вид не стига до страницата", () => {
    expect(mergeSection(def, { items: "не е списък" }).items).toEqual(def.items);
    expect(mergeSection(def, { title: ["масив"] }).title).toBe("Заглавие");
  });

  it("изтрита снимка се връща към подразбиращата се, а не оставя дупка", () => {
    expect(mergeSection(def, { image: "" }).image).toBe("/a.webp");
  });

  it("изтрит текст остава изтрит — това е намерение на редактора", () => {
    expect(mergeSection(def, { title: "" }).title).toBe("");
  });

  it("повреден запис (не обект) дава подразбирането", () => {
    expect(mergeSection(def, null)).toEqual(def);
    expect(mergeSection(def, [1, 2])).toEqual(def);
    expect(mergeSection(def, "текст")).toEqual(def);
  });
});

describe("isImageKey / isSharedKey", () => {
  it("описанието на снимка е ТЕКСТ, не снимка (иначе редакторът го прави на бутон)", () => {
    expect(isImageKey("imageAlt")).toBe(false);
    expect(isSharedKey("imageAlt")).toBe(false);
  });

  it("снимки, лого и споделящата снимка са снимки и са общи", () => {
    for (const k of ["image", "src", "logo", "shareImage", "photo"]) {
      expect(isImageKey(k), k).toBe(true);
      expect(isSharedKey(k), k).toBe(true);
    }
  });

  it("икона, телефон и числа са общи за трите езика; текстът — не", () => {
    for (const k of ["icon", "phone", "phoneHref", "email", "num", "latitude"]) expect(isSharedKey(k), k).toBe(true);
    for (const k of ["title", "caption", "q", "a", "lead"]) expect(isSharedKey(k), k).toBe(false);
  });
});

describe("safeImage — само снимки от самия сайт", () => {
  it("локален път минава", () => {
    expect(safeImage("/uploads/a.webp", "/d.webp")).toBe("/uploads/a.webp");
  });

  it("външен адрес се отказва (би дал IP-то на посетителите на трета страна)", () => {
    expect(safeImage("https://tracker.example/p.gif", "/d.webp")).toBe("/d.webp");
    expect(safeImage("//tracker.example/p.gif", "/d.webp")).toBe("/d.webp");
  });

  it("опит за излизане от папката и опасни схеми се отказват", () => {
    expect(safeImage("/uploads/../../etc/passwd", "/d.webp")).toBe("/d.webp");
    expect(safeImage("javascript:alert(1)", "/d.webp")).toBe("/d.webp");
    expect(safeImage("data:image/svg+xml,<svg/>", "/d.webp")).toBe("/d.webp");
  });

  it("не-низ дава резервната стойност", () => {
    expect(safeImage(undefined, "/d.webp")).toBe("/d.webp");
    expect(safeImage(42, "/d.webp")).toBe("/d.webp");
  });
});

describe("safeHref — само http(s) връзки", () => {
  it("https минава", () => {
    expect(safeHref("https://www.facebook.com/x")).toBe("https://www.facebook.com/x");
  });

  it("javascript: се неутрализира (би се изпълнил при клик)", () => {
    expect(safeHref("javascript:alert(document.cookie)")).toBe("#");
    expect(safeHref("  JavaScript:alert(1)")).toBe("#");
  });

  it("празно и не-низ дават резервната стойност", () => {
    expect(safeHref("", "")).toBe("");
    expect(safeHref(null)).toBe("#");
  });
});

describe("finalKeywords — правилото на репото е наложено", () => {
  const fallback = ["a", "b", "c", "d"];

  it("„Carbon Stealth“ се добавя, ако редакторът го е махнал", () => {
    const out = finalKeywords(["x", "y", "z", "w", "v"], fallback);
    expect(out).toContain("Carbon Stealth");
  });

  it("списъкът никога не пада под 5", () => {
    expect(finalKeywords(["само една"], fallback).length).toBeGreaterThanOrEqual(5);
    expect(finalKeywords([], fallback).length).toBeGreaterThanOrEqual(5);
  });

  it("без дубликати (без значение от регистъра) и без празни", () => {
    const out = finalKeywords(["Scuola", "scuola", " ", "Carbon Stealth", "carbon stealth"], fallback);
    expect(out.filter((k) => k.toLowerCase() === "scuola")).toHaveLength(1);
    expect(out.filter((k) => k.toLowerCase() === "carbon stealth")).toHaveLength(1);
    expect(out).not.toContain(" ");
  });

  it("редът на редактора се пази", () => {
    expect(finalKeywords(["първа", "втора", "Carbon Stealth", "x", "y"], fallback).slice(0, 2)).toEqual(["първа", "втора"]);
  });
});

describe("описания на снимките — един източник", async () => {
  const { BUNDLED_MEDIA, altKeyFor, bundledAlt } = await import("../cms");

  it("всяка вградена снимка има описание на трите езика", () => {
    for (const m of BUNDLED_MEDIA) for (const l of ["it", "bg", "en"] as const) expect(m.alt[l].length, `${m.url} ${l}`).toBeGreaterThan(0);
  });

  it("качена (непозната) снимка няма вградено описание — трябва да се напише", () => {
    expect(bundledAlt("/uploads/moia-snimka.webp")).toBeUndefined();
  });

  it("полето за описание съответства на полето за снимка", () => {
    expect(altKeyFor("image")).toBe("imageAlt");
    expect(altKeyFor("src")).toBe("alt");
    expect(altKeyFor("logo")).toBeUndefined();
  });
});

describe("mergeSection — елементи в списък, записани преди ново поле", () => {
  const def = { features: [{ icon: "hybrid", title: "Идентичност", text: "…" }] };

  it("старият елемент получава новото поле (иконата) от шаблона", () => {
    const out = mergeSection(def, { features: [{ title: "Мое", text: "Текст" }, { title: "Второ", text: "Т2" }] });
    expect(out.features).toEqual([
      { icon: "hybrid", title: "Мое", text: "Текст" },
      { icon: "hybrid", title: "Второ", text: "Т2" },
    ]);
  });

  it("липсващ текст остава празен — никога чужд текст от шаблона", () => {
    const out = mergeSection(def, { features: [{ icon: "kids" }] }) as { features: { title: string; icon: string }[] };
    expect(out.features[0]).toEqual({ icon: "kids", title: "", text: "" });
  });

  it("незапълнена снимка в нов елемент остава празна (не става дубликат на шаблона)", () => {
    const g = { photos: [{ src: "/a.webp", caption: "x" }] };
    expect(mergeSection(g, { photos: [{ src: "", caption: "" }] }).photos).toEqual([{ src: "", caption: "" }]);
  });

  it("повреден елемент се заменя с шаблона, броят се пази", () => {
    expect((mergeSection(def, { features: [null, "x"] }).features as unknown[]).length).toBe(2);
  });
});
