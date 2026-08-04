/**
 * Следствена справка — превръща една IP справка в ПРАВИЛНО искане до оператора.
 *
 * Изходната точка е неудобна истина: **IP адресът не води до човек по технически
 * път.** Никаква гео база не дава адрес на жилище; тя дава район с километри
 * грешка. Единственият надежден път минава през оператора, който държи
 * абонатните записи — и той отговаря само на законно искане.
 *
 * Затова този модул не се опитва да „локализира". Той прави другото, което
 * реално спестява време и грешки: проверява дали искането изобщо може да
 * успее, и казва какво липсва, преди да е изпратено. Три причини едно искане
 * да се върне празно:
 *
 * 1. **Няма точен времеви печат с часова зона.** Динамичните адреси се
 *    преразпределят; същият адрес е бил у различен абонат преди час.
 * 2. **CGNAT без източников порт.** Зад един публичен адрес стоят хиляди
 *    абонати едновременно — без порт операторът няма как да избере един.
 * 3. **Наблюдението е по-старо от срока на съхранение** у оператора.
 *
 * Модулът е чист и тестван. Не изпраща нищо и не решава нищо — само подрежда.
 */

import { inCidr, type ParsedIp } from "./ip";
import type { LookupReport } from "./lookup";

export interface CaseInput {
  /**
   * Кога е наблюдаван адресът. Без това искането е безсмислено — това е
   * най-често пропусканото поле и най-честата причина за празен отговор.
   */
  observedAt: Date | null;
  /** Часовата зона на наблюдението (IANA име). Логовете лъжат без нея. */
  timezone: string;
  /** Източников порт. При CGNAT е задължителен, не желателен. */
  sourcePort: number | null;
  /** Номер на преписка — влиза в одиторския дневник. */
  caseRef: string;
}

export type Certainty = "сигурно" | "вероятно" | "възможно";

export interface CgnatAssessment {
  suspected: boolean;
  certainty: Certainty;
  reason: string;
}

export interface Requirement {
  key: string;
  label: string;
  /** Изпълнено ли е от наличния вход. */
  satisfied: boolean;
  mandatory: boolean;
  why: string;
}

export interface InvestigativeBrief {
  operator: {
    network?: string;
    organisation?: string;
    asn?: number;
    asName?: string;
    abuseEmail?: string;
    registry?: string;
    registryCountry?: string;
  };
  cgnat: CgnatAssessment;
  requirements: Requirement[];
  /** Причини искането да се върне празно — подредени по тежест. */
  blockers: string[];
  /** Черновата на искането. Проверява се от юрист, не се изпраща както е. */
  draft: string;
}

/**
 * Срок, след който отговор „няма данни" е очакван, а не подозрителен.
 *
 * Стойността НЕ е универсална и подлежи на проверка при всяко дело: режимът за
 * съхранение на данни за трафик в ЕС е обявяван за противоречащ на правото на
 * Съюза няколко пъти (C-293/12 Digital Rights Ireland, C-203/15 Tele2,
 * C-511/18 La Quadrature du Net), а националните правила се менят. Затова тук
 * стои като настройка с изричен коментар, а не като закон.
 */
export const DEFAULT_RETENTION_DAYS = 180;

// ── Време ─────────────────────────────────────────────────────────────────

/**
 * Отместването на дадена зона към даден момент, в милисекунди.
 *
 * Ползва `Intl` вместо таблица с отмествания: лятното време се мени по
 * политическо решение, а `Intl` носи актуалната база на средата.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const field = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  // `hour` идва като 24 при полунощ в някои среди — нормализираме.
  const hour = field("hour") % 24;
  const asUtc = Date.UTC(
    field("year"),
    field("month") - 1,
    field("day"),
    hour,
    field("minute"),
    field("second"),
  );
  return asUtc - instant.getTime();
}

/**
 * Стенен часовник в дадена зона → момент в UTC.
 *
 * Това е точката, в която едно искане до оператор се проваля най-тихо: часът от
 * протокола е местен, логът на оператора е в неговата зона, а разликата е часове.
 * Затова превръщането е изрично и тествано, а не „предполагаме, че е местно“.
 *
 * `wallClock` е във формата на `datetime-local`: `2026-08-01T13:00` (без зона).
 */
