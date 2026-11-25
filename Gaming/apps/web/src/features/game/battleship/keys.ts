/** Фокусът е в поле за писане (чат, търсене) — клавишите са текст, не команди:
 *  „р“ в чата по време на подреждането въртеше избрания кораб. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as { tagName?: unknown; isContentEditable?: unknown } | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable === true;
}

/** Клавиш за „Завърти“ (R на латиница или кирилица), без модификатори (Ctrl+R = презареждане). */
export function isRotateKey(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "target">): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return false;
  return e.key === "r" || e.key === "R" || e.key === "р" || e.key === "Р";
}
