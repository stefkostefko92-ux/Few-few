// @ts-check
// Анонимен агрегатен брояч на посещения (GDPR-safe).
//
// НЕ съхранява IP адреси, НЕ поставя бисквитки. „Уникални посетители" се броят
// приблизително чрез еднопосочен HMAC на (IP+User-Agent) с дневна ротираща сол,
// която живее САМО в паметта и се сменя всеки ден → хешовете не могат да се
// върнат до IP и не проследяват между дни. На диска отиват само АГРЕГАТНИ числа
// (брой посещения/посетители/страница) — никакви лични данни.

import { createHmac, randomBytes } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * @typedef {Object} GiornoStat
 * @property {number} views
 * @property {number} visitors
 */
/**
 * @typedef {Object} StatoAnalytics
 * @property {string} since
 * @property {number} totalViews
 * @property {number} botViews
 * @property {Record<string, GiornoStat>} byDay
 * @property {Record<string, number>} byPath
 */

// Разпознаване на ботове/краулери по User-Agent — само за КЛАСИФИКАЦИЯ на брояча
// (не блокираме никого; ботовете са добре дошли за SEO). След IndexNow подаване
// краулерите изтеглят хиляди страници и без този филтър „посещенията" в админа
// са предимно машини, не хора. Приблизително е (UA се подправя лесно), но
// разделя честно органичния трафик от обхождането. Липсващ UA = скрипт.
const BOT_RE = /bot|crawl|spider|slurp|preview|scan|monitor|probe|archive|index|curl|wget|python|httpx|aiohttp|axios|okhttp|java\/|libwww|go-http|node-fetch|headless|phantom|lighthouse|pingdom|uptime|facebookexternalhit|embedly|quora|whatsapp|telegram|skype|discord|slack|mastodon/i;
/**
 * @param {string|undefined|null} userAgent
 * @returns {boolean}
 */
export function eBot(userAgent) {
  if (!userAgent) return true;
  return BOT_RE.test(userAgent);
}

/**
 * Дата „YYYY-MM-DD" (Europe/Rome не е критично за агрегати — ползваме UTC-ден).
 * @param {Date} [date]
 * @returns {string}
 */
export function giornoDi(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/**
 * Еднопосочен хеш на посетителя за деня (солта е дневна и не се пази на диск).
 * @param {import('node:crypto').BinaryLike} salt
 * @param {string|undefined|null} ip
 * @param {string|undefined|null} userAgent
 * @returns {string}
 */
export function hashVisitatore(salt, ip, userAgent) {
  return createHmac('sha256', salt).update(`${ip || ''}|${userAgent || ''}`).digest('base64');
}

/**
 * Чиста агрегация: вписва едно посещение в състоянието (за unit тест).
 * Бот → само отделният брояч botViews; не влиза във views/visitors/byPath,
 * за да показва админът органичен (човешки) трафик.
 * @param {StatoAnalytics} stato
 * @param {{ path: string, giorno: string, nuovoVisitatore: boolean, bot?: boolean }} vista
 * @returns {StatoAnalytics}
 */
export function applicaVista(stato, { path, giorno, nuovoVisitatore, bot = false }) {
  if (bot) {
    stato.botViews = (stato.botViews || 0) + 1;
    return stato;
  }
  stato.totalViews = (stato.totalViews || 0) + 1;
  stato.byDay ||= {};
  const d = (stato.byDay[giorno] ||= { views: 0, visitors: 0 });
  d.views += 1;
  if (nuovoVisitatore) d.visitors += 1;
  stato.byPath ||= {};
  stato.byPath[path] = (stato.byPath[path] || 0) + 1;
  return stato;
}

/** @returns {StatoAnalytics} */
const statoVuoto = () => ({ since: giornoDi(), totalViews: 0, botViews: 0, byDay: {}, byPath: {} });

export class Contatore {
  /** @param {string} file */
  constructor(file) {
    this.file = file;
    this.stato = statoVuoto();
    /** @type {Set<string>} */
    this._giornoSet = new Set(); // хешове на посетители за текущия ден (само памет)
    this._giorno = giornoDi();
    this._salt = randomBytes(32); // дневна ротираща сол (само памет)
    this._dirty = false;
    /** @type {ReturnType<typeof setTimeout>|null} */
    this._timer = null;
  }

  /** @returns {Promise<this>} */
  async carica() {
    try {
      this.stato = { ...statoVuoto(), ...JSON.parse(await readFile(this.file, 'utf8')) };
    } catch {
      this.stato = statoVuoto();
    }
    return this;
  }

  _rotaGiorno() {
    const oggi = giornoDi();
    if (oggi !== this._giorno) {
      this._giorno = oggi;
      this._giornoSet = new Set();
      this._salt = randomBytes(32);
    }
  }

  /**
   * Вписва посещение на HTML страница. ip/ua се ползват само за дневния хеш.
   * @param {string} path
   * @param {string|undefined|null} ip
   * @param {string|undefined|null} userAgent
   * @returns {void}
   */
  registra(path, ip, userAgent) {
    this._rotaGiorno();
    // Бот/краулер → отделен брояч, без дневен хеш (не е „посетител").
    if (eBot(userAgent)) {
      applicaVista(this.stato, { path, giorno: this._giorno, nuovoVisitatore: false, bot: true });
      this._pianificaSalva();
      return;
    }
    const h = hashVisitatore(this._salt, ip, userAgent);
    const nuovo = !this._giornoSet.has(h);
    if (nuovo) this._giornoSet.add(h);
    applicaVista(this.stato, { path, giorno: this._giorno, nuovoVisitatore: nuovo });
    this._pianificaSalva();
  }

  /** @returns {void} */
  _pianificaSalva() {
    this._dirty = true;
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      if (this._dirty) this.salva().catch(() => {});
    }, 5000);
    if (this._timer.unref) this._timer.unref();
  }

  /** @returns {Promise<void>} */
  async salva() {
    this._dirty = false;
    await mkdir(dirname(this.file), { recursive: true }).catch(() => {});
    // Атомен запис: пиши във временен файл в същата директория, после rename
    // (rename е атомарен на същата ФС) → срив по средата не корумпира състоянието.
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(this.stato));
    await rename(tmp, this.file);
  }

  /**
   * Резюме за админ таблото.
   * @returns {{ since: string, totalViews: number, botViews: number, oggi: GiornoStat, viste7: number,
   *   serie: Array<GiornoStat & { giorno: string }>, topPagine: Array<{ path: string, views: number }> }}
   */
  riepilogo() {
    const oggi = giornoDi();
    const giorni = Object.keys(this.stato.byDay).sort();
    const ultimi14 = giorni.slice(-14).map((g) => ({ giorno: g, ...this.stato.byDay[g] }));
    const ultimi7 = giorni.slice(-7);
    const viste7 = ultimi7.reduce((s, g) => s + (this.stato.byDay[g].views || 0), 0);
    const topPagine = Object.entries(this.stato.byPath)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([path, views]) => ({ path, views }));
    return {
      since: this.stato.since,
      totalViews: this.stato.totalViews || 0,
      botViews: this.stato.botViews || 0,
      oggi: this.stato.byDay[oggi] || { views: 0, visitors: 0 },
      viste7,
      serie: ultimi14,
      topPagine,
    };
  }
}
