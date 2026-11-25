// music.mjs — музиката на клипа: оригинална ръченица (7/16 = 2+2+3) за малък народен
// състав, написана тук нота по нота. В нея няма чужд запис, затова Rights Manager на
// Facebook няма с какво да я сравни и да я заглуши.
//
//   node promo/music.mjs [изход.wav]
//
// MIDI → FluidSynth с FluidR3_GM (MIT, пакет fluid-soundfont-gm) → ffmpeg (лека
// компресия, малка зала, −14 LUFS като другите видеа в лентата).
// Ред: бавно начало (дрон на гайдата + кавал, 4 такта) → А (гайда) → А (+ кавал,
// акордеон) → Б (кларинет, хиджаз) → А (всички) → три удара и дълъг завършек.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const TL = JSON.parse(readFileSync(join(HERE, "timeline.json"), "utf8"));
const OUT = join(HERE, "..", "dist", "promo");
mkdirSync(OUT, { recursive: true });
const WAV = process.argv[2] || join(OUT, "music.wav");
const SF = ["/usr/share/sounds/sf2/FluidR3_GM.sf2", "/usr/share/soundfonts/FluidR3_GM.sf2"].find(existsSync);
if (!SF) throw new Error("няма FluidR3_GM.sf2 — apt install fluidsynth fluid-soundfont-gm");

const P = TL.pulse, BAR = 7 * P, T0 = TL.introBars * BAR; // първият такт на хорото
const barAt = (n) => T0 + (n - 1) * BAR; // такт 1…

// ---- MIDI ------------------------------------------------------------------
// 120 bpm, 480 тика на четвъртина → 960 тика в секунда: времената са в секунди.
const SEC = 960, ev = [];
const tk = (s) => Math.max(0, Math.round(s * SEC));
// SOLO=<канал> — само този канал (за проверка на баланса по спектъра)
const SOLO = process.env.SOLO === undefined ? -1 : Number(process.env.SOLO);
const push = (s, order, bytes) => { if (SOLO < 0 || (bytes[0] & 15) === SOLO) ev.push({ t: tk(s), order, bytes }); };
const program = (ch, p) => push(0, 0, [0xc0 | ch, p]);
const cc = (ch, n, v, s = 0) => push(s, 1, [0xb0 | ch, n, Math.max(0, Math.min(127, Math.round(v)))]);
const bend = (ch, v, s) => { const x = Math.max(0, Math.min(16383, Math.round(8192 + v))); push(s, 1, [0xe0 | ch, x & 127, x >> 7]); };
const note = (ch, key, s, d, vel) => {
  push(s, 3, [0x90 | ch, key, Math.max(1, Math.min(127, Math.round(vel)))]);
  push(s + Math.max(0.02, d), 2, [0x80 | ch, key, 0]);
};

// детерминиран „човешки“ шум: всяко рендиране звучи еднакво
const h = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
let seed = 1;
const jit = (ms) => (h(seed++) - 0.5) * 2 * ms / 1000;
const vj = (v, r = 8) => v + (h(seed++) - 0.5) * 2 * r;

// ---- инструменти (General MIDI, броене от 0) --------------------------------
const GAIDA = 0, DRONE = 1, KAVAL = 2, CLAR = 3, ACC = 4, BASS = 5, DR = 9;
program(GAIDA, 109); program(DRONE, 109); program(KAVAL, 77); program(CLAR, 71); program(ACC, 21); program(BASS, 21);
for (const [ch, vol, pan, rev] of [[GAIDA, 96, 58, 38], [DRONE, 72, 64, 50], [KAVAL, 88, 80, 70], [CLAR, 92, 46, 48], [ACC, 94, 76, 40], [BASS, 104, 60, 30], [DR, 112, 64, 34]]) {
  cc(ch, 7, vol); cc(ch, 10, pan); cc(ch, 91, rev); cc(ch, 93, 0); cc(ch, 11, 127);
}

