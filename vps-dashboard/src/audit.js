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
