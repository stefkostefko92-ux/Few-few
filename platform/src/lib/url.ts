// Малка проверка за безопасен href/цел на fetch. React НЕ санитизира href, така
// че `javascript:`/`data:` схеми трябва да се отсяват преди рендер. Използва се и
// от сървъра (кеширане на съдържание), и от клиента (рендер) — затова без
// „server-only". Приема само абсолютни http(s) адреси.
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return /^https?:$/.test(new URL(value).protocol);
  } catch {
    return false;
  }
}

// Връща адреса, ако е http(s); иначе null (за колони от тип „url").
export function httpUrlOrNull(value: unknown): string | null {
  return isHttpUrl(value) ? value : null;
}
