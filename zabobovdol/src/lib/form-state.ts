// Общото състояние на публичните форми (сигнал, обява, доброволец, контакт…)
// по образеца на BusinessForm: при грешка въведеното се връща обратно, всяка
// грешка е до своето поле, а броячът на опитите сменя ключа на формата, за да
// се покажат върнатите стойности (React 19 нулира неконтролираните полета
// след всяко изпращане — без това написаното изчезваше).
//
// Чист модул без зависимости — ползва се и от server actions, и в тестовете.

export type FormValues = Record<string, string>;
export type FieldErrors = Record<string, string>;

export type FormState = {
  ok: boolean;
  /** Обща грешка (лимит, запис) — без конкретно поле. */
  error?: string;
  /** Грешка по поле: име на полето → текст („Заглавието е твърде кратко…“). */
  fieldErrors?: FieldErrors;
  /** Въведеното до момента — за да не се губи при грешка. */
  values?: FormValues;
  /** Брояч на опитите — сменя ключа на формата, за да покаже `values`. */
  attempt?: number;
};

/** Колко знака от поле се връщат обратно (полетата са до 6000 знака). */
const MAX_ECHO = 10_000;

/** Името на скритото поле против ботове (honeypot) във всички форми. */
export const HONEYPOT = "website";

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v : "";
}

/** Текстовите полета от формата (файлове се пропускат; липсващо → ""). */
export function readValues(fd: FormData, fields: readonly string[]): FormValues {
  const out: FormValues = {};
  for (const f of fields) out[f] = str(fd.get(f)).slice(0, MAX_ECHO);
  return out;
}

/** true — ботът е попълнил скритото поле. */
export function honeypotFilled(fd: FormData): boolean {
  return str(fd.get(HONEYPOT)) !== "";
}

export function nextAttempt(prev: Pick<FormState, "attempt"> | undefined): number {
  return (prev?.attempt ?? 0) + 1;
}

/**
 * Грешките от валидацията (Zod `issues`) → по една на поле (първата за всяко).
 * Без поле (грешка за целия обект) → под ключ „_“.
 */
export function fieldErrorsOf(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): FieldErrors {
  const out: FieldErrors = {};
  for (const i of issues) {
    const key = typeof i.path[0] === "string" ? i.path[0] : "_";
    if (!(key in out)) out[key] = i.message;
  }
  return out;
}

/** Неуспех с въведените стойности — общата грешка и/или грешките по поле. */
export function failState(
  values: FormValues,
  attempt: number,
  error?: string,
  fieldErrors?: FieldErrors,
): FormState {
  return {
    ok: false,
    values,
    attempt,
    ...(error ? { error } : {}),
    ...(fieldErrors && Object.keys(fieldErrors).length ? { fieldErrors } : {}),
  };
}

// Общи текстове на грешките — едни и същи думи във всички форми.
export const MSG = {
  invalid: "Невалидни данни.",
  saveFailed: "Възникна грешка при записа. Опитайте отново след малко.",
  email: "Проверете имейла — трябва да е като ime@primer.bg.",
  contactNeeded: "Посочете телефон или имейл, за да се свържем с вас.",
  phone: "Телефонът изглежда непълен — проверете цифрите (например 0888 123 456).",
} as const;

/** Прост тест за имейл — същият навсякъде (празно = няма имейл). */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
