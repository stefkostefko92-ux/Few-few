// backend/src/services/roundRobin.js
// Round-Robin ticket assignment.
// When a new ticket is created on a Premium server with roundRobinEnabled,
// this service picks the next available staff member from the configured role
// and assigns the ticket to them.

import { prisma } from "../lib/prisma.js";
import axios from "axios";

/**
 * Pick the next assignee for a ticket using round-robin logic.
 * Uses the server's roundRobinRoleId to fetch members from Discord API.
 * Updates roundRobinIndex atomically to handle concurrent tickets correctly.
 *
 * @param {string} serverId
 * @param {string} botToken - Discord bot token to fetch role members
 * @returns {Promise<string|null>} - Discord user ID of the assignee, or null
 */
export async function pickNextAssignee(serverId, botToken) {
  try {
    // Fetch server config inside a transaction to update index atomically
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: {
        roundRobinEnabled: true,
        roundRobinRoleId: true,
        roundRobinIndex: true,
        isPremium: true,
      },
    });

    if (!server?.isPremium || !server.roundRobinEnabled || !server.roundRobinRoleId) {
      return null;
    }

    // Fetch members with the support role from Discord
    const members = await fetchRoleMembers(serverId, server.roundRobinRoleId, botToken);
    if (!members.length) return null;

    // Atomically advance the counter at the DB level. A read-then-write here
    // would race: two concurrent tickets could read the same index and get
    // assigned to the same person. `increment` is a single atomic SQL UPDATE,
    // so each concurrent call receives a distinct sequential value.
    const updated = await prisma.server.update({
      where: { id: serverId },
      data: { roundRobinIndex: { increment: 1 } },
      select: { roundRobinIndex: true },
    });

    // Use the pre-increment value, wrapped into the current member range.
    // (The raw counter grows unbounded but the modulo cycles correctly even
    // when the member count changes between tickets.)
    const index = ((updated.roundRobinIndex - 1) % members.length + members.length) % members.length;
    return members[index];
  } catch (err) {
    console.error("[Round-Robin] Error picking assignee:", err.message);
    return null;
  }
}

/**
 * Fetch Discord user IDs of all members with a specific role.
 * Uses the bot token (not user OAuth2) to call the Discord API.
 */
async function fetchRoleMembers(guildId, roleId, botToken) {
  try {
    // Fetch all guild members (up to 1000)
    const res = await axios.get(
      `https://discord.com/api/v10/guilds/${guildId}/members?limit=1000`,
      {
        headers: { Authorization: `Bot ${botToken}` },
        timeout: 8000,
      }
    );

    // Filter to members who have the target role and are not bots
    return res.data
      .filter((m) => !m.user.bot && m.roles.includes(roleId))
      .map((m) => m.user.id);
  } catch (err) {
    console.error("[Round-Robin] Failed to fetch role members:", err.message);
    return [];
  }
}
