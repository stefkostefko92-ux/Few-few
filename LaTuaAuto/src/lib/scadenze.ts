// Италиански срокове по автомобила — чиста логика, без БД, тестваема.
// Всяко правило носи източника си (виж docs/research.md, §5.3–5.4).
// Датите са UTC-полунощ; денят е единицата — часовите зони не участват.

export type Iso = string; // 'YYYY-MM-DD'

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIso(date: Date): Iso {
  return date.toISOString().slice(0, 10);
}

export function fromIso(iso: Iso): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Невалидна ISO дата: ${iso}`);
  const [, y, mo, d] = m;
  const date = utc(Number(y), Number(mo), Number(d));
  if (Number.isNaN(date.getTime())) throw new Error(`Невалидна дата: ${iso}`);
  return date;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Добавя години, като пази ден/месец; 29.02 → 28.02 в невисокосна година. */
export function addYears(date: Date, years: number): Date {
  const y = date.getUTCFullYear() + years;
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, lastDay)));
}

/** Последният ден на месеца, в който пада датата (правилото за revisione). */
export function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

// ── Revisione ────────────────────────────────────────────────────────────────
// Първата: 4 г. от immatricolazione; после на всеки 2 г. Срокът е до края на
// месеца на съответната годишнина (art. 80 CdS). Връща СЛЕДВАЩИЯ срок след `today`.
export function nextRevisione(registration: Date, today: Date, lastRevisione?: Date): Date {
  if (lastRevisione) {
    return endOfMonth(addYears(lastRevisione, 2));
  }
  let due = endOfMonth(addYears(registration, 4));
  while (due < today) {
    due = endOfMonth(addYears(due, 2));
  }
  return due;
}

// ── Gomme invernali ──────────────────────────────────────────────────────────
// Задължение 15 ноември → 15 април; смяната е разрешена от 15 октомври и
// до 15 май (месец толеранс). Връща следващия КРАЕН срок за смяна.
export interface TyreWindow {
  kind: 'INVERNALI' | 'ESTIVE';
  canChangeFrom: Date;
  deadline: Date;
}

export function nextTyreDeadline(today: Date): TyreWindow {
  const y = today.getUTCFullYear();
  const winterDeadline = utc(y, 11, 15);
  const summerDeadline = utc(y, 5, 15);
  if (today <= summerDeadline) {
    return { kind: 'ESTIVE', canChangeFrom: utc(y, 4, 15), deadline: summerDeadline };
  }
  if (today <= winterDeadline) {
    return { kind: 'INVERNALI', canChangeFrom: utc(y, 10, 15), deadline: winterDeadline };
  }
  return { kind: 'ESTIVE', canChangeFrom: utc(y + 1, 4, 15), deadline: utc(y + 1, 5, 15) };
}

// ── Patente B ────────────────────────────────────────────────────────────────
// Валидност по възраст към датата на издаване/подновяване (art. 126 CdS):
// до 50 г. → 10 г.; 50–70 → 5 г.; 70–80 → 3 г.; над 80 → 2 г.
export function patenteValidityYears(ageAtIssue: number): number {
  if (ageAtIssue < 50) return 10;
  if (ageAtIssue < 70) return 5;
  if (ageAtIssue < 80) return 3;
  return 2;
}

export function ageAt(birth: Date, at: Date): number {
  let age = at.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    at.getUTCMonth() < birth.getUTCMonth() ||
    (at.getUTCMonth() === birth.getUTCMonth() && at.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** Срок на patente, издадена/подновена на `issued` за човек, роден на `birth`. */
export function patenteExpiry(birth: Date, issued: Date): Date {
  const years = patenteValidityYears(ageAt(birth, issued));
  // Изтича на рождения ден след N години (правилото „scadenza al compleanno“).
  const raw = addYears(issued, years);
  const birthday = new Date(Date.UTC(raw.getUTCFullYear(), birth.getUTCMonth(), birth.getUTCDate()));
  return birthday >= raw ? birthday : addYears(birthday, 1);
}

// ── Multa (verbale) ──────────────────────────────────────────────────────────
// −30% при плащане до 5 дни от връчването (art. 202 c.1 CdS); срокът тече
// от деня след връчването; ако падне в неработен ден → следващият работен.
// Жалба до Prefetto: 60 дни (art. 203); до Giudice di Pace: 30 дни (art. 204-bis).
export interface FineDeadlines {
  scontoUntil: Date;
  ricorsoGiudiceDiPaceUntil: Date;
  ricorsoPrefettoUntil: Date;
  pagamentoOrdinarioUntil: Date; // 60 дни — след това сумата се удвоява (art. 203)
}

function isWeekend(d: Date): boolean {
  const wd = d.getUTCDay();
  return wd === 0 || wd === 6;
}

// Национални неработни дни (фиксирани); Пасха/Pasquetta се добавят при нужда.
const FIXED_HOLIDAYS: ReadonlyArray<[number, number]> = [
  [1, 1], [1, 6], [4, 25], [5, 1], [6, 2], [8, 15], [11, 1], [12, 8], [12, 25], [12, 26],
];

export function isItalianHoliday(d: Date): boolean {
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return FIXED_HOLIDAYS.some(([hm, hd]) => hm === m && hd === day);
}

export function nextWorkingDay(d: Date): Date {
  let x = d;
  while (isWeekend(x) || isItalianHoliday(x)) x = addDays(x, 1);
  return x;
}

export function fineDeadlines(notified: Date): FineDeadlines {
  return {
    scontoUntil: nextWorkingDay(addDays(notified, 5)),
    ricorsoGiudiceDiPaceUntil: nextWorkingDay(addDays(notified, 30)),
    ricorsoPrefettoUntil: nextWorkingDay(addDays(notified, 60)),
    pagamentoOrdinarioUntil: nextWorkingDay(addDays(notified, 60)),
  };
}

/** Дни до срок (отрицателно = просрочен). */
export function daysUntil(due: Date, today: Date): number {
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}
