// Отменени сесии, които ПРЕЖИВЯВАТ рестарт.
//
// Токенът е самостоятелен (HMAC): изтриването на бисквитката не го обезсилва, а
// сървърът няма как да „забрави" подписа си. Затова изходът и поименната отмяна
// вписват `jti` в черен списък. Докато този списък живееше само в паметта,
// защитата беше илюзорна в най-важния момент: рестарт на услугата (деплой,
// ъпдейт, срив) изчистваше списъка и **откраднат токен, който вече си отменил,
// проработваше отново** до абсолютния си таван — до 12 часа.
//
// Записите се пазят до `exp` на самия токен и се изрязват при всяко зареждане и
// запис: черен списък, който расте вечно, е втори проблем.
import fs from 'node:fs';
import path from 'node:path';

const FILE = 'revoked.json';
const MAX_ENTRIES = 5000; // таван срещу разбягване; при удар се пази най-новото

export class RevokedSessions {
  constructor(stateDir) {
    this.file = path.join(stateDir, FILE);
    this.map = new Map(); // jti → изтича в (ms)
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const now = Date.now();
      for (const [jti, exp] of Object.entries(raw || {})) {
        if (Number(exp) > now) this.map.set(jti, Number(exp));
      }
    } catch {
      /* първо пускане или повреден файл — по-добре празен списък, отколкото срив */
    }
  }

  save() {
    try {
      fs.writeFileSync(this.file, JSON.stringify(Object.fromEntries(this.map)), { mode: 0o600 });
    } catch {
      /* дискът не бива да чупи изхода от системата */
    }
  }

  // `expMs` е изтичането на САМИЯ токен: след него подписът и без това е мъртъв,
  // значи няма смисъл да го помним по-дълго.
  add(jti, expMs) {
    if (!jti) return;
    this.map.set(jti, Number(expMs) || Date.now() + 24 * 3600000);
    this.prune();
    this.save();
  }

  has(jti) {
    if (!jti) return false;
    const exp = this.map.get(jti);
    if (!exp) return false;
    if (exp <= Date.now()) {
      this.map.delete(jti);
      return false;
    }
    return true;
  }

  clear() {
    this.map.clear();
    this.save();
  }

  prune() {
    const now = Date.now();
    for (const [jti, exp] of this.map) if (exp <= now) this.map.delete(jti);
    if (this.map.size > MAX_ENTRIES) {
      const oldest = [...this.map.entries()].sort((a, b) => a[1] - b[1]).slice(0, this.map.size - MAX_ENTRIES);
      for (const [jti] of oldest) this.map.delete(jti);
    }
  }

  get size() {
    return this.map.size;
  }
}
