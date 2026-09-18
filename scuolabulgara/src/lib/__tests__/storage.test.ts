import { describe, it, expect } from "vitest";
import { isAllowedImage, deleteUpload, readUpload } from "../storage";
import path from "path";
import { promises as fs } from "fs";
import os from "os";

// Поведение, не имплементация: какво минава/спира на входа за upload,
// и че изтриване/читане не могат да избягат от UPLOADS_DIR (path traversal).
describe("storage — валидация на тип и защита от path traversal", () => {
  it("приема само разрешените raster MIME типове", () => {
    expect(isAllowedImage("image/jpeg")).toBe(true);
    expect(isAllowedImage("image/png")).toBe(true);
    expect(isAllowedImage("image/webp")).toBe(true);
    expect(isAllowedImage("image/gif")).toBe(true);
  });

  it("отхвърля SVG (stored-XSS вектор) и всякакъв друг тип", () => {
    expect(isAllowedImage("image/svg+xml")).toBe(false);
    expect(isAllowedImage("application/pdf")).toBe(false);
    expect(isAllowedImage("")).toBe(false);
  });

  it("readUpload връща null за traversal опит извън uploads dir, не хвърля грешка", async () => {
    // "../../etc/passwd" -> path.basename маже directory частта, остава "passwd",
    // който не съществува в uploads dir -> трябва да върне null, не да прочете /etc/passwd.
    const result = await readUpload("../../../../etc/passwd");
    expect(result).toBeNull();
  });

  it("deleteUpload не трие файл извън UPLOADS_DIR дори с traversal път в името", async () => {
    // Подготвяме контролна жертва ИЗВЪН uploads dir и проверяваме, че оцелява.
    const victim = path.join(os.tmpdir(), `qb-canary-${Date.now()}.txt`);
    await fs.writeFile(victim, "canary");
    try {
      await deleteUpload(`../../../../../..${victim}`);
      await expect(fs.access(victim)).resolves.toBeUndefined(); // файлът е невредим
    } finally {
      await fs.rm(victim, { force: true });
    }
  });
});
