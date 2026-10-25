import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { sniffImage, stripImageMetadata, type ImageExt } from "@/lib/uploads-core";

// Качена от телефон снимка носи EXIF с GPS координатите (често — у дома),
// модела на телефона и часа. Публикува се само снимката без тях (GDPR).

/** Има ли в EXIF указател към GPS блока (таг 0x8825 в IFD0)? */
function hasGpsIfd(exif: Buffer | undefined): boolean {
  if (!exif) return false;
  // sharp връща блока с „Exif\0\0“ отпред; после идва TIFF заглавката.
  const t = exif.subarray(0, 6).toString("latin1") === "Exif\0\0" ? exif.subarray(6) : exif;
  const le = t.subarray(0, 2).toString("latin1") === "II";
  const u16 = (o: number) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o));
  const u32 = (o: number) => (le ? t.readUInt32LE(o) : t.readUInt32BE(o));
  const ifd0 = u32(4);
  const n = u16(ifd0);
  for (let i = 0; i < n; i++) if (u16(ifd0 + 2 + i * 12) === 0x8825) return true;
  return false;
}

// EXIF полетата са ASCII.
const PHONE = "TestPhone-X1-zbd";

/** Снимка 40×20 с GPS, модел на телефона и ориентация 6 (заснета изправена). */
async function phonePhoto(ext: ImageExt): Promise<Buffer> {
  const base = sharp({ create: { width: 40, height: 20, channels: 3, background: "#c81e1e" } });
  const fmt = ext === "jpg" ? base.jpeg() : ext === "png" ? base.png() : base.webp();
  return fmt
    .withMetadata({ orientation: 6 })
    .withExifMerge({
      IFD0: { Make: "Test", Model: PHONE },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "42/1 21/1 14/1", GPSLongitudeRef: "E", GPSLongitude: "23/1 0/1 3/1" },
    })
    .toBuffer();
}

for (const ext of ["jpg", "png", "webp"] as const) {
  test(`stripImageMetadata (${ext}): без GPS и модел на телефона, завъртяна по ориентацията`, async () => {
    const input = await phonePhoto(ext);
    const before = await sharp(input).metadata();
    assert.ok(hasGpsIfd(before.exif), "тестовата снимка трябва да носи GPS");
    assert.ok(input.includes(Buffer.from(PHONE)), "тестовата снимка трябва да носи модела");

    const out = await stripImageMetadata(input, ext);
    const after = await sharp(out).metadata();
    assert.equal(after.exif, undefined, "EXIF трябва да липсва изцяло");
    assert.equal(hasGpsIfd(after.exif), false);
    assert.equal(after.xmp, undefined);
    assert.equal(after.iptc, undefined);
    assert.ok(!out.includes(Buffer.from(PHONE)), "моделът на телефона остана във файла");
    // Ориентация 6 → пикселите са завъртени, флагът го няма.
    assert.equal(after.orientation, undefined);
    assert.deepEqual([after.width, after.height], [20, 40]);
    // Форматът се запазва.
    assert.equal(sniffImage(out), ext);
  });
}

test("stripImageMetadata (gif): остава GIF, с всички кадри", async () => {
  // Два кадъра 8×8 (светъл и тъмен) — анимацията не бива да се загуби.
  const raw = Buffer.alloc(8 * 16 * 3);
  raw.fill(200, 0, 8 * 8 * 3);
  raw.fill(30, 8 * 8 * 3);
  const gif = await sharp(raw, { raw: { width: 8, height: 16, channels: 3, pageHeight: 8 } })
    .gif({ delay: [100, 100] })
    .toBuffer();
  const out = await stripImageMetadata(gif, "gif");
  assert.equal(sniffImage(out), "gif");
  const m = await sharp(out, { animated: true }).metadata();
  assert.equal(m.pages, 2);
  assert.equal(m.pageHeight, 8);
});

test("stripImageMetadata: повреден файл → грешка (оригиналът не се записва)", async () => {
  const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);
  assert.equal(sniffImage(broken), "jpg");
  await assert.rejects(() => stripImageMetadata(broken, "jpg"));
});

test("sniffImage разпознава формата по съдържанието, не по името", () => {
  assert.equal(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xdb])), "jpg");
  assert.equal(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "png");
  assert.equal(sniffImage(Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "latin1")), "webp");
  assert.equal(sniffImage(Buffer.from("GIF89a", "latin1")), "gif");
  assert.equal(sniffImage(Buffer.from("<svg xmlns=", "latin1")), null);
  assert.equal(sniffImage(Buffer.alloc(0)), null);
});
