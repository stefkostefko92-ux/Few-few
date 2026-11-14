// backend/src/lib/platformSettings.js
// Настройки на ПЛАТФОРМАТА (не на сървър) — една стойност по ключ в `platform_settings`.
//
// Четат се от публичен маршрут (`/support`), затова:
//   • има кратък кеш в паметта — анонимен трафик не стига до базата на всяка заявка;
//   • записът го обезсилва веднага — смяната важи от следващата заявка;
//   • при недостъпна база се връща ПОСЛЕДНАТА позната стойност (ако има), а не грешка —
//     линкът за поддръжка е точно това, което човек търси, когато нещо не работи.
// НИКОГА тайни тук: стойностите излизат навън.
import { prisma } from "./prisma.js";

const TTL_MS = 30_000;
// Грешка от базата не се пита наново при всяка заявка — иначе публичен адрес се
// превръща в чук върху база, която вече е в беда.
const ERROR_TTL_MS = 5_000;
const cache = new Map(); // key → { value: string|null, at: number, ttl: number }
// Брой записи по ключ. Четене, започнало преди запис и завършило след него, носи
// СТАРА стойност — без този брояч то я слагаше в кеша върху новата (ревю 13.11.2026).
const writes = new Map(); // key → number
const writeCount = (key) => writes.get(key) || 0;

/** Стойността по ключ или null. Не хвърля. */
export async function getPlatformSetting(key) {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < hit.ttl) return hit.value;
  const seen = writeCount(key);
  // Изпреварено от запис четене не пипа кеша и връща това, което записът е оставил.
  const overtaken = () => writeCount(key) !== seen;
  const afterWrite = () => cache.get(key)?.value ?? null;
  try {
    const row = await prisma.platformSetting.findUnique({ where: { key } });
    if (overtaken()) return afterWrite();
    const value = typeof row?.value === "string" ? row.value : null;
    cache.set(key, { value, at: now, ttl: TTL_MS });
    return value;
  } catch (err) {
    console.error(`[platformSettings] четенето на „${key}“ не успя:`, err?.message);
    if (overtaken()) return afterWrite();
    const value = hit ? hit.value : null;
    cache.set(key, { value, at: now, ttl: ERROR_TTL_MS });
    return value;
  }
}

/** Записва стойност; null/"" я маха. Хвърля при грешка от базата — записът не бива да „успее“ наужким. */
export async function setPlatformSetting(key, value) {
  const remove = value === null || value === undefined || value === "";
  const v = remove ? null : String(value);
  if (remove) await prisma.platformSetting.deleteMany({ where: { key } });
  else await prisma.platformSetting.upsert({ where: { key }, create: { key, value: v }, update: { value: v } });
  // Броячът и кешът се сменят заедно, без await помежду им — четене не може да се вмъкне.
  writes.set(key, writeCount(key) + 1);
  cache.set(key, { value: v, at: Date.now(), ttl: TTL_MS });
  return v;
}

/** Само за тестове. */
export function _resetPlatformSettingsCache() {
  cache.clear();
  writes.clear();
}
