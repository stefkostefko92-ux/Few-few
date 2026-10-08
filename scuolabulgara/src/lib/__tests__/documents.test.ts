import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import path from "path";
import { isSharedKey, safeFile, SECTION_KEYS } from "../cms";
import { isPdf } from "../audio";
import { defaultFor } from "../defaults";

const pub = (url: string) => path.join(process.cwd(), "public", url);
type Row = Record<string, unknown>;
const list = (key: string, l: "it" | "bg" | "en", field: string) => (defaultFor(key, l)[field] as Row[]) ?? [];

describe("PDF документи", () => {
  it("приема само истински PDF по байтовете, не по името", () => {
    expect(isPdf(new TextEncoder().encode("%PDF-1.7\n%âãÏÓ"))).toBe(true);
    expect(isPdf(new TextEncoder().encode("\n\n%PDF-1.4 ..."))).toBe(true);
    expect(isPdf(new TextEncoder().encode("<html><script>alert(1)</script>"))).toBe(false);
    expect(isPdf(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(false);
  });

  it("safeFile: качен или вграден PDF, или https връзка — нищо друго", () => {
    expect(safeFile("/uploads/vestnik-1-ab12.pdf")).toBe("/uploads/vestnik-1-ab12.pdf");
    expect(safeFile("/assets/docs/statuto-qui-bulgaria.pdf")).toBe("/assets/docs/statuto-qui-bulgaria.pdf");
    expect(safeFile("https://www.scuolabulgaramilano.it/a.pdf")).toBe("https://www.scuolabulgaramilano.it/a.pdf");
    for (const bad of ["javascript:alert(1)", "/uploads/../.env", "//evil.example/x.pdf", "/uploads/x.html", "/etc/passwd", "http://x/y.pdf", 42, null]) {
      expect(safeFile(bad)).toBe("");
    }
  });

  it("файлът е общ за трите езика", () => {
    expect(isSharedKey("file")).toBe(true);
    expect(isSharedKey("coverImage")).toBe(true);
    expect(isSharedKey("photo")).toBe(true);
  });
});

describe("новите секции", () => {
  it("учителите и документите са в подредбата на страницата", () => {
    expect(SECTION_KEYS).toContain("teachers");
    expect(SECTION_KEYS).toContain("documents");
  });

  it("учителите: еднакъв брой и еднакви снимки на трите езика; снимките съществуват", () => {
    const it_ = list("teachers", "it", "items"), bg = list("teachers", "bg", "items"), en = list("teachers", "en", "items");
    expect(it_.length).toBe(14);
    expect(bg.length).toBe(it_.length);
    expect(en.length).toBe(it_.length);
    it_.forEach((t, i) => {
      expect(bg[i].photo).toBe(t.photo);
      expect(en[i].photo).toBe(t.photo);
      expect(existsSync(pub(t.photo as string))).toBe(true);
      expect(String(bg[i].fullName)).toMatch(/[А-я]/); // на кирилица на българската страница
      expect(String(t.fullName)).not.toMatch(/[А-я]/);
    });
  });

  it("документите и броевете: еднакви файлове на трите езика; вградените файлове съществуват", () => {
    for (const field of ["items", "issues"]) {
      const it_ = list("documents", "it", field), bg = list("documents", "bg", field), en = list("documents", "en", field);
      expect(bg.length).toBe(it_.length);
      expect(en.length).toBe(it_.length);
      it_.forEach((d, i) => {
        expect(safeFile(d.file)).toBe(d.file);
        expect(bg[i].file).toBe(d.file);
        expect(en[i].file).toBe(d.file);
        if (String(d.file).startsWith("/")) expect(existsSync(pub(d.file as string))).toBe(true);
        if (d.coverImage) expect(existsSync(pub(d.coverImage as string))).toBe(true);
      });
    }
  });

  it("преподавателят по танци има снимка и биография на трите езика", () => {
    for (const l of ["it", "bg", "en"] as const) {
      const d = defaultFor("dance", l);
      expect(existsSync(pub(d.instructorPhoto as string))).toBe(true);
      expect(String(d.instructorBio).split(/\n\s*\n/).length).toBe(2);
      expect(String(d.story).length).toBeGreaterThan(200);
    }
  });
});
