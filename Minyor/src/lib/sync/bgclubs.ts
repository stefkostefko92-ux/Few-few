import "server-only";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import { SITE } from "@/lib/site";

// ─────────────────────────────────────────────────────────────────────────────
//  Автоматично черпене на програма, резултати, „следващ мач" и класиране на
//  ФК „Миньор" Бобов дол от bgclubs.eu.
//
//  Източникът е неофициален (публичен футболен справочник). Парсингът разчита
//  на структурата на страниците на отборите: първа таблица = календар
//  (Дата | Кръг | Фаза „Д"/„Г" | Противник | Резултат), а резултатът е в
//  ориентация „отбор:съперник". Класирането се изчислява от резултатите на
//  всички отбори в групата (по една заявка на отбор), за да е устойчиво на
//  промени в състава на групата.
//
//  Всичко, въведено ръчно през админа, остава недокоснато: синхронизацията
//  управлява само записите със source = "bgclubs".
// ─────────────────────────────────────────────────────────────────────────────

const BASE = "https://bgclubs.eu";
const OWN_SLUG = "Minyor2019(Bobovdol)";
const SOURCE = "bgclubs";
const UA = "MinyorBobovDolBot/1.0 (+https://minyor.carbonstealth.eu)";

export type SyncSummary = {
  ok: boolean;
  matches: number;
  standings: number;
  competition?: string;
  season?: string;
  error?: string;
};

