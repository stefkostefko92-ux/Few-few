import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTACT_RETENTION_DAYS,
  FORBIDDEN_MESSAGES,
  PURGE_INTERVAL_MS,
  ceremonyLine,
  cleanText,
  contactPurgeCutoff,
  findForbidden,
  formatDateBg,
  formatDateTimeBg,
  friendlyPhone,
  kindInfo,
  moderationMail,
  obituarySlugBase,
  obituarySubmissionSchema,
  parseDateInput,
  parseKindFilter,
  parsePage,
  parseTimeInput,
  relativeDayLabel,
  safePhotoUrl,
  shouldRunPurge,
  yearsLabel,
} from "@/lib/obituary";

// Петък, 23 октомври 2026, 15:00 в София (UTC+3).
const NOW = new Date("2026-10-23T12:00:00Z");

const VALID = {
  kind: "NECROLOGY",
  fullName: "  Иван   Петров Иванов ",
  birthYear: "1945",
  deathDate: "2026-10-21",
  ceremonyDate: "2026-10-24",
  ceremonyTime: "11:00",
  ceremonyPlace: "църквата „Св. Николай“, Бобов дол",
  text: "Почина нашият скъп съпруг, баща и дядо (1945 - 2026).\r\n\r\n\r\n\r\nПоклон!",
  fromFamily: "От семейството",
  contactName: "Мария Иванова",
  contactPhone: "0888 123 456",
  consent: "on",
  website: "",
};

function parse(overrides: Record<string, string> = {}) {
  return obituarySubmissionSchema(NOW).safeParse({ ...VALID, ...overrides });
}

function firstIssue(overrides: Record<string, string>) {
  const r = parse(overrides);
  assert.equal(r.success, false);
  if (r.success) throw new Error("очаквахме грешка");
  return r.error.issues[0];
}

test("видове: етикети, филтър ?vid= и резервен вид", () => {
  assert.equal(kindInfo("NECROLOGY").heading, "Тъжна вест");
  assert.equal(kindInfo("MEMORIAL").ceremony, "Помен");
  assert.equal(kindInfo("нещо-старо").label, "Некролог");
  assert.equal(parseKindFilter("nekrolozi"), "NECROLOGY");
  assert.equal(parseKindFilter(["pomeni"]), "MEMORIAL");
  assert.equal(parseKindFilter("NECROLOGY"), null);
  assert.equal(parseKindFilter(undefined), null);
});

test("страница ?str=: само цели числа 1–1000, иначе 1", () => {
  assert.equal(parsePage("2"), 2);
  assert.equal(parsePage(["3"]), 3);
  assert.equal(parsePage("0"), 1);
  assert.equal(parsePage("-1"), 1);
  assert.equal(parsePage("abc"), 1);
  assert.equal(parsePage("99999"), 1);
  assert.equal(parsePage(undefined), 1);
});

test("дати от формата: валидни, невъзможни и час", () => {
  assert.equal(parseDateInput("2026-10-24")?.getTime(), Date.UTC(2026, 9, 24));
  assert.equal(parseDateInput("2026-02-31"), null);
  assert.equal(parseDateInput("24.10.2026"), null);
  assert.equal(parseTimeInput("09:05"), 9 * 60 + 5);
  assert.equal(parseTimeInput("11:00:00"), 11 * 60);
  assert.equal(parseTimeInput("24:00"), null);
  assert.equal(parseTimeInput("11ч"), null);
});

test("форматиране на български, като „стенно време“ (без отместване)", () => {
  const at = new Date(Date.UTC(2026, 9, 24, 11, 0));
  assert.equal(formatDateBg(at), "24 октомври 2026 г.");
  assert.equal(formatDateTimeBg(at), "събота, 24 октомври 2026 г., 11:00 ч.");
  assert.equal(
    ceremonyLine("NECROLOGY", at, "гробищния парк"),
    "Погребение: събота, 24 октомври 2026 г., 11:00 ч., гробищния парк",
  );
  assert.equal(ceremonyLine("MEMORIAL", null, "църквата"), "Помен: църквата");
  assert.equal(ceremonyLine("MEMORIAL", null, ""), "");
});

