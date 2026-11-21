import 'server-only';
import { prisma } from '@/lib/db';
import { needsReseal, open as openSealed, seal } from '@/lib/secret-box';
import { envSetting, isSecretSetting, SETTING_ENV, SETTING_KEYS, type SettingKey } from '@/lib/settings-spec';

// Ключовете на доставчиците (docs/security-2fa-settings-spec.md, В): настройката
// от админ панела печели пред .env; празна или нечетима (липсващ/грешен главен
// ключ) → стойността от .env (обратна съвместимост, без прекъсване). Тайните
// се дешифрират само в паметта, с кратък кеш; никога не се връщат към клиента.

const TTL_MS = 30_000;
let cache: { at: number; values: Partial<Record<SettingKey, string>> } | null = null;
// Поколение: зареждане, тръгнало преди запис и завършило след invalidate, не
// презаписва кеша със старите стойности (Кодаджията L1).
let generation = 0;

async function load(): Promise<Partial<Record<SettingKey, string>>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.values;
  const started = generation;
  let rows;
  try {
    rows = await prisma.setting.findMany();
  } catch {
    // Базата не отговаря → само .env за ТАЗИ заявка; провалът не се кешира.
    return {};
  }
  const values: Partial<Record<SettingKey, string>> = {};
  for (const row of rows) {
    const key = row.key as SettingKey;
    if (!(key in SETTING_ENV)) continue;
    const value = row.sealed ? openSealed(row.sealed, `setting:${key}`) : row.value;
    if (!value) continue;
    values[key] = value;
    // Ротация на SETTINGS_KEY: прочетено със стария ключ → шифрова се с новия.
    if (row.sealed && needsReseal(row.sealed)) {
      await prisma.setting
        .updateMany({ where: { key, sealed: row.sealed }, data: { sealed: seal(value, `setting:${key}`) } })
        .catch(() => undefined);
    }
  }
  if (started === generation) cache = { at: Date.now(), values };
  return values;
}

/** След запис от админа — следващото четене взима новата стойност веднага. */
export function invalidateSettings(): void {
  generation += 1;
  cache = null;
}

export async function setting(key: SettingKey): Promise<string | null> {
  const fromDb = (await load())[key];
  if (fromDb) return fromDb;
  return envSetting(key);
}

/** Откъде идва стойността (за админ панела — без самата стойност). */
export async function settingSource(key: SettingKey): Promise<'admin' | 'env' | 'none'> {
  if ((await load())[key]) return 'admin';
  return process.env[SETTING_ENV[key]]?.trim() ? 'env' : 'none';
}

export interface SettingStatus {
  key: SettingKey;
  /** admin = панела; broken = в панела, но не се чете (сменен SETTINGS_KEY) → важи .env */
  source: 'admin' | 'env' | 'none' | 'broken';
  /** Нетайните — самата стойност; тайните — само „••••1234“. */
  display: string | null;
  updatedAt: Date | null;
  updatedBy: string | null;
}

/** За админ панела: откъде идва всяка стойност — тайните никога в чист вид. */
export async function settingsOverview(): Promise<SettingStatus[]> {
  const rows = await prisma.setting.findMany();
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const ids = [...new Set(rows.map((row) => row.updatedBy).filter((id): id is string => Boolean(id)))];
  const admins = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } })
    : [];
  const emailOf = new Map(admins.map((admin) => [admin.id, admin.email]));
  const mask = (value: string) => `••••${value.slice(-4)}`;

  return SETTING_KEYS.map((key) => {
    const row = byKey.get(key);
    const secret = isSecretSetting(key);
    const env = process.env[SETTING_ENV[key]]?.trim() || null;
    const fromRow = row ? (row.sealed ? openSealed(row.sealed, `setting:${key}`) : row.value) : null;
    const meta = { updatedAt: row?.updatedAt ?? null, updatedBy: row?.updatedBy ? (emailOf.get(row.updatedBy) ?? null) : null };
    if (fromRow) {
      return { key, source: 'admin', display: secret ? (row?.last4 ? `••••${row.last4}` : mask(fromRow)) : fromRow, ...meta };
    }
    const fallback = env ? (secret ? mask(env) : env) : null;
    if (row) return { key, source: 'broken', display: fallback, ...meta };
    return { key, source: env ? 'env' : 'none', display: fallback, updatedAt: null, updatedBy: null };
  });
}

/** Висящи поръчки, които смяна на Revolut среда/ключ би осиротила (Продавача §4). */
export async function openRevolutOrders(): Promise<number> {
  return prisma.planOrder.count({
    where: {
      OR: [{ state: 'refund_pending' }, { state: 'pending', createdAt: { gte: new Date(Date.now() - 3 * 24 * 60 * 60_000) } }],
    },
  });
}