export function wallClockToUtc(wallClock: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(wallClock.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? "0");

  // `Date.UTC` мълчаливо превърта: „13-и месец, 45-о число, 99-и час" става
  // валидна дата някъде напред. За искане до оператор това е по-лошо от грешка —
  // дава правдоподобен, но грешен интервал. Затова диапазоните се проверяват.
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;

  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  if (!Number.isFinite(naive)) return null;
  // Хваща и 30 февруари: превъртяната дата не съвпада с въведената.
  const check = new Date(naive);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;

  try {
    // Две итерации: първата отгатва отместването, втората го поправя, ако
    // моментът се окаже от другата страна на смяната на лятното време.
    let guess = new Date(naive - zoneOffsetMs(new Date(naive), timeZone));
    guess = new Date(naive - zoneOffsetMs(guess, timeZone));
    return Number.isNaN(guess.getTime()) ? null : guess;
  } catch {
    // Непозната зона — по-добре нищо, отколкото мълчаливо погрешен час.
    return null;
  }
}

// ── CGNAT ─────────────────────────────────────────────────────────────────

/** Шаблони в PTR името, издаващи мобилна или операторска NAT инфраструктура. */
const CGNAT_HOSTNAME_HINTS = [
  "cgn",
  "cg-nat",
  "nat",
  "gprs",
  "umts",
  "lte",
  "mobile",
  "mobil",
  "wireless",
  "pool",
];

const MOBILE_AS_HINTS = ["mobile", "mobil", "gsm", "telecom", "cellular", "wireless"];

/**
 * Заподозрян ли е операторски NAT?
 *
 * Нарочно НЕ твърдим повече, отколкото знаем. Публичният адрес на CGNAT изглежда
 * като всеки друг публичен адрес — отвън разликата не се вижда със сигурност.
 * Затова изходът носи степен на увереност, а интерфейсът показва точно нея.
 */
export function assessCgnat(ip: ParsedIp, report: LookupReport): CgnatAssessment {
  // Единственият случай без съмнение: самият адрес е в споделения блок.
  if (inCidr(ip.bytes, "100.64.0.0/10")) {
    return {
      suspected: true,
      certainty: "сигурно",
      reason:
        "Адресът е в блока за операторски NAT (100.64.0.0/10, RFC 6598). Зад него стоят много абонати едновременно.",
    };
  }

  const names = report.ptr?.data?.names ?? [];
  const hostname = names.join(" ").toLowerCase();
  const hit = CGNAT_HOSTNAME_HINTS.find((hint) => hostname.includes(hint));
  if (hit) {
    return {
      suspected: true,
      certainty: "вероятно",
      reason: `Обратното име съдържа „${hit}“ — шаблон, типичен за операторски NAT или мобилна мрежа.`,
    };
  }

  const asName = (report.origin?.data?.asName ?? "").toLowerCase();
  if (MOBILE_AS_HINTS.some((hint) => asName.includes(hint)) && names.length === 0) {
    return {
      suspected: true,
      certainty: "възможно",
      reason:
        "Автономната система изглежда на мобилен или телеком оператор, а адресът няма обратно име. Мобилният интернет почти винаги е зад операторски NAT.",
    };
  }

  return {
    suspected: false,
    certainty: "възможно",
    reason:
      "Няма външен признак за операторски NAT. Това НЕ го изключва — отвън CGNAT адресът изглежда като всеки друг. Ако операторът потвърди CGNAT, ще е нужен и източников порт.",
  };
}

// ── Изисквания към искането ───────────────────────────────────────────────