// ---- лад и мелодии ---------------------------------------------------------
const N = { D4: 62, Eb4: 63, E4: 64, "F#4": 66, G4: 67, A4: 69, Bb4: 70, B4: 71, C5: 72, D5: 74, Eb5: 75, E5: 76, "F#5": 78, G5: 79, A5: 81 };
const MIXO = [0, 2, 4, 5, 7, 9, 10], HIJAZ = [0, 1, 4, 5, 7, 8, 10]; // от ре
const upper = (k, mode) => { for (let x = k + 1; x < k + 4; x++) if (mode.includes((x - 62 + 120) % 12)) return x; return k + 2; };
// [нота, импулси] — всеки такт е 7 импулса (2+2+3)
const m = (s) => s.trim().split(/\s+/).map((w) => { const [n, d] = w.split(":"); return [N[n], Number(d)]; });
const A = [
  "A4:1 B4:1 A4:1 G4:1 F#4:3", "G4:1 A4:1 B4:1 C5:1 A4:3", "D5:2 C5:1 B4:1 A4:1 B4:1 A4:1", "G4:1 F#4:1 E4:1 F#4:1 G4:3",
  "A4:1 B4:1 A4:1 G4:1 F#4:3", "G4:1 A4:1 B4:1 C5:1 D5:3", "E5:1 D5:1 C5:1 B4:1 A4:1 G4:1 F#4:1", "E4:1 F#4:1 G4:1 E4:1 D4:3",
].map(m);
const B = [
  "D5:1 D5:1 Eb5:1 D5:1 C5:3", "Bb4:1 C5:1 D5:1 C5:1 Bb4:1 A4:2", "G4:1 A4:1 Bb4:1 A4:1 G4:1 F#4:2", "G4:1 Bb4:1 A4:1 G4:1 F#4:1 Eb4:1 D4:1",
  "D5:1 D5:1 Eb5:1 D5:1 C5:3", "Bb4:1 C5:1 D5:1 Eb5:1 F#5:3", "G5:1 F#5:1 Eb5:1 D5:1 C5:1 Bb4:1 A4:1", "G4:1 F#4:1 Eb4:1 F#4:1 D4:3",
].map(m);
for (const bar of [...A, ...B]) if (bar.reduce((a, [, d]) => a + d, 0) !== 7) throw new Error("тактът не е 7 импулса: " + JSON.stringify(bar));

// акорди: [бас, квинта, тризвучие]
const CH = {
  D: [50, 45, [57, 62, 66]], C: [48, 43, [55, 60, 64]], G: [43, 50, [55, 59, 62]],
  Gm: [43, 50, [55, 58, 62]], Cm: [48, 43, [55, 60, 63]],
};
const HARM_A = ["D", "C", "D", "G", "D", "G", "C", "D"], HARM_B = ["D", "Gm", "Gm", "D", "Cm", "D", "Cm", "D"];

/** Мелодия на гайда: легато, с форшлаг отгоре на всяко ударно време, където нотата се сменя. */
function gaida(ch, phrase, firstBar, mode, vel, { grace = true, oct = 0 } = {}) {
  const notes = [];
  phrase.forEach((bar, b) => {
    let p = 0;
    for (const [k, d] of bar) {
      notes.push({ k: k + oct, s: barAt(firstBar + b) + p * P + jit(6), d: d * P, beat: p === 0 || p === 2 || p === 4 });
      p += d;
    }
  });
  notes.forEach((n, i) => { n.g = grace && n.beat && i > 0 && notes[i - 1].k !== n.k; });
  notes.forEach((n, i) => {
    const next = notes[i + 1];
    // легато: нотата свършва точно преди следващата (или преди нейния форшлаг)
    const end = next ? next.s - (next.g ? 0.045 : 0.012) : n.s + n.d - 0.012;
    if (n.g) note(ch, upper(n.k, mode), n.s - 0.04, 0.034, vel - 10);
    note(ch, n.k, n.s, Math.max(0.05, end - n.s), vj(vel + (n.beat ? 6 : 0), 5));
  });
}

