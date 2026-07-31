// Бекъпът да СЕ ПРАВИ, не само да се следи.
//
// Дотук панелът имаше аларма за възрастта на бекъпа, планирана проба за
// възстановяване и бутон „Снимка на всички бази" — но НИЩО не пускаше снимката
// само. Тоест панелът вдигаше критична аларма за проблем, който сам можеше да
// реши, и чакаше човек да щракне. Това е най-безсмисленият вид тих провал: знаем,
// умеем, и пак не го правим.
//
// Второто, което се затваря тук, е **3-2-1**: всичко живееше на същия диск, на
// същата машина. Мъртъв диск взема и бекъпите; компрометиран root може да ги
// изтрие заедно с одита. Federation-ът вече носи механизма (peer + `peerToken`,
// прецедент `audit-ship.js`) — остава дъмповете да пътуват по същия път.
//
// Две решения, които не са очевидни:
//
//  1. **Изнасянето иска TLS, без изключение за частна мрежа.** Одитът е метаданни;
//     дъмпът е ЦЯЛАТА база — за medqr това са медицински данни по чл. 9 GDPR. По
//     „частната" мрежа на хостера това пак е чужда инфраструктура и открит текст.
//     Затова `http://` peer се ОТКАЗВА (освен loopback, за тест), вместо да работи
//     тихо и да изглежда еднакво успешно.
//  2. **Хешът се смята с втори прочит на файла.** Можеше да е един прочит с
//     потвърждаване на втора заявка, но тогава недовършеният трансфер оставя
//     състояние на приемника. Един лишен прочит от локален диск е по-евтин от
//     половин бекъп, който изглежда цял.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { DUMP_DIR } from './databases.js';

const STATE = 'backup-sched.json';
const HOUR_MS = 3600000;
const DAY_MS = 24 * HOUR_MS;

// Копията от другите възли живеят ОТДЕЛНО от собствените снимки: смесени в една
// папка, чуждият дъмп става „най-новият бекъп" на тази машина и гаси алармата за
// остарял СОБСТВЕН бекъп. Точно капанът, който вече хванахме с том-архивите.
//
// Папката се ИЗВЕЖДА от `stateDir`, не е закована: закованият път пише в живата
// `/var/lib/vps-dashboard` и от DEV режим, и от тестовете (видяно — тестови възли
// се появиха в таблицата на панела).
export function offsiteDir(stateDir) {
  return path.join(stateDir, 'offsite');
}

// Какво си струва да пътува: логически дъмпове и архиви на томове. Затворен
// списък, защото името влиза в път на приемника.
const SHIP_RX = /^[\w][\w.-]{0,160}\.(sqlite\.gz|sql\.gz|tar\.gz|tar\.gz\.enc)$/;

export function assertShipName(name) {
  const base = String(name || '');
  if (base.includes('/') || base.includes('\\') || base.includes('\0') || base.includes('..') || !SHIP_RX.test(base)) {
    throw Object.assign(new Error('Невалидно име на файл за изнасяне'), { status: 400 });
  }
  return base;
}

export function assertNodeId(id) {
  const s = String(id || '').trim();
  if (!/^[\w-]{1,64}$/.test(s)) {
    throw Object.assign(new Error('Невалиден идентификатор на възел'), { status: 400 });
  }
  return s;
}

