// Именни дни и църковни празници (православен календар).
//
// Данните покриват най-разпространените в България имена и празници. Списъкът
// не е изчерпателен — ако нечие име липсва, добавя се с един ред в NAME_DAYS.
// Подвижните празници (Лазаровден, Цветница, Великден) се изчисляват спрямо
// православния Великден за съответната година.

export type DayInfo = {
  /** Имена, които празнуват на тази дата. */
  names: string[];
  /** Църковни празници на тази дата. */
  feasts: string[];
};

// Фиксирани именни дни по дата „MM-DD" → имена.
const NAME_DAYS: Record<string, string[]> = {
  "01-01": ["Васил", "Василка", "Веселин", "Веселина", "Василена"],
  "01-06": ["Йордан", "Йорданка", "Богдан", "Боян", "Дана"],
  "01-07": ["Иван", "Иванка", "Йоан", "Калоян", "Жан", "Ивайло"],
  "01-17": ["Антон", "Андон", "Антония", "Тончо", "Тоня"],
  "01-18": ["Атанас", "Атанаска", "Наско", "Тошко"],
  "01-25": ["Григор", "Григория"],
  "02-01": ["Трифон", "Трифонка"],
  "02-03": ["Симеон", "Симона"],
  "02-10": ["Харалампи", "Хараламби"],
  "02-17": ["Теодор", "Тодор", "Тодорка"],
  "03-01": ["Марта", "Мартин", "Евдокия"],
  "03-09": ["Младен", "Камен", "Светлозар"],
  "03-25": ["Благовест", "Благовеста", "Блага"],
  "04-23": ["Лорета"],
  "05-02": ["Боян", "Бойко", "Бойка"],
  "05-05": ["Ирина", "Ирена"],
  "05-06": ["Георги", "Гергана", "Ганчо", "Гошо", "Гена", "Галя"],
  "05-11": ["Кирил", "Методи", "Методий"],
  "05-21": ["Константин", "Елена", "Костадин", "Кольо", "Косто", "Елеонора"],
  "06-29": ["Петър", "Павел", "Пейо", "Петрана", "Павлина", "Камен"],
  "07-01": ["Козма", "Дамян"],
  "07-17": ["Марина"],
  "07-20": ["Илия", "Илиян", "Илияна", "Илина"],
  "07-26": ["Параскева", "Павел"],
  "08-15": ["Мария", "Магдалена", "Марийка", "Мариана", "Мариета"],
  "08-30": ["Александър", "Александра", "Алекс", "Сашо", "Сандра"],
  "09-05": ["Захари", "Захарина"],
  "09-08": ["Богородица"],
  "09-14": ["Кръстю", "Кръстьо", "Стамен", "Стамена"],
  "09-17": ["Вяра", "Надежда", "Любов", "София", "Любомир", "Любка"],
  "10-14": ["Петкана", "Петко", "Параскева", "Пенка", "Пена"],
  "10-26": ["Димитър", "Димитрина", "Митко", "Деян", "Демир"],
  "11-08": ["Ангел", "Михаил", "Гавраил", "Архангел", "Радостин", "Мишо", "Огнян"],
  "11-11": ["Мина", "Минко", "Минчо"],
  "11-14": ["Филип"],
  "11-25": ["Екатерина", "Катерина", "Катя"],
  "11-30": ["Андрей", "Андриана", "Първан"],
  "12-04": ["Варвара", "Варадин"],
  "12-05": ["Сава", "Савка"],
  "12-06": ["Никола", "Николина", "Кольо", "Нина", "Николай"],
  "12-09": ["Анна", "Ани", "Яна"],
  "12-12": ["Спиридон", "Спас"],
  "12-20": ["Игнат", "Игнатий"],
  "12-25": ["Христо", "Христина", "Радко", "Радослав", "Радостина"],
  "12-27": ["Стефан", "Стефка", "Стефания", "Стоян", "Стоянка"],
};

// Фиксирани църковни празници „MM-DD" → име на празника.
const FIXED_FEASTS: Record<string, string> = {
  "01-01": "Васильовден (Нова година)",
  "01-06": "Богоявление (Йордановден)",
  "01-07": "Ивановден",
  "02-02": "Сретение Господне",
  "03-25": "Благовещение",
  "05-06": "Гергьовден (Ден на храбростта)",
  "05-11": "Св. св. Кирил и Методий",
  "05-21": "Св. св. Константин и Елена",
  "06-29": "Петровден",
  "07-20": "Илинден",
  "08-15": "Успение Богородично (Голяма Богородица)",
  "09-08": "Рождество Богородично (Малка Богородица)",
  "09-14": "Кръстовден",
  "10-26": "Димитровден",
  "11-08": "Архангеловден",
  "11-21": "Въведение Богородично",
  "12-06": "Никулден",
  "12-25": "Рождество Христово (Коледа)",
  "12-26": "Събор на Пресвета Богородица",
};

