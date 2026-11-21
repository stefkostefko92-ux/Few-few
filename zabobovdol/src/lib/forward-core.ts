// Препращане от админ панела направо през пощата на сайта (Brevo) — вместо
// „отвори в пощата си и копирай“. Чист модул: текстът на писмата и проверката
// на получателя се тестват без база (forward.test.ts).

const NONE = "—";

/** Дата по българско време (дд.мм.гггг). */
function bgDate(d: Date): string {
  return new Intl.DateTimeFormat("bg-BG", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Sofia",
  })
    .format(d)
    .replace(/\s*г\.?$/, "");
}

function noteBlock(note?: string): string[] {
  const n = (note ?? "").trim();
  return n ? ["", "Бележка от екипа на „За Бобов дол“:", n] : [];
}

export type ComplaintForMail = {
  refCode: string;
  category: string;
  subject: string;
  location: string;
  message: string;
  name: string;
  email: string;
  phone: string;
};

/** Писмото за сигнал до институцията — същото и при автоматичното препращане. */
export function complaintMail(c: ComplaintForMail, domain: string, note?: string) {
  const text = [
    `Сигнал от граждани, подаден чрез ${domain}`,
    `Код за проследяване: ${c.refCode}`,
    "",
    `Категория: ${c.category}`,
    `Заглавие: ${c.subject}`,
    c.location ? `Местоположение: ${c.location}` : "",
    "",
    "Описание:",
    c.message,
    "",
    "Подател:",
    `Име: ${c.name || NONE}`,
    `Имейл: ${c.email || NONE}`,
    `Телефон: ${c.phone || NONE}`,
    ...noteBlock(note),
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  return { subject: `Сигнал ${c.refCode}: ${c.subject}`, text };
}

export type DumpForMail = {
  location: string;
  description: string;
  photoUrl: string;
  createdAt: Date;
  // Само вътрешни — НЕ влизат в писмото (виж resources.ts, „smetishta“).
  reporterName?: string;
  reporterPhone?: string;
  reporterEmail?: string;
};

/** Писмото за нерегламентирано сметище — без данните на подателя. */
export function dumpMail(d: DumpForMail, domain: string, teamEmail: string, note?: string) {
  const text = [
    `Сигнал за нерегламентирано сметище от граждани, подаден чрез ${domain}`,
    "",
    `Местоположение: ${d.location}`,
    d.description ? `Описание: ${d.description}` : "",
    d.photoUrl ? `Снимка: ${d.photoUrl}` : "",
    `Подаден на: ${bgDate(d.createdAt)}`,
    `Всички сигнали: https://${domain}/smetishta`,
    ...noteBlock(note),
    "",
    `Данните на подателя не се препращат (защита на личните данни). При нужда от връзка с него пишете на ${teamEmail}.`,
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  return { subject: `Сигнал за нерегламентирано сметище: ${d.location}`, text };
}

/** Точно един адрес — без списъци (запетая/точка и запетая), имена и нови редове. */
export function parseRecipient(raw: string): { ok: true; email: string } | { ok: false } {
  const v = raw.trim().toLowerCase();
  if (v.length > 254 || !/^[^\s@,;<>"()\\]+@[^\s@,;<>"()\\]+\.[^\s@,;<>"()\\]+$/.test(v)) return { ok: false };
  return { ok: true, email: v };
}

/** Ред в историята (вътрешната бележка) след успешно препращане. */
export function forwardNote(existing: string, to: string, when: Date): string {
  const line = `${bgDate(when)} — препратен до ${to}`;
  return existing.trim() ? `${existing.trimEnd()}\n${line}` : line;
}