// ── Графикът ─────────────────────────────────────────────────────────────────
export class BackupSchedule {
  constructor(stateDir) {
    this.stateDir = stateDir;
    this.offsite = offsiteDir(stateDir);
    this.file = path.join(stateDir, STATE);
    this.state = this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return { lastRunAt: null, lastOkAt: null, lastResult: null, history: [], shipped: {}, ...raw };
    } catch {
      return { lastRunAt: null, lastOkAt: null, lastResult: null, history: [], shipped: {} };
    }
  }

  save() {
    try {
      this.state.history = (this.state.history || []).slice(-30);
      fs.writeFileSync(this.file, JSON.stringify(this.state), { mode: 0o600 });
    } catch {
      /* дискът не бива да чупи графика */
    }
  }

  // Кога следва бекъп. Три решения вътре:
  //
  //  · **Часът е фиксиран** (`atHour`, по подразбиране 3), не „на всеки 24 часа от
  //    последния път" — иначе бекъпът пълзи през деня и някой ден пада точно
  //    върху пиков час или върху деплой.
  //  · **Първият бекъп ЧАКА нощния час.** Инсталацията не бива да пуска
  //    двучасова задача върху сървър, който човекът точно в момента вдига. За
  //    липсата на бекъп вече крещи `backup:missing` — има кой да каже.
  //  · **Изпуснатият час се ДОГОНВА.** Панел, спрян в 03:00 (деплой, рестарт),
  //    иначе чака цял ден; при два пропуска подред бекъп просто няма. Затова над
  //    двоен каданс се пуска независимо от часа.
  due(cfg, now = Date.now()) {
    if (!scheduleEnabled(cfg)) return false;
    const { everyHours, atHour } = scheduleOf(cfg);
    const isHour = new Date(now).getHours() === atHour;
    if (!this.state.lastRunAt) return isHour;
    const elapsedH = (now - new Date(this.state.lastRunAt).getTime()) / HOUR_MS;
    if (elapsedH < everyHours) return false;
    if (elapsedH >= everyHours * 2) return true;
    return isHour;
  }

  // Резултатът се пише при ПРИКЛЮЧВАНЕ на задачата, не при пускането ѝ — „последен
  // успешен бекъп" трябва да е факт, не намерение. (Същата поука като при пробата.)
  record({ ok, output, code, reason }) {
    const entry = {
      ts: new Date().toISOString(),
      ok: Boolean(ok),
      code: code ?? null,
      reason: reason || null,
      output: String(output || '').slice(-1500),
    };
    this.state.lastRunAt = entry.ts;
    this.state.lastResult = entry;
    if (ok) this.state.lastOkAt = entry.ts;
    this.state.history = [...(this.state.history || []), entry];
    this.save();
    return entry;
  }

  markShipped(peerId, name) {
    const key = assertNodeId(peerId);
    const list = new Set(this.state.shipped?.[key]?.names || []);
    list.add(assertShipName(name));
    // Списъкът се подрязва до реално съществуващите файлове — иначе расте вечно
    // и след чистенето на стари снимки пази имена, които никой няма да види пак.
    const alive = new Set(listShippable().map((f) => f.name));
    this.state.shipped = {
      ...this.state.shipped,
      [key]: { names: [...list].filter((n) => alive.has(n)), lastAt: new Date().toISOString() },
    };
    this.save();
  }

  wasShipped(peerId, name) {
    return Boolean(this.state.shipped?.[peerId]?.names?.includes(name));
  }

  status(cfg) {
    const { everyHours, atHour } = scheduleOf(cfg);
    return {
      enabled: scheduleEnabled(cfg),
      everyHours,
      atHour,
      lastRunAt: this.state.lastRunAt,
      lastOkAt: this.state.lastOkAt,
      lastResult: this.state.lastResult,
      history: (this.state.history || []).slice(-10).reverse(),
      due: this.due(cfg),
      offsite: {
        enabled: Boolean(cfg?.backups?.offsite?.enabled),
        peers: (cfg?.peers || []).map((p) => ({
          id: p.id,
          tls: isTlsPeer(p),
          shipped: this.state.shipped?.[p.id]?.names?.length || 0,
          lastAt: this.state.shipped?.[p.id]?.lastAt || null,
        })),
        received: receivedOffsite(this.offsite),
      },
    };
  }
}

function scheduleEnabled(cfg) {
  return cfg?.backups?.schedule?.enabled !== false;
}

// Без `Number()` върху стойността от конфига. `Number(null)` е 0, тоест
// `"atHour": null` (какъвто ред пише всеки инструмент за „непопълнено") тихо
// местеше бекъпа на ПОЛУНОЩ вместо да падне на подразбирането — валидна, но
// различна стойност, което е по-лошо от очевидна грешка. Тук се иска истинско
// число; браузърът минава през валидацията на маршрута преди запис.
function scheduleOf(cfg) {
  const s = cfg?.backups?.schedule || {};
  const everyHours =
    Number.isFinite(s.everyHours) && s.everyHours >= 1 ? Math.min(24 * 30, Math.floor(s.everyHours)) : 24;
  const atHour = Number.isInteger(s.atHour) && s.atHour >= 0 && s.atHour <= 23 ? s.atHour : 3;
  return { everyHours, atHour };
}

