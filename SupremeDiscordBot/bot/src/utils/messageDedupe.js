// bot/src/utils/messageDedupe.js
// И3: едно съобщение се обработва ВЕДНЪЖ за неидемпотентни ефекти (counting),
// дори когато главният и white-label ботът са в един сървър.
//
// ЗАЩО: event модулите се закачат и на главния клиент (index.js), и на всеки
// white-label клиент (services/clientManager.js) без филтър по guild. И двата
// клиента са в ЕДИН процес и ползват ЕДИН екземпляр на този модул — затова
// проста карта с TTL е достатъчна. Първият, който „заяви“ id-то, обработва;
// вторият получава false. Без това второто извикване виждаше expected=6 за
// същото „5“, нулираше броенето и публично обвиняваше невинния член.
const TTL_MS = 60_000;
const MAX_ENTRIES = 5000;
const seen = new Map(); // key → expiresAt

/** true ако това е ПЪРВОТО виждане на ключа в рамките на TTL (и го заявява). */
export function firstSeen(key, now = Date.now()) {
  if (seen.size > 0) {
    // Метене на изтеклите — картата е малка (само съобщения в counting канал).
    for (const [k, exp] of seen) { if (exp <= now) seen.delete(k); else break; }
  }
  const exp = seen.get(key);
  if (exp !== undefined && exp > now) return false;
  if (seen.size >= MAX_ENTRIES) seen.delete(seen.keys().next().value); // най-старото
  seen.set(key, now + TTL_MS);
  return true;
}

/** Само за тестове. */
export const __test = { seen, TTL_MS, MAX_ENTRIES };
