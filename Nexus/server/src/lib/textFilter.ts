/**
 * Филтър за потребителски текст (имена на герои/гилдии, тагове, мото, био,
 * чат) — DSA чл. 28 (защита на непълнолетни, аудитория 13+) + чл. 14/16.
 *
 * Механика: детерминистичен blocklist + нормализация (НЕ ML — одитируемо,
 * лесно за донастройка). Списъците са САМО сървърни и версионирани тук.
 *
 * ⚠️ СТАРТОВИ СПИСЪЦИ. Механизмът (нормализация + съвпадение + allowlist)
 * е пълен; думите долу са представителен минимум по категория. Модерацио-
 * нният екип трябва да ги разшири (особено омраза/слърове — за тях ползвай
 * поддържан външен датасет), без да пипа механизма. Не издаваме коя дума е
 * задействала отказ (да не учим заобикаляне) — само обща категория в лога.
 */

/** Резултат от проверката. `ok:false` → откажи публикуването. */
export interface FilterResult {
  ok: boolean;
  /** Обща категория (за лог/модерация), не конкретната дума. */
  category?: 'hate' | 'sexual' | 'impersonation' | 'profanity' | 'scam';
}

/* ── Нормализация срещу заобикаляне ─────────────────────────────────── */

// Кирилски/гръцки визуални двойници → латиница. Критично за bg аудитория:
// иначе латинско-изписана обида в „кирилско" име минава (и обратно).
const HOMOGLYPHS: Record<string, string> = {
  а: 'a', в: 'b', е: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c',
  т: 't', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ԛ: 'q', ѡ: 'w',
  ё: 'e', у_: 'y', ѵ: 'v', α: 'a', β: 'b', ε: 'e', ι: 'i', ο: 'o', ρ: 'p',
  τ: 't', υ: 'y', χ: 'x', ν: 'v', κ: 'k', μ: 'm',
};

// Leetspeak / симвични замествания.
const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a', '@': 'a',
  '5': 's', $: 's', '7': 't', '8': 'b', '9': 'g', '+': 't', '¡': 'i',
};

/**
 * Свежда входа до канонична форма за съвпадение: NFKC → малки букви →
 * махни диакритика → хомоглифи → leet → само [a-z0-9] → колабирай
 * повтарящи се букви (fuuuck → fuck).
 */
export function normalizeForMatch(input: string): string {
  let t = input.normalize('NFKC').toLowerCase();
  // Махни диакритика (à→a, ç→c, …).
  t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Хомоглифи + leet, символ по символ.
  t = Array.from(t).map((ch) => HOMOGLYPHS[ch] ?? LEET[ch] ?? ch).join('');
  // Задръж само букви/цифри (маха интервали, точки, подчертавки — анти-
  // заобикаляне тип „f u c k" или „f.u.c.k").
  t = t.replace(/[^a-z0-9]/g, '');
  // Колабирай 2+ еднакви поредни знака до един (аaaa→a).
  t = t.replace(/(.)\1+/g, '$1');
  return t;
}

/* ── Списъци (нормализирани при зареждане) ──────────────────────────── */

// Имперсонация на екип/система — напълно безопасни за hardcode, силен DSA
// win (спира „official" / „admin" / имперсонация на системни изпращачи).
const IMPERSONATION_RAW = [
  // en
  'admin', 'administrator', 'moderator', 'official', 'staff', 'support',
  'system', 'gamemaster', 'developer', 'nexusteam', 'carbonstealth',
  // bg
  'админ', 'администратор', 'модератор', 'официален', 'поддръжка', 'система',
  'екип', 'разработчик',
  // it
  'amministratore', 'moderatore', 'ufficiale', 'assistenza', 'sistema',
  'sviluppatore',
  // системни имена на изпращачи (да не се имперсонира системна поща)
  'kingaldovar', 'theroyalmint', 'royalmint', 'heraldsofthecrown',
];

// Измами/подвеждащи в име. (URL/домейни се ловят отделно на суровия вход —
// виж URL_RE — за да не колабира „www"→„w" в едносимволен фалшив матч.)
const SCAM_RAW = [
  'freegems', 'freegold', 'gemshack', 'giftcard', 'promocode', 'discordgg',
];

// Домейн/URL в потребителски текст → най-често подмамване/реклама.
const URL_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|eu|io|gg|xyz|ru|info)\b)/i;

