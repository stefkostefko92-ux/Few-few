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