// ── Алармите на самия график ─────────────────────────────────────────────────
// „Кой пази пазача" важи и тук: включен график, който не се е пускал, е точно
// толкова опасен като изключен — само по-успокояващ на вид.
export function scheduleChecks(cfg, store, now = Date.now()) {
  const out = [];
  if (!store) return out;
  const { everyHours } = scheduleOf(cfg);

  if (!scheduleEnabled(cfg)) {
    out.push({
      key: 'backup:sched-off',
      severity: 'info',
      title: 'Бекъпът е само ръчен',
      body: 'Графикът е изключен — снимката става само когато човек щракне. Включи го от секция „Бекъпи": панелът вече умее всичко нужно, липсва само каданс.',
      sustain: false,
      repeatEvery: 7 * DAY_MS,
    });
    return out;
  }

  const last = store.state.lastResult;
  if (last && !last.ok) {
    out.push({
      key: 'backup:sched-failed',
      severity: 'critical',
      title: 'Планираният бекъп се провали',
      body: `Пускането на ${last.ts} излезе с код ${last.code ?? '?'}. Файл може да има, но не е доказано, че е цял.\n${String(last.output || '').slice(-400)}`,
      sustain: false,
      repeatEvery: DAY_MS,
    });
  }

  if (store.state.lastRunAt) {
    const h = (now - new Date(store.state.lastRunAt).getTime()) / HOUR_MS;
    if (h > everyHours * 3) {
      out.push({
        key: 'backup:sched-stale',
        severity: 'warning',
        title: `Графикът е включен, но не е пускан от ${Math.round(h)} часа`,
        body: `Каданс ${everyHours} часа. Или задачата не тръгва (виж „Задачи"), или панелът е бил спрян в часа на бекъпа. Включен график, който не се пуска, е по-опасен от изключен — изглежда като покритие.`,
        sustain: false,
        repeatEvery: DAY_MS,
      });
    }
  }
  return out;
}

// ── Изнасяне навън (3-2-1) ───────────────────────────────────────────────────
export function listShippable() {
  try {
    return fs
      .readdirSync(DUMP_DIR)
      .filter((n) => SHIP_RX.test(n))
      .map((name) => {
        const st = fs.statSync(path.join(DUMP_DIR, name));
        return { name, sizeBytes: st.size, mtime: st.mtime.toISOString() };
      })
      .sort((a, b) => b.mtime.localeCompare(a.mtime));
  } catch {
    return [];
  }
}

export function isTlsPeer(peer) {
  try {
    const u = new URL(peer.url);
    if (u.protocol === 'https:') return true;
    // Loopback е позволен само защото на него минават тестовете и dev режимът;
    // там „по мрежата" няма мрежа.
    return u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '::1';
  } catch {
    return false;
  }
}

export function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(file);
    s.on('error', reject);
    s.on('data', (c) => h.update(c));
    s.on('end', () => resolve(h.digest('hex')));
  });
}

export class OffsiteShipper {
  constructor({ cfg, audit, schedule }) {
    this.cfg = cfg;
    this.audit = audit;
    this.schedule = schedule;
  }

