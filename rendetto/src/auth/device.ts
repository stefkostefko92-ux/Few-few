import type { Request, Response } from 'express';
import { z } from 'zod';
import { config, isProduction } from '../config.js';
import { canonicalJson, hmacHex, randomToken, safeEqual, sha256Hex } from '../crypto.js';

/**
 * Устройството („HWID“ в панела). Браузърът не дава хардуерен номер, затова устройството се
 * разпознава по две неща: постоянна подписана бисквитка и отпечатък от хардуера, който браузърът
 * показва (видеокарта, ядра, памет, екран). Ползва се само за сигурност: входове, свързани акаунти,
 * известие за ново устройство. Описано е в политиката за поверителност.
 */
/** Колкото живее и записът за устройството (180 дни без вход) — бисквитката не надживява целта си. */
const DEVICE_COOKIE_MAX_AGE = 180 * 24 * 60 * 60 * 1000;

export function deviceCookieName(): string {
  return isProduction() ? '__Host-rd_dev' : 'rd_dev';
}

function sign(id: string): string {
  return hmacHex(config().HMAC_KEY, `device:${id}`).slice(0, 32);
}

/** id от валидна бисквитка или null (подправената се отхвърля). */
export function readDeviceCookie(req: Request): string | null {
  const raw = ((req.cookies ?? {}) as Record<string, string | undefined>)[deviceCookieName()];
  if (!raw || raw.length > 80) return null;
  const [id, signature] = raw.split('.');
  if (!id || !signature || !/^[A-Za-z0-9_-]{22}$/.test(id)) return null;
  return safeEqual(signature, sign(id)) ? id : null;
}

/**
 * Връща id на устройството; ако няма валидна бисквитка, издава нова. Срокът се плъзга: всеки вход го
 * подновява, както и записът за устройството живее 180 дни от последното ползване.
 */
export function ensureDeviceCookie(req: Request, res: Response): string {
  const id = readDeviceCookie(req) ?? randomToken(16);
  res.cookie(deviceCookieName(), `${id}.${sign(id)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    path: '/',
    maxAge: DEVICE_COOKIE_MAX_AGE,
  });
  return id;
}

/** В базата стои само хешът на id — откраднат дъмп не дава бисквитка за подправяне. */
export function deviceCookieHash(id: string): string {
  return sha256Hex(`device:${id}`);
}

const text = (max: number) => z.string().trim().max(max).optional();
const count = (max: number) => z.number().finite().min(0).max(max).optional();

/**
 * Сигналите от `public/js/auth.js`. Всичко е ограничено по дължина и стойност. `ratio` и `langs` вече не
 * се събират (не влизат нито в хеша, нито в описанието); схемата ги приема само заради кеширан стар скрипт.
 */
export const fingerprintSchema = z
  .object({
    platform: text(40),
    cores: count(1024),
    memory: count(4096),
    screen: z
      .string()
      .regex(/^\d{2,5}x\d{2,5}$/)
      .optional(),
    depth: count(64),
    ratio: count(16),
    touch: count(64),
    tz: text(64),
    langs: text(80),
    gpuVendor: text(120),
    gpu: text(200),
  })
  .strict();

export type Fingerprint = z.infer<typeof fingerprintSchema>;

export function parseFingerprint(raw: unknown): Fingerprint | null {
  if (typeof raw !== 'string' || raw.length < 2 || raw.length > 2048) return null;
  try {
    const parsed = fingerprintSchema.safeParse(JSON.parse(raw) as unknown);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Хешът на ХАРДУЕРНАТА част (система, видеокарта, ядра, памет, дълбочина на цвета, тъч точки).
 * Езикът, часовата зона и размерът на екрана се сменят — те не влизат, иначе „HWID“ скача.
 */
export function fingerprintHash(fp: Fingerprint): string | null {
  const hardware = {
    platform: fp.platform,
    cores: fp.cores,
    memory: fp.memory,
    depth: fp.depth,
    touch: fp.touch,
    gpuVendor: fp.gpuVendor,
    gpu: fp.gpu,
  };
  if (!hardware.gpu && !hardware.cores && !hardware.platform) return null;
  return sha256Hex(`fp:${canonicalJson(hardware)}`);
}

/** „HW-3F9A-1C2B-7E04“ — кратък, четим знак за отпечатъка. */
export function hwidLabel(hash: string | null | undefined): string {
  if (!hash) return '';
  const upper = hash.slice(0, 12).toUpperCase();
  return `HW-${upper.slice(0, 4)}-${upper.slice(4, 8)}-${upper.slice(8, 12)}`;
}

const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Edg\/(\d+)/, 'Edge'],
  [/OPR\/(\d+)/, 'Opera'],
  [/Firefox\/(\d+)/, 'Firefox'],
  [/Chrome\/(\d+)/, 'Chrome'],
  [/Version\/(\d+)[\d.]* .*Safari/, 'Safari'],
];
const SYSTEMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Windows NT/, 'Windows'],
  [/Android/, 'Android'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Mac OS X/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

/** Браузър и система от User-Agent — само за четимо описание, никога за решения по сигурността. */
export function describeUserAgent(ua: string | null | undefined): { browser: string; os: string } {
  const value = ua ?? '';
  let browser = '';
  for (const [pattern, name] of BROWSERS) {
    const match = pattern.exec(value);
    if (match) {
      browser = `${name} ${match[1] ?? ''}`.trim();
      break;
    }
  }
  const os = SYSTEMS.find(([pattern]) => pattern.test(value))?.[1] ?? '';
  return { browser, os };
}

/** Четимото описание на устройството за панела и за писмото „нов вход“. */
export function deviceSummary(fp: Fingerprint | null, ua: string | null | undefined): string {
  const { browser, os } = describeUserAgent(ua);
  const parts = [
    os || fp?.platform || '',
    browser,
    fp?.screen ? fp.screen.replace('x', '×') : '',
    fp?.cores ? `${fp.cores} CPU` : '',
    fp?.memory ? `${fp.memory} GB` : '',
    fp?.gpu ?? '',
    fp?.tz ?? '',
  ].filter(Boolean);
  return parts.join(', ').slice(0, 300) || '—';
}