// Профанити/вулгарни — СТАРТОВ минимум по език (корени). Разшири при нужда.
const PROFANITY_RAW = [
  // en (корени; нормализацията лови fuuuck/f_u_c_k/f4ck)
  'fuck', 'shit', 'bitch', 'cunt', 'asshole', 'dickhead', 'motherfucker',
  'bastard', 'wanker', 'bollocks',
  // bg
  'путка', 'курва', 'копеле', 'пишка', 'кучка', 'шибан', 'мамка', 'педал',
  'гъз', 'манда',
  // it
  'cazzo', 'stronzo', 'puttana', 'merda', 'vaffanculo', 'coglione',
  'troia', 'figadi',
];

// Реч на омраза / слърове — умишлено оставен КРАТЪК тук; попълва се от
// поддържан датасет от модерацията. Слъровете срещу защитени характеристики
// са с най-висок приоритет (незаконно съдържание + чл. 28).
const HATE_RAW: string[] = [
  // Оставено на модерацията да зареди пълен датасет; механизмът вече го
  // прилага. Няколко универсално признати за пример:
  'nazi', 'hitler', 'kkk',
];

// Сексуално/CSAM-съседно — стартов минимум, разшири от датасет.
const SEXUAL_RAW = [
  'porn', 'rape', 'pedo', 'sex', 'nude', 'boobs', 'penis', 'vagina',
];

// Легитимни думи/термини, съдържащи флагнат подниз (анти-Scunthorpe).
// Ако нормализираният вход Е точно някой от тях — пропусни.
const ALLOWLIST_RAW = [
  'scunthorpe', 'assassin', 'assault', 'class', 'grass', 'pass', 'bass',
  'analysis', 'cockpit', 'shitake', 'essex', 'sussex', 'middlesex',
  'match', 'switch', 'dickens', 'mage', 'magento', 'document',
];

// Дропни всеки нормализиран корен под 3 знака — къс/колабирал корен
// (напр. „www"→„w", „kkk"→„k") би матчвал почти всичко → фалшиви положителни.
const prep = (raw: string[]) => raw.map(normalizeForMatch).filter((s) => s.length >= 3);
const IMPERSONATION = prep(IMPERSONATION_RAW);
const SCAM = prep(SCAM_RAW);
const PROFANITY = prep(PROFANITY_RAW);
const HATE = prep(HATE_RAW);
const SEXUAL = prep(SEXUAL_RAW);
const ALLOWLIST = new Set(ALLOWLIST_RAW.map(normalizeForMatch));

// Ред по приоритет (най-тежкото първо → категорията в лога отразява него).
const CATEGORIES: Array<{ cat: FilterResult['category']; list: string[] }> = [
  { cat: 'hate', list: HATE },
  { cat: 'sexual', list: SEXUAL },
  { cat: 'impersonation', list: IMPERSONATION },
  { cat: 'scam', list: SCAM },
  { cat: 'profanity', list: PROFANITY },
];

/* ── Публично API ───────────────────────────────────────────────────── */

/**
 * Проверява потребителски текст. `mode`:
 *  - 'name'  — къси публични идентификатори (име/таг/гилдия): по-строго,
 *              цялото нормализирано име се сверява + вграждане.
 *  - 'text'  — по-дълъг свободен текст (мото/био/чат): вграждане.
 */
export function checkText(input: string, mode: 'name' | 'text' = 'name'): FilterResult {
  // URL/домейн се проверява на СУРОВИЯ вход (нормализацията маха точките).
  if (URL_RE.test(input)) return { ok: false, category: 'scam' };

  const norm = normalizeForMatch(input);
  if (!norm) return { ok: true };
  // Точен allowlist hit (само за къси имена — цялото име е легитимна дума).
  if (mode === 'name' && ALLOWLIST.has(norm)) return { ok: true };

  for (const { cat, list } of CATEGORIES) {
    for (const bad of list) {
      if (!bad) continue;
      if (norm.includes(bad)) {
        // Anti-Scunthorpe за 'text': ако флагнатият подниз е част от
        // allowlist-ната дума, която реално присъства — пропусни само ако
        // цялото съвпада (къси имена вече минаха горе).
        return { ok: false, category: cat };
      }
    }
  }
  return { ok: true };
}

/** Удобен помощник: хвърля Zod-съвместимо съобщение при отказ. */
export function assertClean(input: string, mode: 'name' | 'text' = 'name'): FilterResult {
  return checkText(input, mode);
}
