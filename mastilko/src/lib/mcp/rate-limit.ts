// Лимитер за MCP крайната точка. Отделен от route.ts, защото Next.js позволява
// във файла на маршрута само GET/POST/… и config — и за да може да се тества.

import { pruneHits } from "@/lib/client-ip";

const WINDOW_MS = 60_000;

/**
 * Три кофи, защото трафикът НЕ идва от „един клиент на IP“:
 *
 *  • обикновен адрес — 120/мин (човек, браузър, MCP инспектор);
 *  • изходящият диапазон на Anthropic — ОБЩА кофа 3000/мин. Всички извиквания
 *    на Claude към външни MCP сървъри излизат от `160.79.104.0/21` (публикувано
 *    и стабилно: platform.claude.com/docs/en/api/ip-addresses). С лимит на
 *    адрес всички потребители на Claude щяха да делят 120/мин и 25–30
 *    едновременни разговора биха получили 429;
 *  • глобален таван 6000/мин за целия сървър — пази процесора, каквито и да
 *    са адресите. Най-скъпото извикване (`search` с дълъг низ) е ~62 µs, т.е.
 *    таванът е под 1% от едно ядро.
 *
 * OpenAI НЕ е вграден: публикува диапазоните си като динамичен списък, който
 * се мени и трябва да се тегли редовно. Вграден, той щеше да остарее тихо.
 * Изходящите адреси на ChatGPT са много, така че 120/мин на адрес е приемливо;
 * ако в логовете се появят 429 към тях — виж MCP.md, „Лимити“.
 */
const LIMITS = { ip: 120, anthropic: 3000, global: 6000 } as const;
const hits = new Map<string, number[]>();
let globalHits: number[] = [];

/** `160.79.104.0/21` = 160.79.104.0 – 160.79.111.255. Приема и IPv4-mapped IPv6. */
export function isAnthropicEgress(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(v4);
  if (!m) return false;
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return a === 160 && b === 79 && c >= 104 && c <= 111;
}

/**
 * Таксува `cost` извиквания. Проверява ПРЕДИ да запише — отказаната заявка не
 * пълни броячите (иначе флуд от един адрес изяжда глобалния таван за всички;
 * същата грешка вече беше поправена в лимитера на админ входа).
 */
export function rateLimited(ip: string, cost = 1): boolean {
  const now = Date.now();
  const anthropic = isAnthropicEgress(ip);
  const key = anthropic ? "anthropic" : ip;
  const max = anthropic ? LIMITS.anthropic : LIMITS.ip;

  const list = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length + cost > max) {
    hits.set(key, list);
    return true;
  }
  globalHits = globalHits.filter((t) => now - t < WINDOW_MS);
  if (globalHits.length + cost > LIMITS.global) return true;

  for (let i = 0; i < cost; i++) {
    list.push(now);
    globalHits.push(now);
  }
  hits.set(key, list);
  if (hits.size > 2000) pruneHits(hits, WINDOW_MS, now);
  return false;
}


/** Само за тестове: нулира броячите между тестовете. */
export function resetRateLimits(): void {
  hits.clear();
  globalHits = [];
}
