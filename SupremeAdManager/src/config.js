// Централна конфигурация — всичко чувствително идва от средата (никога от репото).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3060),
  baseUrl: process.env.BASE_URL || 'http://localhost:3060',
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'admanager.db'),

  // Ключ за криптиране на API токените в покой (32 байта hex). Задължителен в продукция.
  encryptionKey: process.env.ENCRYPTION_KEY || '',

  session: {
    cookieName: 'sam_session',
    // Секрет за подписване на сесията; в продукция — от средата (fail-fast по-долу).
    secret: process.env.SESSION_SECRET || 'dev-only-insecure-secret',
    maxAgeMs: 1000 * 60 * 60 * 8, // 8 часа
  },

  admin: {
    email: process.env.ADMIN_EMAIL || '',
    // bcrypt хеш на паролата (генерирай с: node -e "console.log(require('bcryptjs').hashSync('парола', 12))")
    passwordHash: process.env.ADMIN_PASSWORD_HASH || '',
  },

  // Google Ads API — REST. Версията се вдига съзнателно, не автоматично (deprecation цикъл ~1 г.).
  google: {
    apiVersion: process.env.GOOGLE_ADS_API_VERSION || 'v24',
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
    loginCustomerId: (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '').replace(/-/g, ''),
  },

  // Meta Marketing API — Graph API. Версията се вдига съзнателно (всяка живее ~2 г.).
  meta: {
    apiVersion: process.env.META_API_VERSION || 'v25.0',
    appId: process.env.META_APP_ID || '',
    appSecret: process.env.META_APP_SECRET || '',
  },

  // Автоматизация: колко често се изпълнява цикълът синхронизация + правила (мин.).
  scheduler: {
    intervalMinutes: Number(process.env.SCHEDULER_INTERVAL_MINUTES || 30),
    enabled: process.env.SCHEDULER_ENABLED !== 'false',
  },

  // Твърди предпазители на бюджета (виж guard.js) — платформено-агностични тавани.
  guards: {
    // Максимален дневен бюджет на кампания, който приложението изобщо приема (в валутни единици).
    maxDailyBudget: Number(process.env.GUARD_MAX_DAILY_BUDGET || 500),
    // Максимален общ дневен бюджет през всички активни кампании.
    maxTotalDailyBudget: Number(process.env.GUARD_MAX_TOTAL_DAILY_BUDGET || 1500),
  },
};

// Fail-fast: сесийният секрет подписва админ бисквитката (пълен контрол над бюджети) —
// известният dev низ в продукция = фалшифицируема сесия. Симетрично на ENCRYPTION_KEY.
if (
  config.env === 'production' &&
  (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
) {
  throw new Error('SESSION_SECRET е задължителен в продукция (≥32 знака)');
}

export function isDryRun() {
  // Без реални креденшъли работим в dry-run: всичко се симулира локално,
  // за да може приложението да се разучава и тества без да харчи стотинка.
  const g = config.google;
  const m = config.meta;
  const googleReady = g.developerToken && g.clientId && g.clientSecret;
  const metaReady = m.appId && m.appSecret;
  return !(googleReady || metaReady);
}
