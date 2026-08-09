// Одиторски дневник — всяко мутиращо действие се записва в JSONL (append-only).
// Никакви тайни/пароли в записите. Ротация по размер (4 поколения: текущ + 3).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { plural } from './text.js';

// Прагът за ротация се чете ПРИ ВСЕКИ ЗАПИС, не веднъж при зареждане: иначе
// тестът няма как да задейства истинска ротация, без да пише 5 MB — а ротация,
// която не е ПУСКАНА в проверка, е точно мястото, където се крият дефекти
// (доказано: първата версия губеше най-старото поколение при всяко завъртане).
const maxBytes = () => Number(process.env.CSD_AUDIT_MAX_BYTES) || 5 * 1024 * 1024;
// Колко завъртени файла се пазят. Беше ЕДИН: `rename(file, file + '.1')`
// презаписваше предишния `.1`, тоест при всяка ротация най-старите следи
// ИЗЧЕЗВАХА — без ред някъде, че се е случило. За дневник, чиято обявена цел е
// „разследването след инцидента", тихата загуба на история е дефект, не таван.
// Истинската трайност пак е копието на другия VPS (`audit-ship.js`); тук просто
// хоризонтът е три пъти по-дълъг и се КАЗВА докъде стига.
const KEEP_ROTATED = 3;
// Тавани за ЧУЖДИЯ одит (виж acceptMirror): съседът може да е компрометиран.
const MIRROR_MAX_ENTRIES = 1000;
const MIRROR_MAX_LINE = 8 * 1024;
const MIRROR_MAX_BYTES = 20 * 1024 * 1024;

export function hashLine(line) {
  return crypto.createHash('sha256').update(line).digest('base64url').slice(0, 22);
}

export class Audit {
  constructor(stateDir) {
    this.file = path.join(stateDir, 'audit.jsonl');
    // Котва на веригата: брой записи + хеш на последния, в ОТДЕЛЕН файл.
    // Без нея отрязването на последните редове е НЕВИДИМО — веригата остава
    // вътрешно последователна и проверката казва „наред". А точно отрязването е
    // класическият ход: махаш редовете със своите действия и си тръгваш чист.
    this.headFile = path.join(stateDir, 'audit.head.json');
    this.prevHash = this.loadLastHash();
    this.count = this.loadCount();
    this.writeFailures = 0;
    this.onWriteFailure = null; // сървърът закача аларма — провалът да е шумен
  }

  loadCount() {
    try {
      return fs.readFileSync(this.file, 'utf8').split('\n').filter(Boolean).length;
    } catch {
      return 0;
    }
  }

  readHead() {
    try {
      return JSON.parse(fs.readFileSync(this.headFile, 'utf8'));
    } catch {
      return null;
    }
  }