  start() {
    if (!this.cfg.backups?.offsite?.enabled) return;
    const every = Math.max(600, Number(this.cfg.backups.offsite.intervalSec) || 3600) * 1000;
    const tick = () => this.shipAll().catch(() => {});
    setTimeout(tick, 120000); // не на самия старт — първо да се вдигне всичко
    this.timer = setInterval(tick, every);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async shipAll() {
    const out = [];
    for (const peer of this.cfg.peers || []) {
      out.push(await this.shipTo(peer).catch((e) => ({ peer: peer.id, ok: false, error: e.message })));
    }
    return out;
  }

  async shipTo(peer) {
    if (!isTlsPeer(peer)) {
      return {
        peer: peer.id,
        ok: false,
        error: 'Изнасянето иска https. Дъмпът е цялата база (за medqr — медицински данни по чл. 9); по открит текст не пътува дори през частната мрежа на хостера.',
      };
    }
    const cap = Math.max(1, Number(this.cfg.backups?.offsite?.perRun) || 3);
    const maxBytes = Math.max(1, Number(this.cfg.backups?.offsite?.maxMB) || 4096) * 1024 * 1024;

    const sent = [];
    const skipped = [];
    let done = 0;
    for (const f of listShippable()) {
      if (done >= cap) break;
      if (this.schedule.wasShipped(peer.id, f.name)) continue;
      // Тавани, за които се КАЗВА. Мълчаливо отрязване чете се като „всичко е горе".
      if (f.sizeBytes > maxBytes) {
        skipped.push({ name: f.name, reason: `над тавана ${Math.round(maxBytes / 1048576)} MB` });
        continue;
      }
      const sha = await sha256File(path.join(DUMP_DIR, f.name));
      const res = await putFile(peer, this.cfg.nodeId, f, sha);
      if (!res.ok) {
        skipped.push({ name: f.name, reason: res.error || `HTTP ${res.status}` });
        break; // счупен peer → няма смисъл да блъскаме останалите
      }
      this.schedule.markShipped(peer.id, f.name);
      this.audit?.log({ action: 'backup.offsite.sent', peer: peer.id, name: f.name, sizeBytes: f.sizeBytes });
      sent.push({ name: f.name, sizeBytes: f.sizeBytes, duplicate: Boolean(res.duplicate) });
      done += 1;
    }
    return { peer: peer.id, ok: true, sent, skipped, remaining: pendingFor(this.schedule, peer.id) };
  }
}

function pendingFor(schedule, peerId) {
  return listShippable().filter((f) => !schedule.wasShipped(peerId, f.name)).length;
}

function putFile(peer, nodeId, file, sha256) {
  return new Promise((resolve) => {
    let target;
    try {
      target = new URL(peer.url);
    } catch {
      resolve({ ok: false, error: 'невалиден peer URL' });
      return;
    }
    const full = path.join(DUMP_DIR, file.name);
    const reqFn = target.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = reqFn(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: `/api/backups/offsite/receive?node=${encodeURIComponent(nodeId || 'unknown')}&name=${encodeURIComponent(file.name)}`,
        method: 'POST',
        timeout: 2 * 3600000,
        headers: {
          'content-type': 'application/octet-stream',
          // Дължината е ЗАДЪЛЖИТЕЛНА: приемникът проверява свободното място ПРЕДИ
          // да започне да пише. Без нея гигабайтов трансфер може да напълни диска
          // на втория VPS — тоест „бекъпът" сваля и резервната машина.
          'content-length': String(file.sizeBytes),
          'x-csd-sha256': sha256,
          authorization: `Bearer ${peer.token}`,
          'x-csd': '1',
        },
        rejectUnauthorized: peer.insecureTls ? false : undefined,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          if (body.length < 2000) body += c;
        });
        res.on('end', () => {
          const ok = res.statusCode >= 200 && res.statusCode < 300;
          let parsed = {};
          try {
            parsed = JSON.parse(body);
          } catch {
            /* приемникът е върнал нещо друго — статусът пак носи истината */
          }
          resolve({ ok, status: res.statusCode, duplicate: parsed.duplicate, error: ok ? null : parsed.error || body.slice(0, 200) });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    fs.createReadStream(full).on('error', (err) => {
      req.destroy();
      resolve({ ok: false, error: err.message });
    }).pipe(req);
  });
}

// ── Приемане (другата страна на федерацията) ─────────────────────────────────
export function receiveOffsite(req, { node, name, sha256, keep = 10, dir: baseDir }) {
  const nodeId = assertNodeId(node);
  const base = assertShipName(name);
  if (!/^[0-9a-f]{64}$/.test(String(sha256 || ''))) {
    throw Object.assign(new Error('Липсва или е невалиден x-csd-sha256'), { status: 400 });
  }
  const declared = Number(req.headers['content-length']);
  if (!Number.isInteger(declared) || declared <= 0) {
    throw Object.assign(new Error('Липсва content-length — не мога да проверя свободното място предварително'), { status: 411 });
  }

  const dir = path.join(String(baseDir || ''), nodeId);
  if (!baseDir) throw Object.assign(new Error('Липсва папка за копията'), { status: 500 });
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const finalPath = path.join(dir, base);
  const tmpPath = `${finalPath}.part`;

  // Вече го имаме → не преливаме мрежата за нищо. Проверява се по РАЗМЕР, не само
  // по име: прекъснат по-рано трансфер е оставил различен размер.
  try {
    const st = fs.statSync(finalPath);
    if (st.size === declared) return Promise.resolve({ ok: true, name: base, duplicate: true, sizeBytes: st.size });
  } catch {
    /* няма го — приемаме */
  }

  // Свободното място се мери ПРЕДИ да пишем, с резерв: приемник, който се напълва
  // от бекъпите на другия, престава да е резервна машина.
  try {
    const st = fs.statfsSync(dir);
    const free = st.bavail * st.bsize;
    if (free < declared * 1.2) {
      throw Object.assign(
        new Error(`Няма място: искат се ${Math.round(declared / 1048576)} MB, свободни са ${Math.round(free / 1048576)} MB`),
        { status: 507 }
      );
    }
  } catch (err) {
    if (err.status) throw err;
    /* statfs не работи → продължаваме, но без предварителна проверка */
  }

  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmpPath, { mode: 0o600 });
    const hash = crypto.createHash('sha256');
    let size = 0;
    let aborted = false;
    const fail = (err) => {
      if (aborted) return;
      aborted = true;
      out.destroy();
      fs.rm(tmpPath, { force: true }, () => reject(err));
    };

    req.on('data', (c) => {
      size += c.length;
      if (size > declared) {
        req.destroy();
        fail(Object.assign(new Error('Тялото е по-голямо от обявеното'), { status: 413 }));
        return;
      }
      hash.update(c);
    });
    req.on('error', fail);
    out.on('error', fail);
    out.on('finish', () => {
      if (aborted) return;
      const sha = hash.digest('hex');
      // Несъвпадащ хеш се ИЗТРИВА. Копие, за което не знаем дали е цяло, е по-лошо
      // от липсващо копие — то поне не приспива.
      if (sha !== sha256 || size !== declared) {
        fail(Object.assign(new Error(`Копието не съвпада (хеш ${sha === sha256 ? 'ок' : 'РАЗЛИЧЕН'}, ${size}/${declared} байта)`), { status: 400 }));
        return;
      }
      try {
        fs.renameSync(tmpPath, finalPath);
        pruneOffsite(baseDir, nodeId, keep);
      } catch (err) {
        fail(err);
        return;
      }
      resolve({ ok: true, name: base, sizeBytes: size, sha256: sha, node: nodeId });
    });

    req.pipe(out);
  });
}