test("„Днес“/„Утре“ по датата в София, и след полунощ", () => {
  const today = new Date(Date.UTC(2026, 9, 23, 17, 0));
  const tomorrow = new Date(Date.UTC(2026, 9, 24, 11, 0));
  const later = new Date(Date.UTC(2026, 9, 25, 11, 0));
  assert.equal(relativeDayLabel(today, NOW), "Днес");
  assert.equal(relativeDayLabel(tomorrow, NOW), "Утре");
  assert.equal(relativeDayLabel(later, NOW), null);
  assert.equal(relativeDayLabel(null, NOW), null);
  // 22:30 UTC = 01:30 в София на 24-ти — погребението на 24-ти вече е „днес“.
  assert.equal(relativeDayLabel(tomorrow, new Date("2026-10-23T22:30:00Z")), "Днес");
});

test("години: и двете, само раждане, без години", () => {
  const death = new Date(Date.UTC(2026, 9, 21));
  assert.equal(yearsLabel(1945, death), "1945 – 2026");
  assert.equal(yearsLabel(1945, null), "р. 1945");
  assert.equal(yearsLabel(null, death), "");
  assert.equal(yearsLabel(null, null), "");
});

test("забранено в публичния текст: телефони, сметки, линкове, ЕГН", () => {
  assert.equal(findForbidden("За връзка: 0888 123 456"), "phone");
  assert.equal(findForbidden("Тел. 0888123456"), "phone");
  assert.equal(findForbidden("+359 888 123 456"), "phone");
  assert.equal(findForbidden("02 987 6543"), "phone");
  assert.equal(findForbidden("+39 333 123 4567"), "phone");
  assert.equal(findForbidden("IBAN BG80 BNBG 9661 1020 3456 78"), "iban");
  assert.equal(findForbidden("Дарете по Revolut за погребението"), "iban");
  assert.equal(findForbidden("банкова сметка на семейството"), "iban");
  assert.equal(findForbidden("вижте www.primer.bg"), "link");
  assert.equal(findForbidden("https://example.org/x"), "link");
  assert.equal(findForbidden("ЕГН 4501011234"), "egn");
});

test("без фалшиви тревоги: години, дати, адреси, кавички", () => {
  assert.equal(findForbidden("Почина на 24.10.2026 г., на 81 години (1945 - 2026)."), null);
  assert.equal(findForbidden("Помен на 01 10 2026 от 11.00 ч."), null);
  assert.equal(findForbidden("църквата „Св. Николай“, ул. „Христо Ботев“ 12"), null);
  assert.equal(findForbidden(""), null);
});

test("формата: валидно подаване се нормализира", () => {
  const r = parse();
  assert.equal(r.success, true);
  if (!r.success) return;
  const d = r.data;
  assert.equal(d.kind, "NECROLOGY");
  assert.equal(d.fullName, "Иван Петров Иванов");
  assert.equal(d.birthYear, 1945);
  assert.equal(d.deathDate?.getTime(), Date.UTC(2026, 9, 21));
  assert.equal(d.ceremonyAt?.getTime(), Date.UTC(2026, 9, 24, 11, 0));
  assert.equal(d.text, "Почина нашият скъп съпруг, баща и дядо (1945 - 2026).\n\nПоклон!");
  assert.equal(d.contactPhone, "0888 123 456");
});

test("формата: минимално подаване (само вид, име, подател, съгласие)", () => {
  const r = parse({
    kind: "MEMORIAL",
    birthYear: "",
    deathDate: "",
    ceremonyDate: "",
    ceremonyTime: "",
    ceremonyPlace: "",
    text: "",
    fromFamily: "",
  });
  assert.equal(r.success, true);
  if (!r.success) return;
  assert.equal(r.data.birthYear, null);
  assert.equal(r.data.deathDate, null);
  assert.equal(r.data.ceremonyAt, null);
});

test("формата: без съгласие, с honeypot или с непознат вид — отказ", () => {
  assert.match(firstIssue({ consent: "" }).message, /близък на починалия/);
  assert.equal(parse({ website: "http://spam" }).success, false);
  assert.equal(firstIssue({ kind: "OTHER" }).path[0], "kind");
});

