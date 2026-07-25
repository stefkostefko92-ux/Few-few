// Одиторски дневник — всяко мутиращо действие се записва в JSONL (append-only).
// Никакви тайни/пароли в записите. Ротация по размер (2 поколения).
import fs from 'node:fs';
import path from 'node:path';

const MAX_BYTES = 5 * 1024 * 1024;

export class Audit {
  constructor(stateDir) {
    this.file = path.join(stateDir, 'audit.jsonl');
  }

  log(event) {
    const entry = { ts: new Date().toISOString(), ...event };
    try {
      try {
        if (fs.statSync(this.file).size > MAX_BYTES) {
          fs.renameSync(this.file, this.file + '.1');
        }
      } catch {
        /* няма файл още */
      }
      fs.appendFileSync(this.file, JSON.stringify(entry) + '\n', { mode: 0o600 });
    } catch {
      // Одитът никога не чупи действието — но липсата му се вижда в tail().
    }
    return entry;
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
