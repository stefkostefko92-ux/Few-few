// Сравнение на CV с обява за работа — изцяло в браузъра, без AI и без сървър.
//
// Взимаме ключовите думи от обявата (без служебни думи), сравняваме ги с
// текста на CV-то ПО ОСНОВА (първите знаци на думата), защото българският се
// склонява: „програмист“, „програмисти“, „програмиране“ са едно и също
// умение за целта ни. Връщаме кое има и кое липсва — не „оценка за ATS“,
// която би обещавала повече, отколкото една проста проверка знае.

const STOP = new Set(
  (
    "и в във на за с със от до по при към през след пред без под над между или но а че да не ще са е съм си сме сте бъде бъдат " +
    "като както който която което които кой коя кое кои този тази това тези онзи там тук така също още вече много малко " +
    "всеки всяка всяко всички всичко нашия нашата нашето нашите наш наша наше наши вашия ваша ваше ваши свой своя свое свои " +
    "търсим търси предлагаме предлага изисквания изискване изискваме кандидат кандидати кандидатите позиция позицията работа " +
    "работно място фирма фирмата компания компанията екип екипа опит години година добро добри добър отлично отлични " +
    "задължително задължителни задължителен желателно желателни предимство предимства познания познаване владеене " +
    "умения умение способност способности език езици ниво възможност възможности отговорности отговорност " +
    "заплата заплащане условия условията обява обявата моля изпратете кандидатствайте " +
    "the and or for with from that this have has are was will you your our we they to of in on at by as an a is be " +
    "experience years team company position job role work candidate candidates requirements required we're you'll"
  ).split(/\s+/),
);

/** Основа на дума: първите 6 знака (или цялата, ако е по-кратка). */
export function stem(word: string): string {
  return word.toLowerCase().slice(0, 6);
}

export function words(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}+#.]+/gu) ?? [])
    .map((w) => w.replace(/^[.]+|[.]+$/g, ""))
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));
}

export interface MatchResult {
  /** Ключови думи от обявата, намерени в CV-то (в реда на важност). */
  found: string[];
  /** Липсващи ключови думи — кандидати за добавяне, ако наистина ги владееш. */
  missing: string[];
  /** Дял на намерените, 0…100. */
  percent: number;
}

/**
 * Ключовите думи на обявата — по честота, после по реда на поява; една
 * представителна форма на основа. `limit` пази списъка четим.
 */
export function keywords(ad: string, limit = 20): string[] {
  const seen = new Map<string, { word: string; count: number; first: number }>();
  words(ad).forEach((w, i) => {
    const k = stem(w);
    const cur = seen.get(k);
    if (cur) cur.count++;
    else seen.set(k, { word: w, count: 1, first: i });
  });
  return [...seen.values()]
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .slice(0, limit)
    .map((x) => x.word);
}

export function matchCv(cvText: string, ad: string, limit = 20): MatchResult {
  const kws = keywords(ad, limit);
  const have = new Set(words(cvText).map(stem));
  const found = kws.filter((w) => have.has(stem(w)));
  const missing = kws.filter((w) => !have.has(stem(w)));
  return { found, missing, percent: kws.length ? Math.round((found.length / kws.length) * 100) : 0 };
}
