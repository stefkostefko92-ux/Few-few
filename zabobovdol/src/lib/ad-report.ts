// Отчет за рекламодателя — чистата сметка (без база и без server-only), за да
// може да се тества. Данните идват от DailyStat (./ad-report-data.ts).
//
// Какво се брои и какво НЕ:
// - „Показване“ на банер = отваряне (view) на страница, на която стоят банерите.
//   Днес банерите са само на началната („/“), и там всички (до 4) се виждат
//   заедно — затова прегледите на началната са показванията на ВСЕКИ банер.
//   Това е горна граница: банерите са по-надолу и не всеки превърта до тях.
// - „Клик“ = събитие banner_click от същите страници. track() праща само пътя на
//   страницата, не кой банер е натиснат — затова кликовете са общо за всички
//   банери и се делят поравно, когато смятаме средна цена на клик.
// - Само броеве на ден. Никакви данни за отделни хора.

/** Страниците, на които стоят банерите (импресии = прегледите им). */
export const AD_PAGES: readonly string[] = ["/"];

/** Под този брой числата са ориентировъчни (същият праг като в плана: n≥20). */
export const MIN_SAMPLE = 20;

export type StatRow = { day: Date; metric: string; path: string; count: number };

export type MonthReport = {
  month: string; // "2026-10"
  label: string; // „октомври 2026“
  partial: boolean; // текущият, още незавършен месец
  daysCounted: number; // колко дни от месеца влизат в сметката
  daysInMonth: number;
  priceCents: number; // цената за слот за отчетения период (за непълен месец — пропорционално)
  views: number; // показвания на всеки банер (прегледи на страниците с банери)
  clicks: number; // кликове по всички банери общо
  banners: number; // колко банера делят кликовете
  clicksPerBanner: number | null;
  ctr: number | null; // дял на кликовете от показванията на един банер (0..1)
  cpmCents: number | null; // цена на 1000 показвания за един банер
  cpcCents: number | null; // средна цена на един клик
  lowViews: boolean; // по-малко от MIN_SAMPLE прегледа
  lowClicks: boolean; // по-малко от MIN_SAMPLE клика
};

const MONTHS_BG = [
  "януари",
  "февруари",
  "март",
  "април",
  "май",
  "юни",
  "юли",
  "август",
  "септември",
  "октомври",
  "ноември",
  "декември",
];

// Ключът на месеца. DailyStat.day е полунощ UTC на деня по София (sofiaDay),
// така че UTC частите са точно българската дата.
export function monthKey(day: Date): string {
  return day.toISOString().slice(0, 7);
}

function parseMonth(key: string): { y: number; m: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) throw new Error(`Невалиден месец: ${key}`);
  return { y: Number(match[1]), m: Number(match[2]) };
}

/** Първият ден на месеца (полунощ UTC — като DailyStat.day). */
export function monthStart(key: string): Date {
  const { y, m } = parseMonth(key);
  return new Date(Date.UTC(y, m - 1, 1));
}

/** Първият ден на СЛЕДВАЩИЯ месец (изключителна горна граница). */
export function monthEnd(key: string): Date {
  const { y, m } = parseMonth(key);
  return new Date(Date.UTC(y, m, 1));
}

export function daysInMonth(key: string): number {
  const { y, m } = parseMonth(key);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthLabel(key: string): string {
  const { y, m } = parseMonth(key);
  return `${MONTHS_BG[m - 1]} ${y}`;
}

/**
 * Последните `n` месеца, най-новият първи. `today` е денят по София
 * (sofiaDay(), полунощ UTC), за да не сменяме месеца по часа на сървъра.
 */
export function lastMonths(today: Date, n: number): string[] {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(y, m - i, 1));
    out.push(monthKey(d));
  }
  return out;
}

/**
 * Колко банера е имало в месеца — по сегашните публикувани банери и датата им
 * на създаване (банер, създаден до края на месеца, се брои). Свалени банери не
 * са известни, затова числото е приблизително.
 */
export function bannersInMonth(createdAts: Date[], key: string): number {
  const end = monthEnd(key).getTime();
  return createdAts.filter((d) => d.getTime() < end).length;
}

/** Цената в цели евроцентове (без float грешки при деленето). */
export function toCents(eur: number): number {
  if (!Number.isFinite(eur) || eur <= 0) return 0;
  return Math.round(eur * 100);
}

export type BuildOptions = {
  today: Date; // sofiaDay()
  months: number; // колко месеца назад (включително текущия)
  priceEur: number; // текущата месечна цена за един банер (getAdSettings)
  bannersFor: (month: string) => number;
  pages?: readonly string[];
};

