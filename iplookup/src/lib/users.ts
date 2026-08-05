import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { verifyPassword } from "./password";
import { isRole, type Role } from "./session";

/**
 * Служителите с достъп до следственото издание.
 *
 * Файл, не база: при локална инсталация един JSON се преглежда, архивира и
 * подписва по-лесно, а броят служители в едно РПУ е десетки, не хиляди.
 *
 * Няма `server-only`: истинската преграда пред клиента е `node:fs`, който не
 * съществува в браузър, а този модул трябва да е тестваем без Next. Кодът, който
 * доказва цялост, е последното място, което бива да остане непокрито.
 *
 * Паролите се пазят само като scrypt хешове. Файлът се пише със `scripts/
 * add-user.mjs`, не на ръка — така никой не изкушава да сложи парола в чист
 * вид „само за проба".
 */

export interface User {
  /** Индивидуален идентификатор. Споделени акаунти са забранени. */
  id: string;
  /** Име за дневника. */
  name: string;
  /** Структура — влиза във всеки запис. */
  unit: string;
  role: Role;
  passwordHash: string;
  /** Изключен акаунт остава във файла, за да не се загуби следата в дневника. */
  disabled?: boolean;
}

function usersPath(): string {
  return process.env.IPLOOKUP_USERS_FILE?.trim() || join(process.cwd(), "data", "users.json");
}

function loadUsers(): User[] {
  const path = usersPath();
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isUser);
  } catch {
    // Повреден файл значи НУЛА достъп, а не достъп без проверка.
    return [];
  }
}

function isUser(value: unknown): value is User {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.name === "string" &&
    typeof candidate.unit === "string" &&
    isRole(candidate.role) &&
    typeof candidate.passwordHash === "string"
  );
}

/**
 * Проверява вход. Връща `null` при всяка нередност — несъществуващ,
 * изключен или грешна парола. Съобщението навън е едно и също, за да не
 * издава кои идентификатори съществуват.
 */
export function authenticate(id: string, password: string): User | null {
  const users = loadUsers();
  const user = users.find((candidate) => candidate.id === id.trim());
  if (!user || user.disabled) {
    // Празно, но реално смятане, за да не се различава по време несъществуващ
    // акаунт от грешна парола.
    verifyPassword(password, "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA");
    return null;
  }
  return verifyPassword(password, user.passwordHash) ? user : null;
}

/** Има ли изобщо настроени служители — без тях режимът не бива да работи. */
export function hasUsers(): boolean {
  return loadUsers().length > 0;
}
