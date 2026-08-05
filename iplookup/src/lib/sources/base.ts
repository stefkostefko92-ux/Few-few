import "server-only";

/**
 * Общото за всички външни източници: таймаут, изолация на грешките и честно
 * различаване на „няма данни“ от „източникът падна“.
 *
 * Правилото на този слой: **един източник никога не сваля справката.** Всяка
 * функция връща резултат, не хвърля — иначе една бавна услуга би направила
 * целия продукт безполезен. Затова и всеки резултат носи своя произход
 * (`source`, `sourceUrl`), за да може потребителят да провери твърдението.
 */

export type SourceStatus = "ok" | "empty" | "error";

export interface SourceResult<T> {
  status: SourceStatus;
  /** Данните — само при `status === "ok"`. */
  data?: T;
  /** Съобщение на български, което може да се покаже на потребителя. */
  message?: string;
  /** Име на източника, както се показва в интерфейса. */
  source: string;
  /** Публичен адрес на източника — прозрачност, не украса. */
  sourceUrl: string;
  /** Колко време отне (ms) — показваме го, за да е видимо кое бави. */
  ms: number;
}

/** Таймаут по подразбиране: по-дълго от това и потребителят вече е затворил. */
export const DEFAULT_TIMEOUT_MS = 4000;

/**
 * Представяме се честно пред чуждите услуги. Повечето публични API-та молят за
 * това, а някои (RIPEstat) го изискват — анонимните заявки ги дроселират първи.
 */
export const USER_AGENT =
  "CarbonIP/0.1 (+https://iplookup.carbonstealth.eu; Carbon Stealth VCC)";

export interface SourceMeta {
  source: string;
  sourceUrl: string;
}

/**
 * Изпълнява една справка с таймаут и превръща всеки провал в резултат.
 *
 * `AbortSignal.timeout` спира и увисналото TCP свързване, не само бавния
 * отговор — без него един неотговарящ хост държи заявката до края на света.
 */
export async function runSource<T>(
  meta: SourceMeta,
  task: (signal: AbortSignal) => Promise<T | null>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<SourceResult<T>> {
  const started = Date.now();
  try {
    const data = await task(AbortSignal.timeout(timeoutMs));
    if (data === null || data === undefined) {
      return { status: "empty", ...meta, ms: Date.now() - started };
    }
    return { status: "ok", data, ...meta, ms: Date.now() - started };
  } catch (error) {
    return {
      status: "error",
      message: describeFailure(error, timeoutMs),
      ...meta,
      ms: Date.now() - started,
    };
  }
}

/**
 * Съобщение за потребителя — без стек, без вътрешни пътища, без URL с ключове.
 * Чуждата грешка е вход от трета страна и не се препечатва дословно.
 */
function describeFailure(error: unknown, timeoutMs: number): string {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return `Източникът не отговори за ${Math.round(timeoutMs / 1000)} s.`;
  }
  if (error instanceof Error && error.name === "AbortError") {
    return "Заявката беше прекъсната.";
  }
  if (error instanceof HttpError) {
    return `Източникът отговори с код ${error.status}.`;
  }
  return "Източникът е недостъпен в момента.";
}

export class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
    this.name = "HttpError";
  }
}

/**
 * JSON заявка към ФИКСИРАН хост.
 *
 * Адресът на услугата винаги идва от константа в кода, а потребителският вход
 * влиза само като кодиран сегмент от пътя или параметър — никога като цял URL.
 * Така инструмент, който по същността си приема адреси от непознати, не се
 * превръща в отворен препращач (SSRF).
 */
export async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T | null> {
  const response = await fetch(url, {
    signal,
    redirect: "follow",
    headers: { accept: "application/json", "user-agent": USER_AGENT },
  });

  // 404 значи „за този адрес няма запис“ — това е отговор, не повреда.
  if (response.status === 404) return null;
  if (!response.ok) throw new HttpError(response.status);

  return (await response.json()) as T;
}

/** Празен резултат, когато изобщо няма смисъл да питаме (частен адрес). */
export function skipped<T>(meta: SourceMeta, message: string): SourceResult<T> {
  return { status: "empty", message, ...meta, ms: 0 };
}