export function pruneOffsite(baseDir, nodeId, keep = 10) {
  const dir = path.join(String(baseDir || ''), assertNodeId(nodeId));
  let files = [];
  try {
    files = fs
      .readdirSync(dir)
      .filter((n) => SHIP_RX.test(n))
      .map((name) => ({ name, mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
  const dropped = files.slice(Math.max(1, keep));
  for (const f of dropped) {
    try {
      fs.rmSync(path.join(dir, f.name), { force: true });
    } catch {
      /* best-effort */
    }
  }
  return dropped.map((f) => f.name);
}

export function receivedOffsite(baseDir) {
  let nodes = [];
  try {
    nodes = fs.readdirSync(baseDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch {
    return [];
  }
  return nodes.map((d) => {
    let files = [];
    try {
      files = fs
        .readdirSync(path.join(baseDir, d.name))
        .filter((n) => SHIP_RX.test(n))
        .map((name) => {
          const st = fs.statSync(path.join(baseDir, d.name, name));
          return { name, sizeBytes: st.size, mtime: st.mtime.toISOString() };
        })
        .sort((a, b) => b.mtime.localeCompare(a.mtime));
    } catch {
      /* изчезнала папка */
    }
    return {
      node: d.name,
      count: files.length,
      newest: files[0] || null,
      totalBytes: files.reduce((s, f) => s + f.sizeBytes, 0),
      files: files.slice(0, 20),
    };
  });
}