/** Кларинет: плъзгане отдолу в дългите ноти и морденти, характерни за сватбарския стил. */
function clarinet(phrase, firstBar, mode, vel) {
  phrase.forEach((bar, b) => {
    let p = 0;
    for (const [k, d] of bar) {
      const s = barAt(firstBar + b) + p * P + jit(5), len = d * P - 0.015;
      if (d >= 3) {
        // мордент: нота — горна съседна — нота, после държи
        note(CLAR, k, s, 0.045, vj(vel));
        note(CLAR, upper(k, mode), s + 0.045, 0.04, vj(vel - 8));
        note(CLAR, k, s + 0.085, len - 0.085, vj(vel));
      } else if (d === 2) {
        bend(CLAR, -1400, s); bend(CLAR, -700, s + 0.025); bend(CLAR, 0, s + 0.06);
        note(CLAR, k, s, len, vj(vel + 4));
      } else note(CLAR, k, s, len, vj(vel + (p % 2 === 0 ? 5 : 0)));
      p += d;
    }
  });
}

/** Кавал: дъх и леко вибрато на дългите ноти. */
function kavalLong(k, s, d, vel) {
  note(KAVAL, k, s, d, vel);
  if (d > 0.45) for (let t = s + 0.3; t < s + d; t += 0.02) bend(KAVAL, Math.sin((t - s - 0.3) * 2 * Math.PI * 5.3) * 520 * Math.min(1, (t - s - 0.3) / 0.4), t);
  bend(KAVAL, 0, s + d);
}

/** Акордеонът — бас на 1 и 3, акорд на 2 и в дългото време. */
function accordion(harm, firstBar, { chords = true, vel = 74 } = {}) {
  harm.forEach((name, b) => {
    const [root, fifth, triad] = CH[name], s = barAt(firstBar + b);
    note(BASS, root, s + jit(4), 1.6 * P, vj(vel + 12));
    note(BASS, fifth, s + 4 * P + jit(4), 0.9 * P, vj(vel + 6));
    if (!chords) return;
    for (const [p, d, v] of [[2, 1.2, 0], [5, 0.9, -4], [6, 0.8, -8]]) {
      const t = s + p * P + jit(4);
      for (const k of triad) note(ACC, k, t, d * P, vj(vel + v, 4));
    }
  });
}

/** Тъпанът: „бум“ (дълбок бас + нисък том) и „пръчка“ (side stick), 2+2+3. */
const BOOM = (s, v) => { note(DR, 35, s, 0.2, v); note(DR, 41, s, 0.2, v - 18); };
const STICK = (s, v) => note(DR, 37, s, 0.08, v);
function tapan(firstBar, n, { light = false, fills = true } = {}) {
  for (let b = 0; b < n; b++) {
    const s = barAt(firstBar + b), fill = fills && b === n - 1;
    BOOM(s + jit(3), vj(112, 4));
    if (!light) STICK(s + P + jit(3), vj(58, 8));
    STICK(s + 2 * P + jit(3), vj(92, 6));
    if (!light) STICK(s + 3 * P + jit(3), vj(56, 8));
    BOOM(s + 4 * P + jit(3), vj(100, 4));
    if (fill) { BOOM(s + 5 * P, 96); BOOM(s + 6 * P, 108); STICK(s + 6.5 * P, 86); }
    else { STICK(s + 5 * P + jit(3), vj(86, 6)); STICK(s + 6 * P + jit(3), vj(70, 8)); }
  }
}

// ---- партитурата ----------------------------------------------------------
// бавно начало: дронът се надига, кавалът пее свободно
note(DRONE, 50, 0.05, barAt(33) + 2.9, 70);
for (let t = 0; t <= 1.6; t += 0.05) cc(DRONE, 11, 20 + 107 * Math.min(1, t / 1.6), t);
kavalLong(N.A4, 0.3, 1.1, 86);
note(KAVAL, N.B4, 1.44, 0.11, 72); note(KAVAL, N.A4, 1.56, 0.11, 72); note(KAVAL, N.G4, 1.68, 0.14, 76);
kavalLong(N["F#4"], 1.84, 0.58, 84);
note(KAVAL, N.E4, 2.44, 0.24, 78);
kavalLong(N.D4, 2.7, 0.74, 86);
// тъпанът влиза: пръчката подкарва
for (const [i, v] of [[0, 50], [1, 64], [2, 80]]) STICK(T0 - (3 - i) * P, v);

