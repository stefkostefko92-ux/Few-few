import { createRequire } from 'node:module';

/**
 * Playwright (библиотеката, не `@playwright/test`) идва от средата — не е зависимост на продукта.
 * ESM не чете NODE_PATH, затова се зарежда през CommonJS `require`. Типовете са само частта, която ползват
 * тестовете: така `npm run typecheck` минава и там, където пакетът го няма.
 */
/** Елемент в страницата — само полетата, които тестовете четат (без DOM типовете: lib е ES2023). */
export interface PageElement {
  textContent: string | null;
  closest(selector: string): PageElement | null;
}

export interface Locator {
  click(): Promise<void>;
  fill(value: string): Promise<void>;
  check(): Promise<void>;
  selectOption(value: string | { label: string }): Promise<unknown>;
  setInputFiles(file: { name: string; mimeType: string; buffer: Buffer }): Promise<void>;
  waitFor(options?: { state?: 'visible' | 'hidden' | 'attached' | 'detached' }): Promise<void>;
  count(): Promise<number>;
  first(): Locator;
  filter(options: { hasText: string | RegExp }): Locator;
  nth(index: number): Locator;
  getByRole(
    role: string,
    options?: { name?: string | RegExp; level?: number; exact?: boolean },
  ): Locator;
  getByText(text: string | RegExp, options?: { exact?: boolean }): Locator;
  getByLabel(text: string | RegExp, options?: { exact?: boolean }): Locator;
  locator(selector: string): Locator;
  textContent(): Promise<string | null>;
  innerText(): Promise<string>;
  inputValue(): Promise<string>;
  isChecked(): Promise<boolean>;
  isDisabled(): Promise<boolean>;
  getAttribute(name: string): Promise<string | null>;
  evaluate<T>(fn: (element: PageElement) => T): Promise<T>;
  evaluateAll<T>(fn: (elements: PageElement[]) => T): Promise<T>;
  press(key: string): Promise<void>;
  focus(): Promise<void>;
}

export interface Response {
  url(): string;
  status(): number;
  headers(): Record<string, string>;
  text(): Promise<string>;
}

export interface Download {
  suggestedFilename(): string;
  path(): Promise<string>;
}

export interface ConsoleMessage {
  type(): string;
  text(): string;
  location(): { url: string; lineNumber: number };
}

export interface Page extends Pick<Locator, 'getByRole' | 'getByText' | 'getByLabel' | 'locator'> {
  goto(url: string): Promise<Response | null>;
  url(): string;
  title(): Promise<string>;
  waitForURL(url: string | RegExp): Promise<void>;
  waitForEvent(event: 'download'): Promise<Download>;
  waitForLoadState(state: 'load' | 'domcontentloaded'): Promise<void>;
  emulateMedia(options: { reducedMotion?: 'reduce' | 'no-preference' }): Promise<void>;
  /** Израз в страницата като низ: `document` не е в типовете на теста. */
  evaluate<T>(expression: string): Promise<T>;
  on(event: 'console', handler: (message: ConsoleMessage) => void): void;
  on(event: 'pageerror', handler: (error: Error) => void): void;
  on(event: 'response', handler: (response: Response) => void): void;
  keyboard: { press(key: string): Promise<void> };
  context(): BrowserContext;
  reload(): Promise<Response | null>;
  close(): Promise<void>;
}

export interface BrowserContext {
  newPage(): Promise<Page>;
  setDefaultTimeout(ms: number): void;
  setOffline(offline: boolean): Promise<void>;
  cookies(): Promise<Array<{ name: string; value: string }>>;
  close(): Promise<void>;
}

export interface ContextOptions {
  viewport: { width: number; height: number };
  locale: string;
  timezoneId: string;
  isMobile?: boolean;
  hasTouch?: boolean;
  acceptDownloads: boolean;
}

export interface Browser {
  newContext(options: ContextOptions): Promise<BrowserContext>;
  close(): Promise<void>;
}

export function launchChromium(): Promise<Browser> {
  const require = createRequire(import.meta.url);
  let playwright: { chromium: { launch(): Promise<Browser> } };
  try {
    playwright = require('playwright') as typeof playwright;
  } catch (error) {
    throw new Error(
      'Пакетът `playwright` не се намира (npm i -D playwright@1.63.0 или NODE_PATH към глобалния). ' +
        String(error),
    );
  }
  return playwright.chromium.launch();
}
