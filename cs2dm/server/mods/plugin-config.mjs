#!/usr/bin/env node
// Конфигът на плъгина CarbonStealth (configs/plugins/CarbonStealth/CarbonStealth.json) от променливите
// на /etc/cs2/cs2.env. Вика го install-plugins.sh; изходът отива във файл 0600. Нула зависимости.
// Невалидна стойност → ясна грешка (exit 1), никога тих конфиг с половин настройки.
import { pathToFileURL } from 'node:url';

const KEY = /^[a-z0-9_-]{1,32}$/;
const MODEL = /^models\/[a-z0-9_/-]+\.vmdl$/;
const TEXT_BANNERS = new Set(['carbonstealth', 'adblock']);

/** „logo=models/carbonstealth/logo.vmdl,shot1=models/…“ → { logo: "models/…", … } */
export function parseBannerModels(raw) {
  const out = {};
  for (const part of (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const i = part.indexOf('=');
    const key = i > 0 ? part.slice(0, i).trim() : '';
    const model = i > 0 ? part.slice(i + 1).trim() : '';
    if (!KEY.test(key) || TEXT_BANNERS.has(key) || !MODEL.test(model) || model.includes('..')) {
      throw new Error(`CS2DM_BANNER_MODELS: невалиден запис „${part}“ (ключ a-z0-9_- и път models/….vmdl)`);
    }
    out[key] = model;
  }
  return out;
}

function intIn(raw, name, def, min, max) {
  if (raw === undefined || raw === '') return def;
  if (!/^\d+$/.test(raw)) throw new Error(`${name}: очаква цяло число`);
  const n = Number(raw);
  if (n !== 0 && (n < min || n > max)) throw new Error(`${name}: 0 или ${min}–${max}`);
  return n;
}

/** IANA часова зона (както DISPLAY_TZ на сайта); празно → Europe/Sofia. Проверява я Intl на Node. */
export function timeZone(raw) {
  const tz = raw === undefined || raw === '' ? 'Europe/Sofia' : raw;
  const bad = new Error('CS2DM_DISPLAY_TZ: непозната часова зона (IANA, напр. Europe/Sofia)');
  if (!/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(tz)) throw bad;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    throw bad;
  }
  return tz;
}

export function buildConfig(env) {
  const db = env.CS2DM_DB_CONNECTION ?? '';
  if (!/(^|;)\s*Host=/i.test(db) || !/(^|;)\s*Password=/i.test(db)) {
    throw new Error('CS2DM_DB_CONNECTION: очаква Npgsql низ „Host=…;Port=…;Database=…;Username=…;Password=…“');
  }
  const bridgeKey = env.CS2DM_BRIDGE_KEY ?? '';
  const site = (env.CS2DM_SITE_URL || 'cs2.carbonstealth.eu').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!/^[a-z0-9.-]+(\/[a-z0-9/_-]*)?$/i.test(site)) throw new Error('CS2DM_SITE_URL: невалиден адрес');
  return {
    DatabaseConnection: db,
    RedisConnection: env.CS2DM_REDIS_CONNECTION ?? '',
    // Под 32 знака плъгинът изключва моста — по-добре изключен, отколкото със слаб ключ.
    BridgeKey: bridgeKey.length >= 32 ? bridgeKey : '',
    SiteUrl: site,
    PublicSlots: intIn(env.CS2DM_PUBLIC_SLOTS, 'CS2DM_PUBLIC_SLOTS', 0, 1, 64),
    FlushSeconds: 10,
    AdvertSeconds: intIn(env.CS2DM_ADVERT_SECONDS, 'CS2DM_ADVERT_SECONDS', 240, 60, 3600),
    // Безкраен резерв на патроните; изключва се само изрично с CS2DM_INFINITE_AMMO=0.
    InfiniteReserveAmmo: env.CS2DM_INFINITE_AMMO !== '0',
    BannerModels: parseBannerModels(env.CS2DM_BANNER_MODELS),
    // Честна игра: без вход N секунди (жив) → наблюдател; среден пинг над прага → наблюдател. 0 = изключено.
    AfkSeconds: intIn(env.CS2DM_AFK_SECONDS, 'CS2DM_AFK_SECONDS', 90, 30, 3600),
    MaxPing: intIn(env.CS2DM_MAX_PING, 'CS2DM_MAX_PING', 150, 50, 1000),
    // Защитата при поява е в CarbonStealth (тази на Deathmatch 1.3.6 не тръгва — виж SpawnProtection.cs).
    SpawnProtectionSeconds: intIn(env.CS2DM_SPAWN_PROTECTION, 'CS2DM_SPAWN_PROTECTION', 5, 1, 15),
    // Горещата зона (CONTRACT §15): на всеки N минути за 3 минути двойно XP вътре. 0 = изключено.
    HotZoneEveryMinutes: intIn(env.CS2DM_HOTZONE_EVERY, 'CS2DM_HOTZONE_EVERY', 8, 4, 60),
    // Денят на мисиите и седмицата на купата (CONTRACT §16–17) — същата зона като DISPLAY_TZ на сайта.
    DisplayTimeZone: timeZone(env.CS2DM_DISPLAY_TZ),
    ConfigVersion: 1,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.stdout.write(`${JSON.stringify(buildConfig(process.env), null, 2)}\n`);
  } catch (e) {
    process.stderr.write(`plugin-config: ${e.message}\n`);
    process.exit(1);
  }
}
