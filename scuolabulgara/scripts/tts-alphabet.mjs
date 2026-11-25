// Генерира произношението на 30-те думи от „Азбуката“ с женския невронен глас
// на Microsoft Azure „Калина“ (bg-BG-KalinaNeural) и ги закача към буквите.
//
// Пуска се веднъж на сървъра, в контейнера (ключът е само в .env, mode 600):
//   docker compose exec web node scripts/tts-alphabet.mjs            # само буквите без звук
//   docker compose exec web node scripts/tts-alphabet.mjs --force    # всички наново
//   docker compose exec web node scripts/tts-alphabet.mjs --only=Й,Я # само тези
//
// Нужни: AZURE_SPEECH_KEY, AZURE_SPEECH_REGION (напр. westeurope). Безплатното
// ниво F0 (500 000 знака/месец) стига многократно — 30-те думи са ~200 знака.
import { PrismaClient } from "@prisma/client";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

const KEY = process.env.AZURE_SPEECH_KEY || "";
const REGION = process.env.AZURE_SPEECH_REGION || "";
const VOICE = process.env.AZURE_SPEECH_VOICE || "bg-BG-KalinaNeural";
// Само за тестове: друг адрес вместо истинската услуга.
const URL = process.env.AZURE_TTS_URL || `https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;
const UPLOADS = process.env.UPLOADS_DIR || path.join(process.cwd(), "data", "uploads");

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = (args.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);

if (!KEY || (!REGION && !process.env.AZURE_TTS_URL)) {
  console.error("Липсва AZURE_SPEECH_KEY или AZURE_SPEECH_REGION в .env — виж DEPLOY.md, раздел „Произношение“.");
  process.exit(1);
}

const xml = (s) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]);
const ssml = (word) =>
  `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="bg-BG">` +
  `<voice name="${VOICE}"><prosody rate="-10%">${xml(word)}</prosody></voice></speak>`;

async function speak(word) {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": KEY,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
      "User-Agent": "qui-bulgaria-alphabet",
    },
    body: ssml(word),
    signal: AbortSignal.timeout(20000),
  });
  // Никога не печатаме ключа — само кода на отговора.
  if (!res.ok) throw new Error(`Azure върна ${res.status}${res.status === 401 ? " (грешен ключ или регион)" : ""}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const isMp3 = (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
  if (!isMp3 || buf.length < 500) throw new Error("отговорът не е MP3");
  return buf;
}

const slug = (latin) => (latin || "x").toLowerCase().replace(/[^a-z0-9]+/g, "") || "x";

const prisma = new PrismaClient();
try {
  const row = await prisma.content.findUnique({ where: { key: "alphabet" } });
  if (!row) throw new Error("Секцията „Азбуката“ още я няма в базата — отворете сайта веднъж и пуснете отново.");
  const doc = { it: JSON.parse(row.it), bg: JSON.parse(row.bg), en: JSON.parse(row.en) };
  const letters = doc.it.letters || [];
  await fs.mkdir(UPLOADS, { recursive: true });

  let made = 0;
  for (let i = 0; i < letters.length; i++) {
    const { letter, latin, word, audio } = letters[i];
    if (!word) continue;
    if (only.length && !only.includes(String(letter).toUpperCase())) continue;
    if (audio && !force && !only.length) continue;
    process.stdout.write(`${letter} — ${word} … `);
    const buf = await speak(word);
    const filename = `alphabet-${slug(latin)}-${crypto.randomBytes(4).toString("hex")}.mp3`;
    await fs.writeFile(path.join(UPLOADS, filename), buf);
    const url = `/uploads/${filename}`;
    await prisma.media.create({ data: { filename, url, mime: "audio/mpeg", size: buf.length, alt: `${letter} — ${word}` } });
    // Звукът е общ за трите езика.
    for (const l of ["it", "bg", "en"]) if (doc[l].letters?.[i]) doc[l].letters[i].audio = url;
    made++;
    console.log("готово");
  }
  if (made) {
    await prisma.content.update({
      where: { key: "alphabet" },
      data: { it: JSON.stringify(doc.it), bg: JSON.stringify(doc.bg), en: JSON.stringify(doc.en) },
    });
  }
  console.log(made ? `✓ ${made} ${made === 1 ? "дума е озвучена" : "думи са озвучени"}. Отворете сайта → „Азбуката“ и ги чуйте.` : "Няма какво да се прави — всички букви вече имат звук (--force за наново).");
} catch (e) {
  console.error("✗", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
