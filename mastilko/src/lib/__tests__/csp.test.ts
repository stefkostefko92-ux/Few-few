import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import path from "path";

// Качването на изображения (ImageUpload: снимки за документи, лога, CV снимка,
// своя снимка за фон) чете файла през URL.createObjectURL → `blob:` адрес. CSP
// без `blob:` в img-src блокираше КАЖДО качване в сайта — тихо, само с
// „Не успях да прочета изображението“.
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

test("CSP пуска blob: изображения, щом ImageUpload ги ползва", () => {
  const upload = read("src/components/ImageUpload.tsx");
  const config = read("next.config.mjs");
  const imgSrc = /img-src ([^;]+);/.exec(config)?.[1] ?? "";
  if (upload.includes("createObjectURL")) {
    assert.match(imgSrc, /\bblob:/, `img-src е „${imgSrc}“ — липсва blob:`);
  }
  // …и нищо външно не е отворено по погрешка.
  assert.doesNotMatch(imgSrc, /\*|https?:\s/, `img-src е твърде широк: „${imgSrc}“`);
});
