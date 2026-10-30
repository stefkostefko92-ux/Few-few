import 'server-only';
import { headers } from 'next/headers';

// Sliding-window limit in memory: one application container behind one nginx (see DEPLOY.md).
const hits = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return true;
}

/** Forget the failures of a key after a successful login. */
export function rateReset(key: string): void {
  hits.delete(key);
}

// Client address: nginx sets X-Real-IP; otherwise the last hop of X-Forwarded-For (the one added by the proxy).
export async function clientIp(): Promise<string> {
  const h = await headers();
  const xff = (h.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return h.get('x-real-ip')?.trim() || xff[xff.length - 1] || 'unknown';
}