  writeHead() {
    try {
      const tmp = `${this.headFile}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ count: this.count, lastHash: this.prevHash, at: new Date().toISOString() }), { mode: 0o600 });
      fs.renameSync(tmp, this.headFile);
    } catch {
      /* котвата е допълнение, не бива да чупи одита */
    }
  }

  // Хеш-верига: всеки ред носи хеша на предишния. Изтрит или подменен ред къса
  // веригата и /api/audit/verify го посочва. Root пак може да пренапише целия
  // файл — затова веригата е за ОТКРИВАНЕ, а истинската защита е копие извън
  // машината (federation към другия VPS).
  loadLastHash() {
    try {
      const lines = fs.readFileSync(this.file, 'utf8').trim().split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        if (!lines[i]) continue;
        return hashLine(lines[i]);
      }
    } catch {
      /* първо пускане */
    }
    return 'GENESIS';
  }

  log(event) {
    const entry = { ts: new Date().toISOString(), ...event, prev: this.prevHash };
    const line = JSON.stringify(entry);
    try {
      try {
        if (fs.statSync(this.file).size > maxBytes()) {
          // Изместване назад: .2 → .3, .1 → .2, текущият → .1. Най-старият пада,
          // но чак след `KEEP_ROTATED` ротации, не при първата.
          for (let i = KEEP_ROTATED - 1; i >= 1; i--) {
            try {
              fs.renameSync(`${this.file}.${i}`, `${this.file}.${i + 1}`);
            } catch {
              /* този етаж още го няма */
            }
          }
          fs.renameSync(this.file, this.file + '.1');
          // Ротацията е ЗАКОННО скъсване: новият файл започва от нула. Без
          // нулиране котвата щеше да гърми фалшиво след всяка ротация.
          // `prevHash` НЕ се нулира — веригата продължава през файловете.
          this.count = 0;
        }
      } catch {
        /* няма файл още */
      }
      fs.appendFileSync(this.file, line + '\n', { mode: 0o600 });
      this.prevHash = hashLine(line);
      this.count++;
      this.writeHead();
    } catch (err) {
      // Одитът никога не чупи действието, но мълчаливият провал прави дневника
      // безполезен точно когато трябва — затова се вика аларма.
      this.writeFailures++;
      try {
        this.onWriteFailure?.(err, entry);
      } catch {
        /* аларма не бива да хвърля */
      }
    }
    return entry;
  }

  // Записи след даден хеш — за изпращане към другия VPS (виж audit-ship.js).
  since(afterHash, limit = 500) {
    let lines = [];
    try {
      lines = fs.readFileSync(this.file, 'utf8').split('\n').filter(Boolean);
    } catch {
      return { entries: [], lastHash: 'GENESIS' };
    }
    let start = 0;
    if (afterHash && afterHash !== 'GENESIS') {
      const idx = lines.findIndex((l) => hashLine(l) === afterHash);
      if (idx >= 0) start = idx + 1;
    }
    const slice = lines.slice(start, start + limit);
    return {
      entries: slice.map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return { corrupt: true };
        }
      }),
      lastHash: slice.length ? hashLine(slice[slice.length - 1]) : afterHash || 'GENESIS',
      remaining: Math.max(0, lines.length - start - slice.length),
    };
  }

  // Приема копие от друг възел. Пази се ОТДЕЛНО — не се смесва с нашия дневник,
  // за да не може чужд възел да замърси собствената ни верига.
  // Огледалото приема данни от ДРУГА машина — тоест от нещо, което може да е
  // компрометирано. Затова има тавани: без тях съсед с валиден токен пълни диска
  // ни (което вдига нашата аларма „одитът не се записва") и залива копието с
  // измислени редове, руширайки точно гаранцията, заради която огледалото
  // съществува. Ротацията пази последното поколение, както при собствения одит.
  acceptMirror(nodeId, entries) {
    if (!/^[\w-]{1,40}$/.test(String(nodeId || ''))) {
      throw Object.assign(new Error('Невалиден възел'), { status: 400 });
    }
    if (!Array.isArray(entries)) throw Object.assign(new Error('entries трябва да е списък'), { status: 400 });
    if (entries.length > MIRROR_MAX_ENTRIES) {
      throw Object.assign(new Error(`Най-много ${plural(MIRROR_MAX_ENTRIES, 'запис', 'записа')} на заявка`), { status: 400 });
    }
    const file = path.join(path.dirname(this.file), `audit-mirror-${nodeId}.jsonl`);
    // Всеки запис е обект с таван по размер — низ от 400 KB не е одитен ред.
    const kept = [];
    for (const e of entries) {
      if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
      const line = JSON.stringify(e);
      if (line.length > MIRROR_MAX_LINE) continue;
      kept.push(line);
    }
    if (!kept.length) return { accepted: 0, rejected: entries.length };
    try {
      if (fs.statSync(file).size > MIRROR_MAX_BYTES) fs.renameSync(file, `${file}.1`);
    } catch {
      /* още няма файл */
    }
    fs.appendFileSync(file, kept.join('\n') + '\n', { mode: 0o600 });
    return { accepted: kept.length, rejected: entries.length - kept.length, file };
  }

  mirrors() {
    const dir = path.dirname(this.file);
    try {
      return fs
        .readdirSync(dir)
        .filter((f) => f.startsWith('audit-mirror-'))
        .map((f) => {
          const st = fs.statSync(path.join(dir, f));
          return { node: f.replace(/^audit-mirror-|\.jsonl$/g, ''), sizeBytes: st.size, mtime: st.mtime.toISOString() };
        });
    } catch {
      return [];
    }
  }

  // Файловете на дневника в хронологичен ред: най-старият завъртян → текущият.
  // Веригата минава ПРЕЗ тях (`prevHash` не се нулира при ротация), значи всяко
  // четене, което гледа само текущия файл, вижда парче.
  files() {
    const out = [];
    for (let i = KEEP_ROTATED; i >= 1; i--) {
      const f = `${this.file}.${i}`;
      if (fs.existsSync(f)) out.push(f);
    }
    out.push(this.file);
    return out;
  }

  // Проверка на веригата: връща първия ред, който не съвпада.
  verify() {
    // Чете се ЦЯЛАТА верига, не само текущият файл. Преди това ротацията
    // превръщаше проверката в успокояваща лъжа: веднага след завъртане тя
    // връщаше „ok, проверени 1" — тоест зелено, при непроверени сто хиляди
    // записа. Точно обратното на целта на едно доказателство за цялост.
    let lines = [];
    let currentLines = [];
    const parts = this.files();
    for (const f of parts) {
      let chunk = [];
      try {
        chunk = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean);
      } catch {
        continue;
      }
      if (f === this.file) currentLines = chunk;
      lines = lines.concat(chunk);
    }
    if (!lines.length) return { ok: true, checked: 0, note: 'няма дневник' };
    let prev = null;
    for (let i = 0; i < lines.length; i++) {
      let rec;
      try {
        rec = JSON.parse(lines[i]);
      } catch {
        return { ok: false, checked: i, brokenAt: i + 1, reason: 'нечетим ред' };
      }
      if (prev !== null && rec.prev !== prev) {
        return { ok: false, checked: i, brokenAt: i + 1, reason: 'скъсана верига (липсващ или подменен ред)', entry: rec };
      }
      prev = hashLine(lines[i]);
    }
    // Веригата е вътрешно последователна — но това НЕ значи, че е цяла.
    // Котвата сверява края: липсващи редове накрая иначе са невидими.
    const head = this.readHead();
    if (head) {
      // Котвата помни броя в ТЕКУЩИЯ файл — тя се нулира при ротация. Сравнена с
      // общия брой през всички файлове, тя би гърмяла фалшиво след всяко
      // завъртане.
      if (currentLines.length < head.count) {
        return {
          ok: false,
          checked: lines.length,
          truncated: true,
          expected: head.count,
          missing: head.count - currentLines.length,
          reason: `отрязани ${plural(head.count - currentLines.length, 'запис', 'записа')} от края (котвата помни ${head.count})`,
          writeFailures: this.writeFailures,
        };
      }
      const lastHash = currentLines.length ? hashLine(currentLines[currentLines.length - 1]) : 'GENESIS';
      if (currentLines.length === head.count && lastHash !== head.lastHash) {
        return {
          ok: false,
          checked: lines.length,
          brokenAt: lines.length,
          reason: 'подменен ПОСЛЕДЕН запис (веригата не го покрива — котвата да)',
          writeFailures: this.writeFailures,
        };
      }
    }
    // Хоризонтът се КАЗВА: „веригата е цяла" без „докъде" приспива — човек мисли,
    // че има следи от началото на времето, а има последните няколко мегабайта.
    let oldest = null;
    try {
      oldest = JSON.parse(lines[0])?.ts || null;
    } catch {
      /* първият ред е нечетим — вече е докладвано по-горе */
    }
    return {
      ok: true,
      checked: lines.length,
      files: parts.length,
      rotated: parts.length - 1,
      oldest,
      anchored: Boolean(head),
      writeFailures: this.writeFailures,
    };
  }

  tail(limit = 200) {
    let lines = [];
    for (const f of this.files()) {
      try {
        lines = lines.concat(fs.readFileSync(f, 'utf8').split('\n').filter(Boolean));
      } catch {
        /* ок */
      }
    }
    return lines.slice(-limit).map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return { ts: null, action: 'corrupt', raw: l.slice(0, 200) };
      }
    });
  }
}