// А — гайда, само бас
gaida(GAIDA, A, 1, MIXO, 96);
accordion(HARM_A, 1, { chords: false, vel: 70 });
tapan(1, 8, { light: true });
// А — гайда + кавал в унисон, пълен акордеон
gaida(GAIDA, A, 9, MIXO, 98);
gaida(KAVAL, A, 9, MIXO, 70, { grace: false });
accordion(HARM_A, 9);
tapan(9, 8);
// Б — кларинет в хиджаз, гайдата си почива (дронът остава)
clarinet(B, 17, HIJAZ, 98);
accordion(HARM_B, 17, { vel: 78 });
tapan(17, 8);
// А — всички
gaida(GAIDA, A, 25, MIXO, 100);
clarinet(A, 25, MIXO, 84);
gaida(KAVAL, A, 25, MIXO, 62, { grace: false });
accordion(HARM_A, 25, { vel: 80 });
tapan(25, 8);
// завършек: три удара (1, 2, 3-то време) и дълъг ре мажор
const END = barAt(33);
for (const [p, last] of [[0, false], [2, false], [4, true]]) {
  const s = END + p * P, d = last ? 2.4 : 0.2;
  BOOM(s, last ? 120 : 110);
  note(GAIDA, N.D5, s, d, 104); note(CLAR, N.D5, s, d, 92); note(KAVAL, N.D4, s, d, 70);
  note(BASS, 38, s, d, 96);
  for (const k of CH.D[2]) note(ACC, k, s, d, 82);
}

// ---- запис на MIDI ----------------------------------------------------------
ev.sort((a, b) => a.t - b.t || a.order - b.order);
const vlq = (n) => { const out = [n & 127]; while ((n >>= 7)) out.unshift((n & 127) | 128); return out; };
const track = [0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20]; // 500000 µs на четвъртина
let last = 0;
for (const e of ev) { track.push(...vlq(e.t - last), ...e.bytes); last = e.t; }
track.push(0, 0xff, 0x2f, 0);
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const mid = Buffer.from([0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, 0, 0, 1, 0x01, 0xe0, 0x4d, 0x54, 0x72, 0x6b, ...u32(track.length), ...track]);
const MID = join(OUT, "music.mid"), RAW = join(OUT, "music-raw.wav");
writeFileSync(MID, mid);

// ---- звук -------------------------------------------------------------------
execFileSync("fluidsynth", ["-ni", "-q", "-g", "0.55", "-r", "48000", "-o", "synth.reverb.room-size=0.55", "-o", "synth.reverb.damp=0.35",
  "-o", "synth.reverb.width=0.8", "-o", "synth.reverb.level=0.7", "-F", RAW, SF, MID], { stdio: "inherit" });
const fadeAt = TL.duration - 1.6;
const ff = process.env.FFMPEG || "ffmpeg";
const chain = [
  "highpass=f=35", "equalizer=f=320:t=q:w=1.1:g=-2", "equalizer=f=3200:t=q:w=1.4:g=1.5",
  "acompressor=threshold=-20dB:ratio=2.2:attack=12:release=180:makeup=2",
  `apad=whole_dur=${TL.duration}`, `atrim=0:${TL.duration}`, `afade=t=out:st=${fadeAt}:d=1.6`,
].join(",");
// −14 LUFS на две минавания: линейно, за да остане тихото начало тихо
const probe = spawnSync(ff, ["-hide_banner", "-i", RAW, "-af", `${chain},loudnorm=${TL.loudnorm}:print_format=json`, "-f", "null", "-"], { encoding: "utf8" });
const json = probe.stderr.slice(probe.stderr.lastIndexOf("{"), probe.stderr.lastIndexOf("}") + 1);
const me = JSON.parse(json);
const ln = `loudnorm=${TL.loudnorm}:linear=true:measured_I=${me.input_i}:measured_TP=${me.input_tp}:measured_LRA=${me.input_lra}:measured_thresh=${me.input_thresh}:offset=${me.target_offset}`;
execFileSync(ff, ["-y", "-loglevel", "error", "-i", RAW, "-af", `${chain},${ln},aresample=48000`, "-ar", "48000", "-ac", "2", WAV], { stdio: "inherit" });
console.log("→", WAV);
