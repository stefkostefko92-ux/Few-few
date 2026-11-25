/**
 * Кой сървър е кой, как се казва и коя страница заслужава търсачката.
 * ЧИСТИ функции — нула мрежа, нула Prisma, всичко е покрито с тестове
 * (`__tests__/server-identity.test.ts`).
 *
 * Защо съществува. Измерено на живо (22.10.2026): 1038 страници на сървъри,
 * ВСИЧКИ открити автоматично, нито една с описание, Discord или ревю; един и
 * същ сървър стоеше под до 12 адреса („ODYSSEY RolePlay …“ ×12, „Nova RP“ ×8 —
 * с еднакви живи числа, защото всички редове сочат един адрес), а заглавията
 * бяха суровият hostname с емоджи и реклама. Причината е в данните, не в шаблона: Cfx.re дава НОВ код при всяка
 * нова регистрация на сървъра (нов лицензен ключ, смяна на хостинг), а
 * откриването правеше нов ред — и нов адрес — за всеки код. Търсачката вижда
 * стотици почти еднакви страници без собствено съдържание, т.е. точно
 * „scaled content abuse“, и спира да индексира целия хост.
 */

import { stripColorCodes } from './fivem';
import { isValidSlug, slugify } from './slug';

// ── Чисто заглавие ──────────────────────────────────────────────────────────

/**
 * Емоджи и декоративни символи. `Extended_Pictographic` хваща картинките,
 * останалите класове — свързващите и модифициращите знаци, които без картинката
 * остават като невидим боклук (ZWJ, VS16, тонове на кожата, keycap, флагове).
 * `\p{So}` е „друг символ“: ★ ► ☠ ♛ ✦ и подобни, с които се рисуват рамки.
 */
const DECORATION_RE =
  /[\p{Extended_Pictographic}\p{Regional_Indicator}\p{So}\u200d\ufe0e\ufe0f\u20e3\u{1f3fb}-\u{1f3ff}\u{e0020}-\u{e007f}]/gu;

/** Скоби с етикет: „[ESX]“, „(18+)“, „【BG】“, „{WL}“. */
const BRACKET_RE = /\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|【[^】]*】|«[^»]*»/g;

/**
 * Разделителите, с които hostname-ът се реже на „марка | реклама | реклама“.
 * Тиретата броят САМО с интервали от двете страни: „Qb-Core“ и „НАЙ-ДОБРИЯТ“
 * са думи, не разделители.
 */
const SEPARATOR_RE = /\s*[|｜¦•●▪︱⁞‖]\s*|\s+[-–—~]+\s+|\s*\/\/\s*|\s+\/\s+|:\s+|!\s+/u;

/**
 * Сегменти, които не са име, а етикет — без тях първият „смислен“ сегмент на
 * „BG | Nova RP“ е „Nova RP“, а не „BG“.
 */
const TAG_SEGMENTS = new Set([
  'bg',
  'bul',
  'bgn',
  'eu',
  'en',
  'new',
  // Ключът е транслитериран: „НОВ“ → „nov“.
  'nov',
  'novo',
  'esx',
  'esxlegacy',
  'esxlegacyserver',
  'qbcoreframework',
  'qb',
  'qbcore',
  'qbox',
  'oxcore',
  'wl',
  'nonwl',
  'nonwh',
  'whitelist',
  'nowhitelist',
  'rp',
  'roleplay',
  'serious',
  'seriousrp',
  'heavyrp',
  'semirp',
  'open',
  'opening',
  'soon',
  'beta',
  'alpha',
  'season',
  '18',
  '16',
]);

/**
 * Опашките, които рецептите на FXServer слагат сами в `sv_hostname`. Не са
 * част от името: „Velora Roleplay built with QBCore Framework by JericoFx &
 * Kakarot & Hamy!“ е „Velora Roleplay“ — и още 40 сървъра със същата опашка.
 */
const RECIPE_TAIL_RE = /\s+built with (?:qb-?core|qbox|esx|fivem)\b.*$/i;

/**
 * Сегмент, който казва „това е тестова/развойна инстанция“: „DEV“, „Test
 * Server“, „DEV [1] SERVER“. Такъв сървър не е място, където някой да играе —
 * не се слива с основния и не се предлага на търсачката.
 */
