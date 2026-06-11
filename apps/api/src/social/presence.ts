import { redis } from "../redis.js";

/**
 * Online presence. The realtime server marks a user online while they hold a
 * socket (key with a safety TTL, deleted on the last disconnect). The API only
 * reads it — e.g. to annotate the friends list. Shared key convention so both
 * services agree.
 */
export const presenceKey = (userId: string): string => `presence:online:${userId}`;

/** Map each id to whether they currently have a live socket. */
export async function onlineStatus(userIds: string[]): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  if (userIds.length === 0) return out;
  try {
    const vals = await redis.mget(...userIds.map(presenceKey));
    userIds.forEach((id, i) => {
      out[id] = vals[i] !== null && vals[i] !== undefined;
    });
  } catch {
    for (const id of userIds) out[id] = false; // fail closed: show offline
  }
  return out;
}
