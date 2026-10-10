import { describe, it, expect } from "vitest";
import { fillUntranslated, isBlankItem } from "../cms";

describe("непреведени елементи", () => {
  it("празен елемент: без текст; снимката и иконата не се броят", () => {
    expect(isBlankItem({ q: "", a: "  " })).toBe(true);
    expect(isBlankItem({ src: "/x.webp", caption: "", alt: "" })).toBe(true);
    expect(isBlankItem({ icon: "kids", title: "", text: "", bullets: ["", ""] })).toBe(true);
    expect(isBlankItem({ q: "Dove?", a: "" })).toBe(false);
  });

  it("нов въпрос, написан само на италиански, се показва и на български", () => {
    const bg = { title: "Въпроси", items: [{ q: "Къде?", a: "В Милано." }, { q: "", a: "" }] };
    const it_ = { title: "Domande", items: [{ q: "Dove?", a: "A Milano." }, { q: "Nuova?", a: "Sì." }] };
    const en = { title: "FAQ", items: [{ q: "Where?", a: "In Milan." }, { q: "", a: "" }] };
    const out = fillUntranslated(bg, [it_, en]);
    expect(out.items).toEqual([{ q: "Къде?", a: "В Милано." }, { q: "Nuova?", a: "Sì." }]);
    expect(out.title).toBe("Въпроси"); // обикновените полета не се пипат
    expect(bg.items[1]).toEqual({ q: "", a: "" }); // без страничен ефект
  });

  it("преведеното остава; новата точка в преведен елемент взима текста си", () => {
    const it_ = { items: [{ icon: "kids", title: "Bambini", text: "Testo", bullets: ["Uno", ""] }] };
    const bg = { items: [{ icon: "kids", title: "Деца", text: "Текст", bullets: ["Едно", "Две"] }] };
    const out = fillUntranslated(it_, [bg]);
    expect(out.items).toEqual([{ icon: "kids", title: "Bambini", text: "Testo", bullets: ["Uno", "Две"] }]);
  });

  it("общите полета (снимка) остават от своя език; ако никъде няма текст — остава празно", () => {
    const it_ = { photos: [{ src: "/a.webp", caption: "", alt: "" }] };
    const bg = { photos: [{ src: "/a.webp", caption: "Празник", alt: "Деца на празник" }] };
    expect(fillUntranslated(it_, [bg]).photos).toEqual([{ src: "/a.webp", caption: "Празник", alt: "Деца на празник" }]);
    expect(fillUntranslated({ items: [{ q: "", a: "" }] }, [{ items: [{ q: "", a: "" }] }]).items).toEqual([{ q: "", a: "" }]);
  });
});
