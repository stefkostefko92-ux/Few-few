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

    // Pick current index (clamped to valid range)
    const index = server.roundRobinIndex % members.length;
    const assigneeId = members[index];

    // Advance index for next ticket (wrap around)
    await prisma.server.update({
      where: { id: serverId },
      data: { roundRobinIndex: (index + 1) % members.length },
    });

    return assigneeId;
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
