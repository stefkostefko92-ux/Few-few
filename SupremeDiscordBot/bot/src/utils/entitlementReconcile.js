// bot/src/utils/entitlementReconcile.js
// Startup entitlement reconciliation for native Discord monetization.
//
// Discord does NOT redeliver entitlement gateway events after a disconnect, and
// a subscription's natural end arrives only as ENTITLEMENT_UPDATE with a past
// ends_at — miss that one event and the server keeps Premium forever. The docs'
// prescribed model is to treat the entitlement LIST as the source of truth, so
// on every boot we fetch all active entitlements for the application and let
// the backend converge (grant missed ones, revoke vanished ones).
import { reconcileEntitlements } from "./api.js";

const PAGE_SIZE = 100; // Discord's max per page

/**
 * Fetch ALL active entitlements for the application (paginated) and POST them
 * to the backend reconcile endpoint. Never throws — a failed reconcile logs
 * and leaves the previous state; the next boot (or live events) will catch up.
 * @param {import("discord.js").Client} client  The MAIN client, after ready.
 */
export async function runEntitlementReconcile(client) {
  try {
    const all = [];
    let after;
    // Page forward until a short page. Cap the loop defensively (100 pages =
    // 10k entitlements — far beyond anything real).
    for (let page = 0; page < 100; page++) {
      const batch = await client.application.entitlements.fetch({
        limit: PAGE_SIZE,
        excludeEnded: true,
        excludeDeleted: true,
        cache: false,
        ...(after && { after }),
      });
      if (!batch.size) break;
      all.push(...batch.values());
      if (batch.size < PAGE_SIZE) break;
      after = batch.lastKey();
    }

    const result = await reconcileEntitlements(all);
    console.log(
      `🔄 Entitlement reconcile: ${all.length} active → granted=${result.granted} revoked=${result.revoked}`
    );
  } catch (err) {
    // Non-fatal: 404/permission errors just mean monetization isn't enabled for
    // this application yet; network errors will be retried on the next boot.
    console.warn("Entitlement reconcile skipped:", err?.response?.data?.error || err.message);
  }
}
