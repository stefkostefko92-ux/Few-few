// Определяне на клиентския IP за rate limit и одит.
//
// `X-Forwarded-For` е ИЗЦЯЛО подправим от клиента, когато няма прокси пред нас:
// атакуващият ротира стойността и си вади свеж bucket за всяка заявка, тоест
// ограничението на честотата просто не съществува. Затова:
//
//   TRUSTED_PROXY_HOPS=0 (по подразбиране) → XFF се ИГНОРИРА напълно.
//   TRUSTED_PROXY_HOPS=1 → доверяваме се на последния елемент (един наш Nginx).
//   TRUSTED_PROXY_HOPS=2 → предпоследния (напр. CDN + Nginx). И т.н.
//
// Стойността се задава СПОРЕД реалната топология на разгръщането — не е
// предположение, което кодът може да отгатне.

const HOPS = Math.max(0, Number(process.env.TRUSTED_PROXY_HOPS ?? 0));

/**
 * Ключ за ограничаване на честотата. Когато няма доверено прокси, всички
 * заявки без надежден източник споделят един bucket — това е СЪЗНАТЕЛНО:
 * по-добре общ таван, отколкото таван, който се заобикаля с един хедър.
 */
export function ipClient(headers: Headers): string {
  if (HOPS === 0) return "diretto";
  const xff = headers.get("x-forwarded-for");
  if (!xff) return "diretto";
  const parti = xff
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  // Броим от края: последният е добавен от най-близкото прокси.
  const indice = parti.length - HOPS;
  return parti[indice] ?? parti[0] ?? "diretto";
}
