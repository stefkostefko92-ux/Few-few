import "server-only";
import { prisma } from "@/lib/prisma";
import { SETTING_KEYS } from "@/lib/settings";
import { resolveSmtp, type MailDbValues, type ResolvedMail } from "@/lib/mail-config-core";

// Откъде тръгват писмата сега: настройката от /admin/poshta (Brevo), ако е
// включена; иначе SMTP_* от .env; иначе без поща (сигналите пак се записват).
// Кратък кеш, за да не се чете базата при всяко писмо; записът го чисти веднага.

const KEYS = {
  enabled: SETTING_KEYS.mailEnabled,
  host: SETTING_KEYS.mailHost,
  port: SETTING_KEYS.mailPort,
  user: SETTING_KEYS.mailUser,
  keyEnc: SETTING_KEYS.mailKeyEnc,
  fromName: SETTING_KEYS.mailFromName,
  fromEmail: SETTING_KEYS.mailFromEmail,
} as const;

const TTL_MS = 20_000;
let cache: { at: number; value: ResolvedMail } | null = null;

export function clearMailConfigCache(): void {
  cache = null;
}

export const authSecret = (): string => process.env.AUTH_SECRET ?? "";

/** Записаното в панела, както е в базата (вкл. шифрования ключ — само за сървъра). */
export async function readMailDb(): Promise<MailDbValues> {
  const rows = await prisma.siteSetting.findMany({ where: { key: { in: Object.values(KEYS) } } });
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const out: MailDbValues = {};
  for (const [name, key] of Object.entries(KEYS) as [keyof MailDbValues, string][]) {
    const v = m.get(key);
    if (v) out[name] = v;
  }
  return out;
}

/** Параметрите за писмо сега. Базата не отговаря → важи .env (страницата върви и без панела). */
export async function getMailConfig(): Promise<ResolvedMail> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let db: MailDbValues = {};
  try {
    db = await readMailDb();
  } catch {
    console.error("Пощата: настройката от панела не се прочете — важи .env.");
  }
  const value = resolveSmtp(db, process.env, authSecret());
  if (value.panelKeyBroken) console.error("Пощата: ключът от панела не се разшифрова — важи .env.");
  cache = { at: Date.now(), value };
  return value;
}

/** За страницата в панела: записаното БЕЗ ключа и откъде тръгват писмата. */
export async function mailStatus() {
  const [db, resolved, meta] = await Promise.all([
    readMailDb(),
    getMailConfig(),
    prisma.siteSetting.findMany({
      where: { key: { in: [SETTING_KEYS.mailUpdatedBy, SETTING_KEYS.mailUpdatedAt] } },
    }),
  ]);
  const m = new Map(meta.map((r) => [r.key, r.value]));
  return {
    saved: db.host
      ? {
          host: db.host,
          port: db.port ?? "",
          user: db.user ?? "",
          fromName: db.fromName ?? "",
          fromEmail: db.fromEmail ?? "",
        }
      : null,
    enabled: db.enabled === "1",
    keySaved: Boolean(db.keyEnc),
    source: resolved.params?.source ?? null,
    panelKeyBroken: resolved.panelKeyBroken,
    updatedBy: m.get(SETTING_KEYS.mailUpdatedBy) ?? "",
    updatedAt: m.get(SETTING_KEYS.mailUpdatedAt) ?? "",
  };
}
