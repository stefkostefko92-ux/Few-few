// Лимит по IP с фиксиран прозорец, в паметта (един процес). Таванът на ключовете пази паметта при наводнение.
export interface Limiter {
  hit(key: string, now: number): boolean;
}

export function fixedWindowLimiter(max: number, windowMs: number, maxKeys = 10_000): Limiter {
  const hits = new Map<string, { start: number; count: number }>();
  return {
    hit(key, now) {
      const cur = hits.get(key);
      if (!cur || now - cur.start >= windowMs) {
        if (hits.size >= maxKeys) {
          for (const [k, v] of hits) if (now - v.start >= windowMs) hits.delete(k);
          if (hits.size >= maxKeys) return false; // пълно с активни ключове → отказ (fail closed)
        }
        hits.set(key, { start: now, count: 1 });
        return true;
      }
      cur.count += 1;
      return cur.count <= max;
    },
  };
}

/**
 * Ключ за лимита: IPv4 — целият адрес; IPv6 — мрежата /64 (един VPS има цяла /64 и иначе би сменял адреса
 * при всяка заявка). IPv4-mapped (::ffff:1.2.3.4) се третира като IPv4.
 */
export function clientKey(ip: string | undefined): string {
  if (!ip) return "sconosciuto";
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped?.[1]) return mapped[1];
  if (!ip.includes(":")) return ip;
  const [head = "", tail = ""] = ip.toLowerCase().split("::");
  const h = head ? head.split(":") : [];
  const t = ip.includes("::") && tail ? tail.split(":") : [];
  const fill = ip.includes("::") ? Array(Math.max(0, 8 - h.length - t.length)).fill("0") : [];
  const full = [...h, ...fill, ...t];
  return `${full.slice(0, 4).map((x) => x.padStart(4, "0")).join(":")}::/64`;
}