const DEV_SEGMENT_RE =
  /(?:^|[\s-])(?:dev|devel|development|test|testing|тест|preview)(?:[\s-]*(?:server|сървър|\d+))*$/i;

/** Ключът на сегмент/име: само букви и цифри, кирилицата — транслитерирана. */
function compactKey(text: string): string {
  // NFKC ПРЕДИ slugify: „𝐏𝐀𝐑𝐀𝐃𝐈𝐒𝐄“ (математически букви — любим „шрифт“ в
  // имената) иначе пада изцяло като не-латиница и ключът остава празен.
  return slugify(text.normalize('NFKC')).replace(/-/g, '');
}

/** Маха повтаряща се дума подред: „ROLEPLAY ROLEPLAY“ → „ROLEPLAY“. */
function collapseRepeatedWords(text: string): string {
  const out: string[] = [];
  for (const word of text.split(' ')) {
    const prev = out[out.length - 1];
    if (prev !== undefined && prev.toLocaleLowerCase('bg') === word.toLocaleLowerCase('bg')) continue;
    out.push(word);
  }
  return out.join(' ');
}

/** Пунктуацията по краищата: „— Nova RP —“, „Nova RP |“, „^ Nova“. */
function trimEdges(text: string): string {
  return text
    .replace(/^[\s\-–—_.,:;|/\\*~=#@^+!?'"`]+/u, '')
    .replace(/[\s\-–—_.,:;|/\\*~=#@^'"`]+$/u, '')
    .trim();
}

/**
 * Първичното чистене на чуждия hostname за НАШЕТО заглавие. Емоджитата стават
 * РАЗДЕЛИТЕЛ, не просто изчезват: в „Reverse City 💵 50000 НАЧАЛЕН БОНУС 💵“
 * и „GORILLA ROLEPLAY 🦍 | …“ картинката е точно мястото, където името свършва
 * и рекламата започва (измерено върху 1038 живи имена).
 */
function baseClean(raw: string): string {
  return stripColorCodes(raw)
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(RECIPE_TAIL_RE, '')
    // Адреси в името („Join Our Discord : https://dsc.gg/…“) — реклама, не име.
    .replace(/(?:https?:\/\/|www\.)\S+|\b(?:discord\.gg|dsc\.gg|discord\.com\/invite)\/\S+/gi, ' | ')
    .replace(DECORATION_RE, ' | ')
    // Останалите „^“ след цветните кодове: „^ [ESX] NEXUS“ на живо.
    .replace(/\^/g, ' ')
    // Възрастов етикет: „VOID ROLEPLAY 18 +“, „+18“.
    .replace(/(?:^|\s)(?:\d{2}\s*\+|\+\s*\d{2})(?=\s|\||$)/g, ' ')
    // Повторена пунктуация, с която се рисуват рамки: „!!!“, „$$$“, „***“.
    .replace(/([!?$*#=_~.+-])\1{2,}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Сегментите на името: „марка | реклама | реклама“, без скобите с етикети. */
function nameSegments(raw: string): string[] {
  const cleaned = baseClean(raw);
  if (!cleaned) return [];
  // Скобите с етикети падат; ако след тях не остане име, взимаме съдържанието
  // им („[NOVA RP]“ сам по себе си Е името).
  const unbracketed = cleaned.replace(BRACKET_RE, ' ').replace(/\s+/g, ' ').trim();
  const source = unbracketed.split(SEPARATOR_RE).some(isMeaningful)
    ? unbracketed
    : cleaned.replace(/[[\](){}【】«»]/g, ' ');
  return source
    .split(SEPARATOR_RE)
    .map((segment) => trimEdges(collapseRepeatedWords(segment.replace(/\s+/g, ' ').trim())))
    .filter(Boolean);
}

/** Има ли в името сегмент „DEV“/„Test Server“ — развойна инстанция. */
function isDevInstance(segments: readonly string[]): boolean {
  return segments.some((segment) => DEV_SEGMENT_RE.test(segment));
}

/**
 * Реже до `max` знака по граница на дума. Дума, по-дълга от тавана сама, се
 * реже твърдо — иначе резултатът е празен.
 */
export function fitAtWord(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max + 1);
  const space = cut.lastIndexOf(' ');
  const head = space > max * 0.4 ? cut.slice(0, space) : clean.slice(0, max);
  // Не оставяме самотен висок сурогат (емоджи, разцепено наполовина).
  return trimEdges(head.replace(/[\ud800-\udbff]$/, ''));
}

/** Сегментът е име, ако има поне 3 букви и не е само етикет („BG“, „ESX“, „18+“). */
function isMeaningful(segment: string): boolean {
  const letters = segment.match(/\p{L}/gu)?.length ?? 0;
  return letters >= 3 && !TAG_SEGMENTS.has(compactKey(segment));
}

/**
 * Името на сървъра за `<title>`, `<h1>` и meta: марката, без цветни кодове,
 * емоджи, рекламна опашка след разделител и повторени думи, отрязано по
 * граница на дума.
 *
 * „BALKAN RP | 💸 $50 000 START BONUS 💸 | 👮♂️ STAFF TEAM“ → „BALKAN RP“.
 * „[ESX] MBT ROLEPLAY SEASON 1| 🏎️Къстъм коли“ → „MBT ROLEPLAY SEASON 1“.
 *
 * Пълното име не се губи — страницата го показва отделно (`serverFullName`),
 * обозначено като името от списъка на Cfx.re.
 */
export function serverTitle(raw: string | null | undefined, max = 60, fallback = 'FiveM сървър'): string {
  if (!raw) return fallback;
  const segments = nameSegments(raw);
  if (segments.length === 0) return fallback;

  // Развойната инстанция показва и маркера, и името — „DEV · Genesis RP“, не
  // голото „DEV“, по което нищо не се разпознава.
  if (isDevInstance(segments)) return fitAtWord(segments.slice(0, 2).join(' · '), max) || fallback;

  const index = segments.findIndex(isMeaningful);
  if (index === -1) return fitAtWord(segments.join(' '), max) || fallback;

  // „SMEGZ - ROLEPLAY“, „NEW ERA | ROLEPLAY“: етикетът „RP/ROLEPLAY“ точно
  // след марката е част от името, не реклама.
  const next = segments[index + 1];
  const nextKey = next ? compactKey(next) : '';
  const brand =
    next && (nextKey === 'rp' || nextKey === 'roleplay') ? `${segments[index]} ${next}` : segments[index];

  return fitAtWord(trimEdges(brand), max) || fallback;
}

/**
 * Пълното име, както сървърът сам се обявява, само без цветните кодове и
 * управляващите знаци — за реда под заглавието. Емоджитата остават: това е
 * чуждият текст, показан като такъв, а не нашето заглавие.
 */
export function serverFullName(raw: string | null | undefined, max = 160): string {
  if (!raw) return '';
  const cleaned = stripColorCodes(raw)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\u200b-\u200c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/\^/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return fitAtWord(cleaned, max);
}

/**
 * Уникален slug. Името идва от чужд сървър, тоест може да е емоджи, цветни
 * кодове или дубликат — затова: чистене, после проверка, после суфикс с Cfx
 * кода, който е гарантирано уникален.
 *
 * Основата е МАРКАТА (`serverTitle`), не целият hostname: иначе адресът
 * носеше рекламата — `/servers/balkan-rp-50-000-start-bonus-staff-team-drugs`.
 * Вече издадените адреси не се пипат (смяна на адрес = нова страница за
 * търсачката); това важи за новите редове.
 */
export function buildServerSlug(hostname: string, endPoint: string, taken: ReadonlySet<string>): string {
  const base = slugify(serverTitle(hostname, 60, ''));
  const candidate = isValidSlug(base) ? base : `server-${endPoint}`;
  if (!taken.has(candidate)) return candidate;

  // Суфиксът се събира ВИНАГИ: дотук `${candidate}-${код}`.slice(0, 60) го
  // отрязваше при дълго име, резултатът съвпадаше с вече заетия slug и всеки
  // следващ дубликат ставаше голото `server-<код>` (38 такива на живо).
  const room = 60 - endPoint.length - 1;
  const suffixed = `${candidate.slice(0, room).replace(/-+$/, '')}-${endPoint}`;
  return taken.has(suffixed) || !isValidSlug(suffixed) ? `server-${endPoint}` : suffixed;
}

// ── Идентичност ─────────────────────────────────────────────────────────────

/**
 * Имената, които НЕ идентифицират никого: заводските стойности на FXServer и
 * служебните етикети. Два сървъра „Dev“ не са един сървър — затова такова име
 * никога не слива редове и никога не става индексирана страница (нищо не
 * може да се търси по него).
 */
const GENERIC_KEYS = new Set([
  'defaultfxserver',
  'fxserver',
  'fxserverbutunconfigured',
  'invalidserver',
  'invalidserverinternalvalidationfailed',
  'examplerp',
  'defaultserver',
  'bulgarian',
  'bulgaria',
  'balgariya',
  'balgarski',
  'bg',
  'changeme',
  'season1',
  'esxlegacyserver',
  'esxserver',
  'qbcoreframework',
  'qbcoreserver',
  'qboxserver',
  'myserver',
  'myfivemserver',
  'server',
  'fivem',
  'fivemserver',
  'fivemsarvar',
  'dev',
  'devserver',
  'development',
  'test',
  'testserver',
  'testing',
  'local',
  'localhost',
  'bezime',
  'unnamed',
  'noname',
  'rp',
  'roleplay',
  'rpserver',
  'roleplayserver',
]);

/** Ключът, по който два реда се броят за ЕДИН сървър. `null` — името не стига. */
export function serverIdentityKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Ключът е от МАРКАТА, не от целия hostname: рекламната опашка се мени между
  // регистрациите („$30 000 START BONUS“ → „$50 000 …“), марката — не.
  // Развойната инстанция („DEV | Genesis RP“) не е основният сървър: не се
  // слива с него, а сама не е нещо, което някой търси.
  if (isDevInstance(nameSegments(raw))) return null;
  const key = compactKey(serverTitle(raw, 60, ''));
  if (key.length < 3 || GENERIC_KEYS.has(key)) return null;
  return key;
}

export function isGenericServerName(raw: string | null | undefined): boolean {
  return serverIdentityKey(raw) === null;
}

// ── Каноничен ред и пренасочване ────────────────────────────────────────────

/**
 * Колко назад присъствието в списъка на Cfx.re доказва, че регистрацията е
 * жива. Огледало на `LIST_TRUST_MS` (откриването върви на 45 мин).
 */
export const REGISTRATION_ALIVE_MS = 100 * 60_000;

export type IdentityRow = {
  id: string;
  name: string;
  source: 'SUBMITTED' | 'DISCOVERED';
  createdAt: Date;
  /** Последно в живия списък на Cfx.re — доказателството за жива регистрация. */
  lastSeenInListAt: Date | null;
  players: number;
};

export type IdentityPlan = {
  /** id на ред → id на каноничния ред от групата му (`null` за самия каноничен). */
  canonicalOf: Map<string, string | null>;
  /**
   * Групи, в които каноничният ред е с мъртва регистрация, а друг член — с
   * жива: регистрацията (кодът, адресът, живият статус) се ПРЕМЕСТВА върху
   * каноничния, за да остане адресът на страницата същият, а „Влез“ да води
   * към работещия код. Виж `scripts/discover-servers.ts`.
   */
  rebind: Array<{ canonicalId: string; liveId: string }>;
};

function aliveAt(row: IdentityRow, now: Date): boolean {
  if (!row.lastSeenInListAt) return false;
  const age = now.getTime() - row.lastSeenInListAt.getTime();
  return age >= 0 && age < REGISTRATION_ALIVE_MS;
}

/**
 * Каноничният ред на група: подаденият от собственика, иначе НАЙ-СТАРИЯТ.
 * Нарочно не „живият“: живостта се мени при всяка нова регистрация, а адресът
 * на страницата не бива — точно това е грешката, която поправяме. Живата
 * регистрация се мести към стария адрес (`rebind`), не обратно.
 */
function compareCanonical(a: IdentityRow, b: IdentityRow): number {
  if (a.source !== b.source) return a.source === 'SUBMITTED' ? -1 : 1;
  const age = a.createdAt.getTime() - b.createdAt.getTime();
  if (age !== 0) return age;
  return a.id.localeCompare(b.id);
}

/**
 * Групира ОДОБРЕНИТЕ редове по `serverIdentityKey` и избира каноничния във
 * всяка група. Редове с общо (генерично) име остават сами — те не са един
 * сървър, а не са и страница за индексиране.
 *
 * Сливане по адрес (host:port) НЯМА нарочно: хостингите преотдават IP и порт,
 * тоест два различни сървъра с месеци разлика могат да имат един адрес — а
 * сливането крие истински сървър зад пренасочване.
 */
export function planIdentities(rows: readonly IdentityRow[], now: Date = new Date()): IdentityPlan {
  const groups = new Map<string, IdentityRow[]>();
  const canonicalOf = new Map<string, string | null>();

  for (const row of rows) {
    const key = serverIdentityKey(row.name);
    if (!key) {
      canonicalOf.set(row.id, null);
      continue;
    }
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  const rebind: IdentityPlan['rebind'] = [];
  for (const group of groups.values()) {
    const [canonical, ...rest] = [...group].sort(compareCanonical);
    canonicalOf.set(canonical.id, null);
    for (const row of rest) canonicalOf.set(row.id, canonical.id);

    if (rest.length > 0 && !aliveAt(canonical, now)) {
      const live = rest
        .filter((row) => aliveAt(row, now))
        .sort(
          (a, b) =>
            b.lastSeenInListAt!.getTime() - a.lastSeenInListAt!.getTime() ||
            b.players - a.players ||
            compareCanonical(a, b),
        )[0];
      if (live) rebind.push({ canonicalId: canonical.id, liveId: live.id });
    }
  }

  return { canonicalOf, rebind };
}

// ── Кое се индексира ────────────────────────────────────────────────────────

/**
 * Прозорецът на активност: сървър с поне един играч през последните 30 дни.
 * По-къс прозорец вади от индекса сървър, затворен за ремонт за седмица, и го
 * връща после — търсачката вижда мигаща страница. По-дълъг държи в индекса
 * сървъри, които отдавна не съществуват.
 */
export const INDEXABLE_ACTIVE_DAYS = 30;

export type IndexableInput = {
  name: string;
  source: 'SUBMITTED' | 'DISCOVERED';
  description: string | null;
  tagline: string | null;
  /** Последният момент, в който сървърът е имал ≥1 играч. */
  lastActiveAt: Date | null;
  /** Брой ОДОБРЕНИ ревюта. */
  approvedReviews: number;
  /** Ред-псевдоним (дубликат) — никога не се индексира, а се пренасочва. */
  canonicalId: string | null;
};

export type IndexReason = 'alias' | 'generic-name' | 'owner-content' | 'reviews' | 'active' | 'no-unique-content';

/**
 * ПРАВИЛОТО ЗА ИНДЕКСИРАНЕ на страница на сървър. Едно място — страницата
 * (`robots`) и `sitemap.ts` питат тук, значи не могат да се разминат.
 *
 * Индексира се (и влиза в sitemap-а) само КАНОНИЧЕН ред с име, което
 * идентифицира нещо, И поне едно от:
 *   1. собствено съдържание от собственика — подаден листинг, описание или
 *      кратко описание (`tagline`);
 *   2. поне едно одобрено ревю;
 *   3. реална активност — поне един играч през последните 30 дни.
 *
 * Всичко останало е `noindex, follow`: страницата остава за посетителя
 * (линкове, търсене, „Влез“), но не се предлага на търсачката, защото не носи
 * нищо, което я отличава от стотиците други празни записи от списъка на Cfx.re.
 */
export function indexDecision(server: IndexableInput, now: Date = new Date()): { index: boolean; reason: IndexReason } {
  if (server.canonicalId) return { index: false, reason: 'alias' };
  if (isGenericServerName(server.name)) return { index: false, reason: 'generic-name' };
  if (server.source === 'SUBMITTED' || server.description?.trim() || server.tagline?.trim()) {
    return { index: true, reason: 'owner-content' };
  }
  if (server.approvedReviews > 0) return { index: true, reason: 'reviews' };
  if (server.lastActiveAt) {
    const age = now.getTime() - server.lastActiveAt.getTime();
    if (age >= 0 && age <= INDEXABLE_ACTIVE_DAYS * 86_400_000) return { index: true, reason: 'active' };
  }
  return { index: false, reason: 'no-unique-content' };
}

export function isIndexableServer(server: IndexableInput, now: Date = new Date()): boolean {
  return indexDecision(server, now).index;
}
