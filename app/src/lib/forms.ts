// Помощни функции за формите.

// Кратък код за проследяване на сигнал от гражданина (напр. DUP-7F3K9).
export function makeRefCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `DUP-${s}`;
}

// Общ тип за резултата от изпращане на форма (за useActionState).
export type FormState = {
  ok: boolean;
  message: string;
  refCode?: string;
};

export const EMPTY_FORM_STATE: FormState = { ok: false, message: "" };

// Прост honeypot: ако скритото поле е попълнено, най-вероятно е бот.
export function isBot(formData: FormData): boolean {
  return String(formData.get("website") ?? "").trim() !== "";
}

// Безопасно извличане и подрязване на текстово поле.
export function field(formData: FormData, name: string, max = 2000): string {
  return String(formData.get(name) ?? "")
    .trim()
    .slice(0, max);
}
