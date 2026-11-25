// Пренася PDF документите, които още сочат към стария сайт (броевете на
// „Училищен вестник“), в качените файлове на този сървър и обновява връзките
// в секцията „Документи и училищен вестник“ на трите езика.
//
// Пуска се веднъж на сървъра, в контейнера, след като сайтът е отворен поне
// веднъж (за да се създаде секцията в базата):
//   docker compose exec web node scripts/import-docs.mjs
// Повторно пускане е безопасно: вече пренесените файлове се пропускат.
import { PrismaClient } from "@prisma/client";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

const UPLOADS = process.env.UPLOADS_DIR || path.join(process.cwd(), "data", "uploads");
const MAX = 14 * 1024 * 1024;
const LOCALES = ["it", "bg", "en"];

const isPdf = (b) => {
  for (let i = 0; i < Math.min(16, b.length - 5); i++) if (b.subarray(i, i + 5).toString("latin1") === "%PDF-") return true;
  return false;
};
const slug = (url) => {
  const name = decodeURIComponent(url.split("/").pop() || "doc").replace(/\.pdf$/i, "");
  const latin = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 30);
  return latin ? `vestnik-${latin}` : "vestnik";
};

// Up to three tries: a large file over a slow line can be cut off once.
async function download(url) {
  for (let i = 1; ; i++) {
    try {
      return await fetchPdf(url);
    } catch (e) {
      if (i >= 3 || /над 14 MB|не е PDF|HTTP 4/.test(String(e))) throw e;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

async function fetchPdf(url) {
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(60000), headers: { "User-Agent": "qui-bulgaria-import" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX) throw new Error("над 14 MB");
  if (!isPdf(buf)) throw new Error("не е PDF");
  return buf;
}

const prisma = new PrismaClient();
try {
  const row = await prisma.content.findUnique({ where: { key: "documents" } });
  if (!row) throw new Error("Секцията „Документи“ още я няма в базата — отворете сайта веднъж и пуснете отново.");
  const doc = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(row[l] || "{}")]));
  const lists = (d) => [...(d.items || []), ...(d.issues || [])];

  const urls = new Set();
  for (const l of LOCALES) for (const it of lists(doc[l])) if (/^https?:\/\//i.test(it.file || "")) urls.add(it.file);
  if (!urls.size) {
    console.log("Няма какво да се пренася — всички документи вече са на този сървър.");
  } else {
    await fs.mkdir(UPLOADS, { recursive: true });
    const moved = new Map();
    for (const url of urls) {
      process.stdout.write(`${decodeURIComponent(url.split("/").pop())} … `);
      try {
        const buf = await download(url);
        const filename = `${slug(url)}-${crypto.randomBytes(4).toString("hex")}.pdf`;
        await fs.writeFile(path.join(UPLOADS, filename), buf);
        const local = `/uploads/${filename}`;
        await prisma.media.create({ data: { filename, url: local, mime: "application/pdf", size: buf.length, alt: "" } });
        moved.set(url, local);
        console.log(`готово (${(buf.length / 1048576).toFixed(1)} MB)`);
      } catch (e) {
        console.log(`пропуснат: ${e instanceof Error ? e.message : e}`);
      }
    }
    for (const l of LOCALES) for (const it of lists(doc[l])) if (moved.has(it.file)) it.file = moved.get(it.file);
    if (moved.size) {
      await prisma.content.update({
        where: { key: "documents" },
        data: Object.fromEntries(LOCALES.map((l) => [l, JSON.stringify(doc[l])])),
      });
    }
    console.log(`✓ ${moved.size} от ${urls.size} документа са пренесени на този сървър.`);
    if (moved.size < urls.size) process.exitCode = 1;
  }
} catch (e) {
  console.error("✗", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