// Имена, които празнуват на Лазаровден / Цветница (подвижни — „цветни" имена).
const FLOWER_NAMES = [
  "Цвета", "Цветан", "Цветана", "Цветанка", "Цветелина", "Лазар", "Връбка",
  "Калина", "Невена", "Виолета", "Маргарита", "Роза", "Камелия", "Латинка",
  "Теменужка", "Йоана", "Лиляна", "Лила", "Здравко", "Здравка",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Православен Великден (по григориански календар) за дадена година.
 * Алгоритъм на Мееус за юлианската дата + отместване от 13 дни (1900–2099).
 */
export function orthodoxEaster(year: number): { month: number; day: number } {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31); // 3 = март, 4 = април (юлиански)
  const day = ((d + e + 114) % 31) + 1;
  const julian = new Date(Date.UTC(year, month - 1, day));
  julian.setUTCDate(julian.getUTCDate() + 13); // юлиански → григориански
  return { month: julian.getUTCMonth() + 1, day: julian.getUTCDate() };
}

// „MM-DD" за дата (по UTC компонентите на подадената дата).
function key(month: number, day: number): string {
  return `${pad2(month)}-${pad2(day)}`;
}

// Подвижни „MM-DD" ключове за годината → имена/празник.
function movableForYear(year: number): {
  lazar: string;
  flowers: string;
  easter: string;
} {
  const e = orthodoxEaster(year);
  const easter = new Date(Date.UTC(year, e.month - 1, e.day));
  const flowers = new Date(easter);
  flowers.setUTCDate(flowers.getUTCDate() - 7); // Цветница
  const lazar = new Date(easter);
  lazar.setUTCDate(lazar.getUTCDate() - 8); // Лазаровден
  return {
    lazar: key(lazar.getUTCMonth() + 1, lazar.getUTCDate()),
    flowers: key(flowers.getUTCMonth() + 1, flowers.getUTCDate()),
    easter: key(easter.getUTCMonth() + 1, easter.getUTCDate()),
  };
}

/** Информация (имена + празници) за конкретен месец/ден от дадена година. */
export function dayInfo(year: number, month: number, day: number): DayInfo {
  const k = key(month, day);
  const names = [...(NAME_DAYS[k] ?? [])];
  const feasts: string[] = [];
  if (FIXED_FEASTS[k]) feasts.push(FIXED_FEASTS[k]);

  const mov = movableForYear(year);
  if (k === mov.lazar) {
    feasts.push("Лазаровден");
    names.push("Лазар", "Лазарина");
  }
  if (k === mov.flowers) {
    feasts.push("Цветница (Връбница)");
    for (const n of FLOWER_NAMES) if (!names.includes(n)) names.push(n);
  }
  if (k === mov.easter) feasts.push("Великден (Възкресение Христово)");

  return { names, feasts };
}

const WEEKDAYS = ["неделя", "понеделник", "вторник", "сряда", "четвъртък", "петък", "събота"];
const MONTHS = [
  "януари", "февруари", "март", "април", "май", "юни",
  "юли", "август", "септември", "октомври", "ноември", "декември",
];

/** Дата (год./месец/ден/делник) за „днес" в часовата зона на София. */
export function sofiaToday(now: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  weekday: number;
} {
  // en-CA дава „YYYY-MM-DD"; weekday чрез отделен формат.
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = ymd.split("-").map(Number);
  const wdName = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Sofia",
    weekday: "short",
  }).format(now);
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wdName);
  return { year: y, month: m, day: d, weekday: wd };
}

/** Човешко изписване на дата, напр. „понеделник, 6 май". */
export function formatDateBg(month: number, day: number, weekday: number): string {
  return `${WEEKDAYS[weekday]}, ${day} ${MONTHS[month - 1]}`;
}

/** Предстоящи именни дни в следващите `days` дни (вкл. днес). */
export function upcomingNameDays(
  from: { year: number; month: number; day: number },
  days = 30,
): { month: number; day: number; weekday: number; names: string[]; feasts: string[] }[] {
  const out: { month: number; day: number; weekday: number; names: string[]; feasts: string[] }[] = [];
  const start = new Date(Date.UTC(from.year, from.month - 1, from.day));
  for (let i = 0; i < days; i++) {
    const cur = new Date(start);
    cur.setUTCDate(cur.getUTCDate() + i);
    const y = cur.getUTCFullYear();
    const m = cur.getUTCMonth() + 1;
    const d = cur.getUTCDate();
    const info = dayInfo(y, m, d);
    if (info.names.length === 0 && info.feasts.length === 0) continue;
    out.push({ month: m, day: d, weekday: cur.getUTCDay(), names: info.names, feasts: info.feasts });
  }
  return out;
}

/** Намира на коя дата (или дати) се пада именният ден на дадено име. */
export function findNameDay(name: string, year: number): { month: number; day: number }[] {
  const q = name.trim().toLowerCase();
  if (q.length < 2) return [];
  const hits: { month: number; day: number }[] = [];
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= 31; d++) {
      const date = new Date(Date.UTC(year, m - 1, d));
      if (date.getUTCMonth() + 1 !== m) continue; // невалидна дата (напр. 31 февр.)
      const info = dayInfo(year, m, d);
      if (info.names.some((n) => n.toLowerCase() === q)) hits.push({ month: m, day: d });
    }
  }
  return hits;
}