export function buildAdReport(rows: StatRow[], opts: BuildOptions): MonthReport[] {
  const pages = new Set(opts.pages ?? AD_PAGES);
  const views = new Map<string, number>();
  const clicks = new Map<string, number>();
  for (const r of rows) {
    if (!pages.has(r.path)) continue;
    const count = Number.isFinite(r.count) && r.count > 0 ? Math.floor(r.count) : 0;
    if (count === 0) continue;
    const key = monthKey(r.day);
    if (r.metric === "view") views.set(key, (views.get(key) ?? 0) + count);
    else if (r.metric === "banner_click") clicks.set(key, (clicks.get(key) ?? 0) + count);
  }

  const fullPrice = toCents(opts.priceEur);
  const current = monthKey(opts.today);

  return lastMonths(opts.today, opts.months).map((month) => {
    const total = daysInMonth(month);
    const partial = month === current;
    const counted = partial ? opts.today.getUTCDate() : total;
    // Непълен месец: сравняваме с частта от цената за изминалите дни, иначе
    // цената на 1000 показвания би изглеждала по-висока, отколкото е.
    const priceCents = partial ? Math.round((fullPrice * counted) / total) : fullPrice;
    const v = views.get(month) ?? 0;
    const c = clicks.get(month) ?? 0;
    const declared = Math.max(0, Math.floor(opts.bannersFor(month)));
    // Има кликове, но банерът вече е свален → поне един банер е имало.
    const banners = c > 0 ? Math.max(1, declared) : declared;

    return {
      month,
      label: monthLabel(month),
      partial,
      daysCounted: counted,
      daysInMonth: total,
      priceCents,
      views: v,
      clicks: c,
      banners,
      clicksPerBanner: banners > 0 ? c / banners : null,
      ctr: v > 0 && banners > 0 ? c / (v * banners) : null,
      cpmCents: v > 0 && priceCents > 0 ? Math.round((priceCents * 1000) / v) : null,
      cpcCents: c > 0 && priceCents > 0 ? Math.round((priceCents * banners) / c) : null,
      lowViews: v < MIN_SAMPLE,
      lowClicks: c < MIN_SAMPLE,
    };
  });
}

// ── Форматиране (детерминистично, без зависимост от ICU на сървъра) ─────────

const NBSP = " ";

/** 1234567 → „1 234 567“ (с неразделящ интервал). */
export function formatInt(n: number): string {
  const s = String(Math.round(Math.abs(n)));
  const grouped = s.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return n < 0 ? `-${grouped}` : grouped;
}

/** 1621 → „16,21 €“. */
export function formatEur(cents: number): string {
  const whole = Math.trunc(cents / 100);
  const rest = String(Math.abs(cents % 100)).padStart(2, "0");
  return `${formatInt(whole)},${rest}${NBSP}€`;
}

/** 0.01234 → „1,2 %“. */
export function formatPercent(share: number): string {
  const v = Math.round(share * 1000) / 10;
  return `${v.toFixed(1).replace(".", ",")}${NBSP}%`;
}

/** 4.5 → „4,5“; 4 → „4“. */
export function formatDecimal(n: number): string {
  const v = Math.round(n * 10) / 10;
  return Number.isInteger(v) ? formatInt(v) : v.toFixed(1).replace(".", ",");
}

function times(n: number): string {
  return n === 1 ? "1 път" : `${formatInt(n)} пъти`;
}

/**
 * Готов текст за рекламодателя — администраторът го копира и изпраща.
 * Само общи броеве; нищо за отделни хора.
 */
export function advertiserText(r: MonthReport, siteName: string, priceEur: number): string {
  const period = r.partial
    ? `От 1 до ${r.daysCounted} ${MONTHS_BG[parseMonth(r.month).m - 1]} ${parseMonth(r.month).y}`
    : `През ${r.label}`;
  const parts: string[] = [];
  parts.push(
    `${period} началната страница на „${siteName}“ е отворена ${times(r.views)}. Толкова пъти се показва всеки банер на нея.`,
  );
  if (r.banners > 0) {
    const avg =
      r.banners > 1 && r.clicksPerBanner !== null
        ? ` (средно ${formatDecimal(r.clicksPerBanner)} на банер при ${r.banners} банера)`
        : "";
    parts.push(`Банерите са натиснати общо ${times(r.clicks)}${avg}.`);
  }
  const price = formatEur(toCents(priceEur));
  if (r.cpmCents !== null) {
    const cpc = r.cpcCents !== null ? ` и средно ${formatEur(r.cpcCents)} на клик` : "";
    const base = r.partial ? `${price} на месец (за изминалите дни — ${formatEur(r.priceCents)})` : `${price} на месец`;
    parts.push(`При цена ${base} това е ${formatEur(r.cpmCents)} на 1000 показвания${cpc}.`);
  }
  if (r.lowViews || (r.banners > 0 && r.lowClicks)) {
    parts.push("Данните още са малко, затова числата са ориентировъчни.");
  }
  parts.push("Броим само общия брой отваряния и кликове на ден — без бисквитки и без данни за отделни хора.");
  return parts.join(" ");
}
