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
        // Стъпката на 2FA не е „изтича в" — филтърът по време би я изхвърлил.
        if (jti === '__totpStep') { if (Number.isFinite(Number(exp))) this.map.set(jti, Number(exp)); continue; }
        if (Number(exp) > now) this.map.set(jti, Number(exp));
      }
    } catch {
      /* първо пускане или повреден файл — по-добре празен списък, отколкото срив */
    }
  }

  // Провалът на записа НЕ бива да е тих.
  //
  // Дискът наистина не бива да чупи изхода от системата — затова грешката се
  // гълта. Но само гълтането прави отмяната ЛЪЖА: списъкът остава в паметта,
  // изглежда, че сесията е убита, и при първия рестарт откраднатият токен
  // ОЖИВЯВА. Одитът вече прави правилното (брои провалите и вика аларма); тук
  // липсваше, а контролът е по-критичен: там губиш следа, тук губиш достъп.
  save() {
    try {
      fs.writeFileSync(this.file, JSON.stringify(Object.fromEntries(this.map)), { mode: 0o600 });
      this.lastSaveError = null;
    } catch (err) {
      this.saveFailures = (this.saveFailures || 0) + 1;
      this.lastSaveError = err.message;
      try {
        this.onSaveFailure?.(err);
      } catch {
        /* аларма не бива да хвърля */
      }
    }
  }

  // Последната ПРИЕТА 2FA стъпка живее в същия файл: това е „попечителско"
  // състояние като отменените сесии — и двете отговарят на въпроса „валиден ли
  // е още този жетон/код" и двете трябва да преживеят рестарт. Пази се под
  // отделен ключ, за да не се бърка с jti.
  getTotpStep() {
    const v = this.map.get('__totpStep');
    return Number.isFinite(v) ? v : undefined;
  }

  setTotpStep(step) {
    if (!Number.isFinite(step)) return;
    // Не минава през `add()`: там стойността е „изтича в" и се подрязва по време.
    this.map.set('__totpStep', step);
    this.save();
  }

  // Състояние за алармата: „наистина ли са отменени тези сесии".
  health() {
    return {
      revoked: this.map.size - (this.map.has('__totpStep') ? 1 : 0),
      saveFailures: this.saveFailures || 0,
      lastSaveError: this.lastSaveError || null,
    };
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
    if (!jti || jti === '__totpStep') return false;
    const exp = this.map.get(jti);
    if (!exp) return false;
    if (exp <= Date.now()) {
      this.map.delete(jti);
      return false;
    }
    return true;
  }

  clear() {
    // „Изход от всички устройства" НЕ бива да нулира защитата от повторен 2FA
    // код — тя е за друг въпрос и живее тук само заради общия файл.
    const step = this.map.get('__totpStep');
    this.map.clear();
    if (Number.isFinite(step)) this.map.set('__totpStep', step);
    this.save();
  }

  prune() {
    const now = Date.now();
    for (const [jti, exp] of this.map) if (jti !== '__totpStep' && exp <= now) this.map.delete(jti);
    if (this.map.size > MAX_ENTRIES) {
      // Стъпката е малко число и би излязла „най-стара" — изключва се от изхвърлянето.
      const oldest = [...this.map.entries()].filter(([k]) => k !== '__totpStep').sort((a, b) => a[1] - b[1]).slice(0, this.map.size - MAX_ENTRIES);
      for (const [jti] of oldest) this.map.delete(jti);
    }
  }

  get size() {
    return this.map.size;
  }
}
