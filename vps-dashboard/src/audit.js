// Одиторски дневник — всяко мутиращо действие се записва в JSONL (append-only).
// Никакви тайни/пароли в записите. Ротация по размер (2 поколения).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MAX_BYTES = 5 * 1024 * 1024;

export function hashLine(line) {
  return crypto.createHash('sha256').update(line).digest('base64url').slice(0, 22);
}

export class Audit {
  constructor(stateDir) {
    this.file = path.join(stateDir, 'audit.jsonl');
    this.prevHash = this.loadLastHash();
    this.writeFailures = 0;
    this.onWriteFailure = null; // сървърът закача аларма — провалът да е шумен
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
        if (fs.statSync(this.file).size > MAX_BYTES) {
          fs.renameSync(this.file, this.file + '.1');
        }
      } catch {
        /* няма файл още */
      }
      fs.appendFileSync(this.file, line + '\n', { mode: 0o600 });
      this.prevHash = hashLine(line);
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
  acceptMirror(nodeId, entries) {
    if (!/^[\w-]{1,40}$/.test(String(nodeId || ''))) {
      throw Object.assign(new Error('Невалиден възел'), { status: 400 });
    }
    const file = path.join(path.dirname(this.file), `audit-mirror-${nodeId}.jsonl`);
    const lines = (entries || []).map((e) => JSON.stringify(e)).join('\n');
    if (!lines) return { accepted: 0 };
    fs.appendFileSync(file, lines + '\n', { mode: 0o600 });
    return { accepted: entries.length, file };
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

  // Проверка на веригата: връща първия ред, който не съвпада.
  verify() {
    let lines = [];
    try {
      lines = fs.readFileSync(this.file, 'utf8').split('\n').filter(Boolean);
    } catch {
      return { ok: true, checked: 0, note: 'няма дневник' };
    }
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
    return { ok: true, checked: lines.length, writeFailures: this.writeFailures };
  }

  tail(limit = 200) {
    let lines = [];
    for (const f of [this.file + '.1', this.file]) {
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