test("формата: подателят е задължителен и с истински телефон", () => {
  assert.equal(firstIssue({ contactName: "" }).path[0], "contactName");
  assert.equal(firstIssue({ contactPhone: "" }).path[0], "contactPhone");
  assert.equal(firstIssue({ contactPhone: "обадете се" }).path[0], "contactPhone");
  assert.equal(firstIssue({ contactPhone: "12345" }).path[0], "contactPhone");
  assert.equal(parse({ contactPhone: "+359 (88) 812-34-56" }).success, true);
});

test("формата: дати и години извън смисленото — отказ", () => {
  assert.equal(firstIssue({ deathDate: "2026-10-30" }).path[0], "deathDate");
  assert.equal(firstIssue({ deathDate: "2026-02-31" }).path[0], "deathDate");
  assert.equal(firstIssue({ birthYear: "2027" }).path[0], "birthYear");
  assert.equal(firstIssue({ birthYear: "45" }).path[0], "birthYear");
  assert.equal(firstIssue({ ceremonyTime: "" }).path[0], "ceremonyTime");
  assert.equal(firstIssue({ ceremonyDate: "" }).path[0], "ceremonyDate");
  assert.equal(firstIssue({ ceremonyDate: "2028-01-01" }).path[0], "ceremonyDate");
});

test("формата: телефон/сметка/линк в публичните полета — отказ с ясна причина", () => {
  const phone = firstIssue({ text: "За връзка: 0888 123 456" });
  assert.equal(phone.path[0], "text");
  assert.equal(phone.message, FORBIDDEN_MESSAGES.phone);
  assert.equal(firstIssue({ fromFamily: "IBAN BG80BNBG96611020345678" }).message, FORBIDDEN_MESSAGES.iban);
  assert.equal(firstIssue({ ceremonyPlace: "www.primer.bg" }).message, FORBIDDEN_MESSAGES.link);
  assert.equal(firstIssue({ fullName: "Иван 0888123456" }).path[0], "fullName");
});

test("снимка: само наши качени файлове или https", () => {
  assert.equal(safePhotoUrl("/api/foto/abc123-def.jpg"), "/api/foto/abc123-def.jpg");
  assert.equal(safePhotoUrl("https://example.org/a.jpg"), "https://example.org/a.jpg");
  assert.equal(safePhotoUrl("http://example.org/a.jpg"), "");
  assert.equal(safePhotoUrl("javascript:alert(1)"), "");
  assert.equal(safePhotoUrl("/api/foto/../../etc/passwd"), "");
  assert.equal(safePhotoUrl(""), "");
  assert.equal(safePhotoUrl(null), "");
});

test("помощни: телефон за четене, slug, чист текст", () => {
  assert.equal(friendlyPhone("+359877414874"), "0877 414 874");
  assert.equal(friendlyPhone("0700 12 345"), "0700 12 345");
  assert.equal(obituarySlugBase("Иван Петров", new Date(Date.UTC(2026, 9, 21))), "ivan-petrov-2026");
  assert.equal(obituarySlugBase("Иван Петров", null), "ivan-petrov");
  assert.equal(cleanText("а  \r\n\r\n\r\n\r\nб\u0007"), "а\n\nб");
});

test("срок за данните на подателя: 30 дни; чистенето е най-много веднъж на 6 часа", () => {
  assert.equal(CONTACT_RETENTION_DAYS, 30);
  assert.equal(
    contactPurgeCutoff(NOW).getTime(),
    NOW.getTime() - 30 * 24 * 60 * 60 * 1000,
  );
  const t = NOW.getTime();
  assert.equal(shouldRunPurge(0, t), true);
  assert.equal(shouldRunPurge(t - 60 * 60 * 1000, t), false);
  assert.equal(shouldRunPurge(t - PURGE_INTERVAL_MS, t), true);
  assert.equal(shouldRunPurge(t + 1000, t), true); // часовникът е върнат назад
});

test("писмото до редакцията е без лични данни", () => {
  const m = moderationMail("MEMORIAL", "https://zabobovdol.carbonstealth.eu");
  assert.equal(m.subject, "Нов помен чака одобрение");
  assert.match(m.text, /\/admin\/pomeni\?filter=pending/);
  assert.doesNotMatch(m.text, /\d{6,}/);
});
