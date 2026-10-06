import { describe, it, expect } from "vitest";
import { addItem, blankClone, fieldOf, moveItem, removeItem, setValue, templatePath, type Data } from "../editor-ops";

const data = (): Data => ({
  it: { title: "Ciao", image: "/a.webp", photos: [{ src: "/1.webp", caption: "Uno" }, { src: "/2.webp", caption: "Due" }], keywords: ["a"] },
  bg: { title: "Здравей", image: "/a.webp", photos: [{ src: "/1.webp", caption: "Едно" }, { src: "/2.webp", caption: "Две" }], keywords: ["б"] },
  en: { title: "Hello", image: "/a.webp", photos: [{ src: "/1.webp", caption: "One" }, { src: "/2.webp", caption: "Two" }], keywords: ["c"] },
});

describe("setValue — текст за един език, снимка за трите", () => {
  it("текстът се сменя само в текущия език", () => {
    const d = setValue(data(), "bg", ["title"], "Ново");
    expect(d.bg.title).toBe("Ново");
    expect(d.it.title).toBe("Ciao");
    expect(d.en.title).toBe("Hello");
  });

  it("снимката се сменя наведнъж в трите езика (капанът от стария редактор)", () => {
    const d = setValue(data(), "it", ["image"], "/b.webp");
    expect([d.it.image, d.bg.image, d.en.image]).toEqual(["/b.webp", "/b.webp", "/b.webp"]);
  });

  it("снимка вътре в списък също е обща, а надписът ѝ — не", () => {
    let d = setValue(data(), "en", ["photos", 1, "src"], "/x.webp");
    d = setValue(d, "en", ["photos", 1, "caption"], "Changed");
    for (const l of ["it", "bg", "en"] as const) expect((d[l].photos as { src: string }[])[1].src).toBe("/x.webp");
    expect((d.it.photos as { caption: string }[])[1].caption).toBe("Due");
    expect((d.en.photos as { caption: string }[])[1].caption).toBe("Changed");
  });

  it("не мутира входа", () => {
    const before = data();
    const snapshot = JSON.stringify(before);
    setValue(before, "it", ["image"], "/z.webp");
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("индекс извън списъка в някой език не създава боклук", () => {
    const d = data();
    (d.bg.photos as unknown[]).pop();
    const out = setValue(d, "it", ["photos", 1, "src"], "/y.webp");
    expect((out.bg.photos as unknown[]).length).toBe(1);
  });
});

describe("структурата е обща — езиците не се разминават", () => {
  it("добавяне слага празен елемент във всеки език", () => {
    const d = addItem(data(), ["photos"], undefined);
    for (const l of ["it", "bg", "en"] as const) {
      const p = d[l].photos as { src: string; caption: string }[];
      expect(p).toHaveLength(3);
      expect(p[2]).toEqual({ src: "", caption: "" });
    }
  });

  it("изпразнен навсякъде списък се допълва по шаблона от подразбирането", () => {
    let d = data();
    d = removeItem(d, ["photos"], 0);
    d = removeItem(d, ["photos"], 0);
    d = addItem(d, ["photos"], { src: "/t.webp", caption: "Шаблон", alt: "Описание" });
    expect(d.it.photos).toEqual([{ src: "", caption: "", alt: "" }]);
  });

  it("премахване маха един и същ елемент от трите езика", () => {
    const d = removeItem(data(), ["photos"], 0);
    expect((d.bg.photos as { caption: string }[]).map((p) => p.caption)).toEqual(["Две"]);
    expect((d.en.photos as { caption: string }[]).map((p) => p.caption)).toEqual(["Two"]);
  });

  it("местене размества във всеки език, без да смесва преводите", () => {
    const d = moveItem(data(), ["photos"], 1, -1);
    expect((d.it.photos as { caption: string }[]).map((p) => p.caption)).toEqual(["Due", "Uno"]);
    expect((d.bg.photos as { caption: string }[]).map((p) => p.caption)).toEqual(["Две", "Едно"]);
  });

  it("местене отвъд края не прави нищо", () => {
    const d = moveItem(data(), ["photos"], 0, -1);
    expect((d.it.photos as { caption: string }[])[0].caption).toBe("Uno");
  });

  it("низ в списък от низове се добавя като празен низ", () => {
    const d = addItem(data(), ["keywords"], undefined);
    expect(d.bg.keywords).toEqual(["б", ""]);
  });
});

describe("помощни", () => {
  it("fieldOf: за низ в списък полето е самият списък", () => {
    expect(fieldOf(["photos", 1, "src"])).toBe("src");
    expect(fieldOf(["keywords", 2])).toBe("keywords");
  });

  it("blankClone изпразва текстовете и списъците, пази формата", () => {
    expect(blankClone({ a: "x", b: ["y"], c: { d: "z" } })).toEqual({ a: "", b: [], c: { d: "" } });
  });

  it("templatePath прави всеки индекс 0", () => {
    expect(templatePath(["sections", 3, "p", 1])).toEqual(["sections", 0, "p", 0]);
  });
});

describe("setPerLocale — различна стойност за всеки език наведнъж", () => {
  it("записва трите описания на нова снимка", async () => {
    const { setPerLocale } = await import("../editor-ops");
    const d = setPerLocale(data(), ["photos", 0, "caption"], { it: "A", bg: "Б", en: "C" });
    expect([(d.it.photos as { caption: string }[])[0].caption, (d.bg.photos as { caption: string }[])[0].caption, (d.en.photos as { caption: string }[])[0].caption]).toEqual(["A", "Б", "C"]);
  });
});
