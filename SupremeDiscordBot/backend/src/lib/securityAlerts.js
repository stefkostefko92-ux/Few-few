// backend/src/lib/securityAlerts.js
// Известия за сигурност към собственика (MAIN_OWNER_ID) през Discord DM.
//
// Защо: таблото Security показва блокировки, грешни кодове и staff без MFA, но
// само ако някой го отвори. Държавно ниво значи сигналът да стига до човека,
// не да чака. Каналът е същият като транзакционните известия (dmUser през
// бота) — без нов секрет, без имейл инфраструктура.
//
// Дросел: един DM на вид събитие на 15 минути (Map в паметта; при рестарт се
// нулира — приемливо, това е известие, не одит). Одитът си остава пълен.
// SECURITY_ALERTS_DM=false изключва DM-ите (одитът остава).
import { dmUser } from "../services/botNotifier.js";

const THROTTLE_MS = 15 * 60 * 1000;
const lastSent = new Map();
const ALERT_COLOR = 0xff4d4f;

export const ALERT_KINDS = Object.freeze({
  BRUTE_FORCE_BLOCK: "brute-force-block",
  MFA_DISABLED: "mfa-disabled",
  MFA_RESET_BY_ADMIN: "mfa-reset-by-admin",
  STAFF_WITHOUT_MFA: "staff-without-mfa",
  ADMIN_IP_DENIED: "admin-ip-denied",
  DSR_FULL_ERASE: "dsr-full-erase",
});

export function alertsEnabled() {
  return String(process.env.SECURITY_ALERTS_DM ?? "true").toLowerCase() !== "false" && !!process.env.MAIN_OWNER_ID;
}

/** За тестове. */
export function _resetAlertThrottle() { lastSent.clear(); }

/**
 * Праща DM на собственика. Никога не хвърля, никога не чака дълго (dmUser е
 * fire-and-forget с таймаут в бота). Връща true, ако е опитано изпращане.
 */
export async function alertOwner(kind, title, description, fields = []) {
  if (!alertsEnabled()) return false;
  const now = Date.now();
  const last = lastSent.get(kind) || 0;
  if (now - last < THROTTLE_MS) return false;
  lastSent.set(kind, now);
  try {
    await dmUser(process.env.MAIN_OWNER_ID, {
      title: `🛡️ ${title}`,
      description: String(description).slice(0, 1800),
      color: ALERT_COLOR,
      fields: fields.slice(0, 10).map((f) => ({ name: String(f.name).slice(0, 256), value: String(f.value).slice(0, 1024), inline: !!f.inline })),
      footer: { text: `Supreme Bot security · ${kind}` },
      timestamp: new Date(now).toISOString(),
    });
  } catch { /* известието е страничен ефект */ }
  return true;
}