// ── HTTP ──
async function fetchHtml(slug: string): Promise<string> {
  const url = `${BASE}/teams/${encodeURIComponent(slug)}`;
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "text/html" },
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} за ${slug}`);
  const text = await res.text();
  // Защита в дълбочина: ограничаваме размера на чуждия вход преди да го парсваме
  // с регулярни изрази (предпазва event loop-а от прекомерна работа).
  if (text.length > 2_000_000) {
    throw new Error(`Прекалено голям отговор за ${slug} (${text.length} байта)`);
  }
  return text;
}

// ── HTML помощници (без външни зависимости) ──
function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}
function tables(html: string): string[] {
  return html.match(/<table[\s\S]*?<\/table>/gi) ?? [];
}
function rows(table: string): string[] {
  return table.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
}
function cells(row: string): string[] {
  const m = row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) ?? [];
  return m.map(stripTags);
}

const DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/;
const RESULT_RE = /^(\d{1,3})\s*:\s*(\d{1,3})$/;

type Fixture = {
  kickoff: Date;
  round: string | null;
  isHome: boolean;
  opponent: string;
  ourGoals: number | null;
  theirGoals: number | null;
};

// Парсва календара (първата таблица) на страница на отбор.
function parseFixtures(html: string): { fixtures: Fixture[]; competition: string | null } {
  const tbls = tables(html);
  if (tbls.length === 0) return { fixtures: [], competition: null };
  const tbl = tbls[0];

  // Заглавие на групата = първата клетка на първия ред.
  const firstRowCells = cells(rows(tbl)[0] ?? "");
  const competition = firstRowCells[0]
    ? firstRowCells[0].replace(/"([^"]*)"/g, "„$1“").trim()
    : null;

  const fixtures: Fixture[] = [];
  for (const r of rows(tbl)) {
    const c = cells(r);
    const dm = c[0] ? DATE_RE.exec(c[0]) : null;
    if (!dm) continue; // прескача заглавия и редовете „почива"
    const [, dd, mm, yyyy, hh, min] = dm;
    const kickoff = new Date(
      Date.UTC(
        Number(yyyy),
        Number(mm) - 1,
        Number(dd),
        hh ? Number(hh) : 12,
        min ? Number(min) : 0,
      ),
    );
    const faza = (c[2] ?? "").trim();
    if (faza !== "Д" && faza !== "Г") continue; // не е изигран/валиден ред
    const opponent = (c[3] ?? "").trim();
    if (!opponent || /почива/i.test(opponent)) continue;
    const rm = c[4] ? RESULT_RE.exec(c[4].trim()) : null;
    fixtures.push({
      kickoff,
      round: (c[1] ?? "").trim() || null,
      isHome: faza === "Д",
      opponent,
      ourGoals: rm ? Number(rm[1]) : null,
      theirGoals: rm ? Number(rm[2]) : null,
    });
  }
  return { fixtures, competition };
}

// Извлича състава на групата като карта „име на отбор → bgclubs slug".
// Парсингът е на два прости, ЛИНЕЙНИ прохода (анкер → атрибути/текст, после
// href → slug), за да няма катастрофален backtracking при чужд/зловреден HTML.
function parseTeamLinks(html: string): Map<string, string> {
  const map = new Map<string, string>();
  const anchorRe = /<a\b([^>]*)>([^<]*)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html))) {
    const name = stripTags(m[2]);
    if (!name) continue;
    const href = /href="([^"]*)"/i.exec(m[1]);
    if (!href) continue;
    const team = /\/teams\/([^"#?]+)/.exec(href[1]);
    if (!team) continue;
    const slug = decodeURIComponent(team[1]).trim();
    if (slug && !map.has(name)) map.set(name, slug);
  }
  return map;
}

type TeamStanding = {
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
};

// Изчислява статистиката на отбор от собствените му изиграни мачове.
function computeTeam(name: string, fixtures: Fixture[]): TeamStanding {
  const t: TeamStanding = {
    teamName: name,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
  };
  for (const f of fixtures) {
    if (f.ourGoals == null || f.theirGoals == null) continue;
    t.played++;
    t.goalsFor += f.ourGoals;
    t.goalsAgainst += f.theirGoals;
    if (f.ourGoals > f.theirGoals) {
      t.won++;
      t.points += 3;
    } else if (f.ourGoals === f.theirGoals) {
      t.drawn++;
      t.points += 1;
    } else {
      t.lost++;
    }
  }
  return t;
}

function seasonLabel(fixtures: Fixture[]): string {
  const years = fixtures.map((f) => f.kickoff.getUTCFullYear()).sort();
  if (years.length === 0) return "";
  const start = years[0];
  const end = years[years.length - 1];
  return start === end ? String(start) : `${start}/${end}`;
}

// ── Запис в базата ──
async function runSyncInternal(): Promise<SyncSummary> {
  // 1) Страница на „Миньор" → собствен календар + състав на групата.
  const ownHtml = await fetchHtml(OWN_SLUG);
  const { fixtures: ownFixtures, competition } = parseFixtures(ownHtml);
  if (ownFixtures.length === 0) {
    throw new Error("Не бяха намерени мачове в източника (промяна в структурата?).");
  }
  const season = seasonLabel(ownFixtures);
  const ownName = "Миньор 2019 (Бобов дол)";

  // Състав на групата = противниците на „Миньор" + самият клуб, със slug-ове.
  const linkMap = parseTeamLinks(ownHtml);
  const opponents = Array.from(new Set(ownFixtures.map((f) => f.opponent)));

  // 2) Изчисляване на класирането от резултатите на всеки отбор в групата.
  const teamStats: TeamStanding[] = [];
  // Самият „Миньор" — от вече изтегления календар.
  teamStats.push(computeTeam(ownName, ownFixtures));
  await Promise.all(
    opponents.map(async (name) => {
      const slug = linkMap.get(name);
      if (!slug) return; // няма връзка → пропускаме (ще липсва ред, но без срив)
      try {
        const html = await fetchHtml(slug);
        const { fixtures } = parseFixtures(html);
        teamStats.push(computeTeam(name, fixtures));
      } catch {
        /* недостъпна страница на отбор — пропускаме */
      }
    }),
  );

  // Подреждане: точки → голова разлика → вкарани голове → име.
  teamStats.sort((a, b) => {
    const gdA = a.goalsFor - a.goalsAgainst;
    const gdB = b.goalsFor - b.goalsAgainst;
    return (
      b.points - a.points ||
      gdB - gdA ||
      b.goalsFor - a.goalsFor ||
      a.teamName.localeCompare(b.teamName, "bg")
    );
  });

  // 3) Запис на мачовете (upsert по externalRef; прочистване на остарели).
  const refs: string[] = [];
  for (const f of ownFixtures) {
    const day = f.kickoff.toISOString().slice(0, 10).replace(/-/g, "");
    const ref = `bgclubs:${day}:${f.isHome ? "H" : "A"}:${slugify(f.opponent)}`;
    refs.push(ref);
    const finished = f.ourGoals != null && f.theirGoals != null;
    const homeGoals = finished ? (f.isHome ? f.ourGoals : f.theirGoals) : null;
    const awayGoals = finished ? (f.isHome ? f.theirGoals : f.ourGoals) : null;
    const data = {
      opponent: f.opponent,
      isHome: f.isHome,
      competition: competition ?? "Областна група Кюстендил",
      season,
      round: f.round,
      kickoff: f.kickoff,
      venue: f.isHome ? SITE.stadium.name : null,
      status: (finished ? "FINISHED" : "SCHEDULED") as "FINISHED" | "SCHEDULED",
      homeGoals,
      awayGoals,
      published: true,
      source: SOURCE,
    };
    await prisma.match.upsert({
      where: { externalRef: ref },
      create: { ...data, externalRef: ref },
      update: data,
    });
  }
  await prisma.match.deleteMany({
    where: { source: SOURCE, externalRef: { notIn: refs } },
  });

  // 4) Запис на класирането (замяна на синхронизираните редове).
  await prisma.standingRow.deleteMany({ where: { source: SOURCE } });
  if (teamStats.length > 0) {
    await prisma.standingRow.createMany({
      data: teamStats.map((t, i) => ({
        season,
        position: i + 1,
        teamName: t.teamName,
        played: t.played,
        won: t.won,
        drawn: t.drawn,
        lost: t.lost,
        goalsFor: t.goalsFor,
        goalsAgainst: t.goalsAgainst,
        points: t.points,
        isOwnTeam: t.teamName === ownName,
        published: true,
        source: SOURCE,
      })),
    });
  }

  return {
    ok: true,
    matches: refs.length,
    standings: teamStats.length,
    competition: competition ?? undefined,
    season,
  };
}

// Записва статуса от последната синхронизация (за админ панела).
async function recordStatus(summary: SyncSummary) {
  const now = new Date().toISOString();
  const status = summary.ok
    ? `Успешно: ${summary.matches} мача, ${summary.standings} отбора в класирането`
    : `Грешка: ${summary.error ?? "неизвестна"}`;
  try {
    await prisma.$transaction([
      prisma.siteSetting.upsert({
        where: { key: "syncLastRun" },
        create: { key: "syncLastRun", value: now },
        update: { value: now },
      }),
      prisma.siteSetting.upsert({
        where: { key: "syncLastStatus" },
        create: { key: "syncLastStatus", value: status },
        update: { value: status },
      }),
    ]);
  } catch {
    /* без статус — не е критично */
  }
}

// Срок на съхранение на съобщенията от контакти (виж Политиката за
// поверителност). Изтриваме автоматично по-старите при всяка синхронизация.
const CONTACT_RETENTION_DAYS = 365;
async function pruneOldContactMessages(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - CONTACT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await prisma.contactMessage.deleteMany({ where: { createdAt: { lt: cutoff } } });
  } catch {
    /* не критично за синхронизацията */
  }
}

// Прост in-process lock: cron и бутонът „Обнови сега" могат да съвпаднат;
// без него два паралелни прохода биха дублирали редовете в класирането
// (StandingRow няма уникален ключ). Пази единствен активен проход на процес.
let syncInProgress = false;

// Публична входна точка: изпълнява синхронизацията и записва статуса.
export async function runSync(): Promise<SyncSummary> {
  if (syncInProgress) {
    return {
      ok: false,
      matches: 0,
      standings: 0,
      error: "Синхронизацията вече е в ход. Опитайте отново след малко.",
    };
  }
  syncInProgress = true;
  try {
    const summary = await runSyncInternal();
    await pruneOldContactMessages();
    await recordStatus(summary);
    return summary;
  } catch (err) {
    const summary: SyncSummary = {
      ok: false,
      matches: 0,
      standings: 0,
      error: err instanceof Error ? err.message : String(err),
    };
    await recordStatus(summary);
    return summary;
  } finally {
    syncInProgress = false;
  }
}