export function requirementsFor(input: CaseInput, cgnat: CgnatAssessment): Requirement[] {
  return [
    {
      key: "ip",
      label: "IP адрес в каноничен запис",
      satisfied: true,
      mandatory: true,
      why: "IPv6 адресът се пише по един и същи начин, за да съвпадне с записа на оператора.",
    },
    {
      key: "observedAt",
      label: "Точен момент на наблюдението",
      satisfied: input.observedAt !== null,
      mandatory: true,
      why: "Динамичните адреси се преразпределят. Един и същ адрес е бил у различен абонат преди час — без момент операторът няма какво да търси.",
    },
    {
      key: "timezone",
      label: "Часова зона на момента",
      satisfied: input.timezone.trim() !== "",
      mandatory: true,
      why: "Разликата между местно и UTC време е часове. Логовете на оператора са в неговата зона и разминаването води до грешен абонат.",
    },
    {
      key: "sourcePort",
      label: "Източников порт",
      satisfied: input.sourcePort !== null,
      // При CGNAT портът е ЕДИНСТВЕНОТО, което различава един абонат от друг.
      mandatory: cgnat.suspected,
      why: cgnat.suspected
        ? "Заподозрян е операторски NAT. Без източников порт операторът не може да избере един абонат измежду хилядите зад този адрес."
        : "Не е задължителен тук, но ако операторът отговори, че адресът е зад NAT, искането ще трябва да се повтори с порт.",
    },
    {
      key: "caseRef",
      label: "Номер на преписка",
      satisfied: input.caseRef.trim() !== "",
      mandatory: true,
      why: "Операторът отговаря на искане по конкретно производство, не на запитване.",
    },
  ];
}

// ── Пречки ────────────────────────────────────────────────────────────────

export function blockersFor(
  input: CaseInput,
  requirements: Requirement[],
  report: LookupReport,
  now: Date = new Date(),
  retentionDays: number = DEFAULT_RETENTION_DAYS,
): string[] {
  const blockers: string[] = [];

  for (const requirement of requirements) {
    if (requirement.mandatory && !requirement.satisfied) {
      blockers.push(`Липсва: ${requirement.label.toLowerCase()}. ${requirement.why}`);
    }
  }

  if (input.observedAt) {
    const ageDays = Math.floor((now.getTime() - input.observedAt.getTime()) / 86_400_000);
    if (ageDays > retentionDays) {
      blockers.push(
        `Наблюдението е отпреди ${ageDays} дни. Операторите не пазят данни за трафик безсрочно — при такава давност отговор „няма данни“ е очакван. Сверявай срока за конкретния оператор.`,
      );
    }
    if (input.observedAt.getTime() > now.getTime()) {
      blockers.push("Моментът на наблюдението е в бъдещето — вероятно е сгрешена датата или зоната.");
    }
  }

  if (!report.rdap?.data?.abuse?.email && !report.rdap?.data?.name) {
    blockers.push(
      "Регистърът не върна нито име на мрежата, нито контакт. Адресатът на искането трябва да се установи по друг път, преди да се изпраща.",
    );
  }

  const registryCountry = report.rdap?.data?.country;
  if (registryCountry && registryCountry !== "BG") {
    blockers.push(
      `Мрежата е регистрирана в ${registryCountry}. Искане до чуждестранен оператор минава по друг ред (правна помощ или пряко сътрудничество) и отнема съществено повече време.`,
    );
  }

  return blockers;
}

// ── Черновата ─────────────────────────────────────────────────────────────

function formatMoment(input: CaseInput): string {
  if (!input.observedAt) return "………… (ЗАДЪЛЖИТЕЛНО: дата и час)";
  const iso = input.observedAt.toISOString().replace("T", " ").slice(0, 19);
  const zone = input.timezone.trim() || "………";
  return `${iso} UTC (часова зона на наблюдението: ${zone})`;
}

/**
 * Черновата е ЗАГОТОВКА за човек, не готов документ.
 *
 * Нарочно не цитира конкретен член: редът за достъп до данни за трафик се мени
 * и се различава според производството. Правното основание го попълва този,
 * който подписва — инструментът пази техническата част да е пълна и точна.
 */
