// Проверка за свежест на данните — чистата логика (без база и без server-only),
// за да се тества. Заявките към базата са в ./freshness.ts, адресът е
// GET /api/health/freshness (защитен с INGEST_TOKEN).
//
// Защо: новините 4 месеца не се обновяваха и никой не забеляза — cron-ът пращаше
// изхода си в /dev/null. За възрастен човек остаряла дежурна аптека или
// прекъсване е по-вредно от празна страница. Тук праговете са на едно място.

export const FRESHNESS_THRESHOLDS = {
  /** Нито една внесена и нито една публикувана новина за толкова дни → проблем. */
  newsDays: 7,
  /** Внесена новина чака одобрение по-дълго от толкова дни → проблем. */
  pendingDays: 3,
  /** Предупрежденията за измами не са пипани толкова дни → проблем. */
  scamDays: 90,
  /** Прекъсванията на ток/вода не са пипани толкова дни → проблем. */
  outageDays: 30,
  /** Номер в „Услуги“ не е проверяван толкова месеца → проблем. */
  serviceMonths: 6,
} as const;

export type FreshnessThresholds = { [K in keyof typeof FRESHNESS_THRESHOLDS]: number };

export type FreshnessInput = {
  now: Date;
  news: {
    /** Внесени от общината за последните `newsDays` дни. */
    imported: number;
    /** Публикувани (от всеки източник) за последните `newsDays` дни. */
    published: number;
    lastImportedAt: Date | null;
    lastPublishedAt: Date | null;
    /** Внесени новини (по шаблона), които чакат одобрение. */
    pending: number;
    oldestPendingAt: Date | null;
  };
  pharmacy: {
    /** Публикувани дежурства за днешния ден (по София). */
    today: number;
    lastDate: Date | null;
  };
  scams: { total: number; lastChangeAt: Date | null };
  outages: { total: number; lastChangeAt: Date | null };
  services: {
    total: number;
    /** Публикувани услуги без дата на проверка. */
    neverVerified: number;
    /** Публикувани услуги, проверени преди повече от `serviceMonths` месеца. */
    stale: number;
    /** До 10 имена за бърза справка (обществени услуги — не са лични данни). */
    examples: string[];
  };
};

export type FreshnessProblem = {
  code:
    | "news_not_imported"
    | "news_not_published"
    | "news_waiting_approval"
    | "pharmacy_today_missing"
    | "scams_stale"
    | "outages_stale"
    | "services_unverified";
  severity: "critical" | "warning";
  message: string;
};

export type FreshnessResult = {
  ok: boolean;
  checkedAt: string;
  problems: FreshnessProblem[];
};

const DAY = 86_400_000;

export function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY);
}

// Календарни месеци назад (31 март − 1 месец → последният ден на февруари).
export function monthsAgo(now: Date, months: number): Date {
  const d = new Date(now.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

function olderThan(d: Date | null, limit: Date): boolean {
  return !d || d.getTime() < limit.getTime();
}

function bgDate(d: Date | null): string {
  if (!d) return "никога";
  return new Intl.DateTimeFormat("bg-BG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Sofia",
  }).format(d);
}

export function evaluateFreshness(
  input: FreshnessInput,
  t: FreshnessThresholds = FRESHNESS_THRESHOLDS,
): FreshnessResult {
  const { now } = input;
  const problems: FreshnessProblem[] = [];

  if (input.news.imported === 0) {
    problems.push({
      code: "news_not_imported",
      severity: "warning",
      message: `Няма внесени новини от общината за ${t.newsDays} дни (последна: ${bgDate(input.news.lastImportedAt)}). Проверете вноса и шаблона на адресите.`,
    });
  }
  if (input.news.published === 0) {
    problems.push({
      code: "news_not_published",
      severity: "warning",
      message: `Няма публикувани новини за ${t.newsDays} дни (последна: ${bgDate(input.news.lastPublishedAt)}).`,
    });
  }
  if (input.news.pending > 0 && olderThan(input.news.oldestPendingAt, daysAgo(now, t.pendingDays))) {
    problems.push({
      code: "news_waiting_approval",
      severity: "warning",
      message: `${input.news.pending} внесени новини чакат одобрение, най-старата от ${bgDate(input.news.oldestPendingAt)}.`,
    });
  }
  if (input.pharmacy.today === 0) {
    problems.push({
      code: "pharmacy_today_missing",
      severity: "critical",
      message: `Няма въведена дежурна аптека за днес (последно дежурство: ${bgDate(input.pharmacy.lastDate)}).`,
    });
  }
  if (olderThan(input.scams.lastChangeAt, daysAgo(now, t.scamDays))) {
    problems.push({
      code: "scams_stale",
      severity: "warning",
      message: `Предупрежденията за измами не са обновявани от ${bgDate(input.scams.lastChangeAt)} (праг ${t.scamDays} дни).`,
    });
  }
  if (olderThan(input.outages.lastChangeAt, daysAgo(now, t.outageDays))) {
    problems.push({
      code: "outages_stale",
      severity: "warning",
      message: `Прекъсванията на ток и вода не са обновявани от ${bgDate(input.outages.lastChangeAt)} (праг ${t.outageDays} дни).`,
    });
  }
  const unverified = input.services.neverVerified + input.services.stale;
  if (unverified > 0) {
    const ex = input.services.examples.slice(0, 10);
    problems.push({
      code: "services_unverified",
      severity: "warning",
      message:
        `${unverified} от ${input.services.total} номера в „Услуги“ не са проверени последните ${t.serviceMonths} месеца ` +
        `(${input.services.neverVerified} никога)` +
        (ex.length ? `: ${ex.join(", ")}${unverified > ex.length ? "…" : ""}.` : "."),
    });
  }

  return { ok: problems.length === 0, checkedAt: now.toISOString(), problems };
}

// Текст за имейл/лог — само обобщение, без лични данни.
export function freshnessText(r: FreshnessResult): string {
  if (r.ok) return `Свежест: всичко е наред (${r.checkedAt}).`;
  return [
    `Свежест: ${r.problems.length} проблема (${r.checkedAt}).`,
    ...r.problems.map((p) => `- [${p.severity === "critical" ? "СПЕШНО" : "внимание"}] ${p.message}`),
  ].join("\n");
}
