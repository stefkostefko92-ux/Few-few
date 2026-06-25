// Помощни функции за форматиране на дати и футболни резултати (bg-BG, зона UTC
// на сървъра — както в zabobovdol). Чисти функции, удобни за повторно ползване.

const DATE = new Intl.DateTimeFormat("bg-BG", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

const DATE_SHORT = new Intl.DateTimeFormat("bg-BG", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const TIME = new Intl.DateTimeFormat("bg-BG", {
  hour: "2-digit",
  minute: "2-digit",
});

const WEEKDAY = new Intl.DateTimeFormat("bg-BG", { weekday: "long" });

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  return isNaN(date.getTime()) ? "—" : DATE.format(date);
}

export function formatDateShort(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  return isNaN(date.getTime()) ? "—" : DATE_SHORT.format(date);
}

export function formatTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  return isNaN(date.getTime()) ? "—" : TIME.format(date);
}

export function formatWeekday(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  return isNaN(date.getTime()) ? "" : WEEKDAY.format(date);
}

// Възраст в навършени години (за картоните на футболистите).
export function ageFrom(birth: Date | string | null | undefined): number | null {
  if (!birth) return null;
  const b = birth instanceof Date ? birth : new Date(birth);
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) age--;
  return age >= 0 && age < 120 ? age : null;
}