export function draftRequest(
  ip: ParsedIp,
  input: CaseInput,
  report: LookupReport,
  cgnat: CgnatAssessment,
): string {
  const rdap = report.rdap?.data;
  const origin = report.origin?.data;
  const lines: string[] = [];

  lines.push("ИСКАНЕ ЗА ДАННИ ЗА АБОНАТ ПО IP АДРЕС — ЧЕРНОВА");
  lines.push("");
  lines.push(`Преписка №: ${input.caseRef.trim() || "…………"}`);
  lines.push(`Правно основание: ………… (попълва се от съставителя)`);
  lines.push("");
  lines.push("ДО:");
  lines.push(`  Оператор: ${rdap?.name ?? "…………"}`);
  if (origin?.asName) lines.push(`  Автономна система: AS${origin.asn} — ${origin.asName}`);
  if (rdap?.abuse?.email) lines.push(`  Известен контакт: ${rdap.abuse.email}`);
  lines.push("  (искането се адресира до законния представител на оператора, не до контакта за злоупотреби)");
  lines.push("");
  lines.push("ОТНОСНО:");
  lines.push(`  IP адрес: ${ip.normalized}`);
  lines.push(`  Момент на наблюдението: ${formatMoment(input)}`);
  lines.push(
    `  Източников порт: ${input.sourcePort !== null ? String(input.sourcePort) : cgnat.suspected ? "………… (ЗАДЪЛЖИТЕЛЕН — виж бележката)" : "не е наличен"}`,
  );
  if (rdap?.cidr) lines.push(`  Обявен блок: ${rdap.cidr}`);
  lines.push("");
  lines.push("МОЛЯ ДА БЪДЕ ПРЕДОСТАВЕНО:");
  lines.push("  1. Данни за абоната, ползвал посочения адрес в посочения момент.");
  lines.push("  2. Вид на услугата (фиксирана / мобилна) и дали адресът е зад операторски NAT.");
  lines.push("  3. Точния период на присвояване на адреса към този абонат.");
  lines.push("");

  if (cgnat.suspected) {
    lines.push("БЕЛЕЖКА ЗА ОПЕРАТОРСКИ NAT (CGNAT):");
    lines.push(`  ${cgnat.reason}`);
    lines.push(
      "  При CGNAT зад един публичен адрес стоят хиляди абонати едновременно. Без",
    );
    lines.push(
      "  източников порт И точен момент операторът не може да посочи един абонат.",
    );
    lines.push("");
  }

  lines.push("ТЕХНИЧЕСКИ ПРОИЗХОД НА ДАННИТЕ В ТОВА ИСКАНЕ:");
  if (report.rdap) lines.push(`  · ${report.rdap.source} — ${statusWord(report.rdap.status)}`);
  if (report.origin) lines.push(`  · ${report.origin.source} — ${statusWord(report.origin.status)}`);
  if (report.ptr) lines.push(`  · ${report.ptr.source} — ${statusWord(report.ptr.status)}`);
  lines.push("");
  lines.push("ОГРАНИЧЕНИЕ:");
  lines.push("  Геолокацията по IP адрес НЕ установява адрес на жилище и НЕ е основание");
  lines.push("  за процесуално действие срещу конкретно лице. Тя дава район с грешка от");
  lines.push("  порядъка на десетки километри. Идентификация се извършва единствено от");
  lines.push("  оператора по абонатните му записи.");
  lines.push("");
  lines.push("  Тази чернова е техническа заготовка. Правното основание, адресатът и");
  lines.push("  формата се проверяват от съставителя преди изпращане.");

  return lines.join("\n");
}

function statusWord(status: "ok" | "empty" | "error"): string {
  if (status === "ok") return "отговори";
  if (status === "empty") return "няма запис";
  return "източникът беше недостъпен";
}

// ── Сглобяване ────────────────────────────────────────────────────────────

export function buildBrief(
  ip: ParsedIp,
  input: CaseInput,
  report: LookupReport,
  now: Date = new Date(),
): InvestigativeBrief {
  const cgnat = assessCgnat(ip, report);
  const requirements = requirementsFor(input, cgnat);
  const rdap = report.rdap?.data;

  return {
    operator: {
      network: rdap?.name,
      organisation: rdap?.contacts.find((contact) => contact.organisation)?.organisation,
      asn: report.origin?.data?.asn,
      asName: report.origin?.data?.asName,
      abuseEmail: rdap?.abuse?.email,
      registry: rdap?.registry,
      registryCountry: rdap?.country,
    },
    cgnat,
    requirements,
    blockers: blockersFor(input, requirements, report, now),
    draft: draftRequest(ip, input, report, cgnat),
  };
}
