// Помощници за домейни/поддомейни. Edge-безопасни (без Prisma) — ползват се и в
// middleware. Логиката за резолюция към сайт (Prisma) е в site-by-host.ts.

// Апексът, под който даваме наши поддомейни: <sub>.carbonstealth.site
export const PLATFORM_APEX = process.env.PLATFORM_APEX || "carbonstealth.site";

// Хостове на самата платформа (панел/маркетинг) — не са публични клиентски сайтове.
export function platformHosts(): string[] {
  const hosts = new Set(["localhost", "127.0.0.1"]);
  const extra = process.env.PLATFORM_HOSTS; // по избор, разделени със запетая
  if (extra) extra.split(",").forEach((h) => hosts.add(h.trim().toLowerCase()));
  try {
    const u = new URL(process.env.NEXT_PUBLIC_SITE_URL || "");
    if (u.hostname) hosts.add(u.hostname.toLowerCase());
  } catch {
    /* без базов адрес */
  }
  return [...hosts];
}

function bareHost(host: string): string {
  return host.split(":")[0].toLowerCase().replace(/\.$/, "");
}

export function isPlatformHost(host: string): boolean {
  return platformHosts().includes(bareHost(host));
}

// Ако хостът е наш поддомейн (<sub>.PLATFORM_APEX) → връща <sub>, иначе null.
export function subdomainOf(host: string): string | null {
  const h = bareHost(host);
  const suffix = `.${PLATFORM_APEX}`;
  if (h.endsWith(suffix)) {
    const sub = h.slice(0, -suffix.length);
    // само един етикет (без вложени поддомейни) и валиден
    return sub && !sub.includes(".") && isValidSubdomain(sub) ? sub : null;
  }
  return null;
}

// Валиден поддомейн-етикет (DNS label): 1–32 знака, a-z 0-9 и тире (не в краищата).
export const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
export function isValidSubdomain(s: string): boolean {
  return SUBDOMAIN_RE.test(s);
}

// Запазени поддомейни (да не се заемат от клиенти).
export const RESERVED_SUBDOMAINS = new Set([
  "www", "app", "api", "admin", "dashboard", "mail", "smtp", "ftp",
  "ns", "ns1", "ns2", "cdn", "static", "assets", "status", "blog",
  "help", "support", "docs", "login", "platform",
]);

// Валиден апекс/хост за собствен домейн (напр. example.com, sub.example.com).
export const DOMAIN_RE =
  /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.[a-z0-9-]{1,63})+$/;
export function isValidDomain(d: string): boolean {
  const h = bareHost(d);
  return DOMAIN_RE.test(h) && !h.endsWith(`.${PLATFORM_APEX}`);
}
