// backend/src/lib/scheduledPlan.js
// Какво да стане с всяко дължимо насрочено съобщение в тази минута.
//
// ЗАЩО (критерий А9): насрочените съобщения са Premium. За сървър, паднал на
// Free, те просто се прескачаха и оставаха „чакащи“ завинаги — зареждаха се
// наново всяка минута, а при връщане на Premium старите еднократни тръгваха
// наведнъж, със седмици закъснение. Сега:
//   • еднократно, просрочено над 24 ч → отпада (с одитен запис), който и да е планът;
//   • повтарящо се на сървър без Premium → премества се напред БЕЗ изпращане;
//   • еднократно на сървър без Premium, под 24 ч → чака (планът може да се върне).
import { nextOccurrence } from "./recurrence.js";

export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function planDueMessages(due, premiumIds, now = new Date()) {
  const send = [];
  const expire = [];
  const advance = [];
  for (const m of due) {
    const premium = premiumIds.has(m.serverId);
    if (m.recurrence) {
      if (premium) send.push(m);
      else advance.push({ id: m.id, sendAt: nextOccurrence(m.sendAt, m.recurrence, now, { timeZone: m.timeZone, anchorDay: m.anchorDay }) });
    } else if (now.getTime() - new Date(m.sendAt).getTime() > STALE_AFTER_MS) {
      expire.push(m);
    } else if (premium) {
      send.push(m);
    }
  }
  return { send, expire, advance };
}
