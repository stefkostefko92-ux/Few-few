// bot/src/utils/priority.js
// Shared display helpers for Ticket.priority (v30 — LOW/NORMAL/HIGH/URGENT).
// Single place so the color/emoji mapping can't drift between /ticket priority,
// the ticket-open embeds, and /stats.
import { DANGER, WARNING, INFO, MUTED } from "./colors.js";

export const TICKET_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];

export const PRIORITY_COLORS = {
  URGENT: DANGER,
  HIGH: WARNING,
  NORMAL: INFO,
  LOW: MUTED,
};

export const PRIORITY_EMOJI = {
  URGENT: "🔴",
  HIGH: "🟠",
  NORMAL: "🔵",
  LOW: "⚪",
};

export function priorityColor(priority) {
  return PRIORITY_COLORS[priority] ?? PRIORITY_COLORS.NORMAL;
}

/**
 * Embed field for a ticket's priority — only when it's worth mentioning.
 * NORMAL is the default for every ticket, so surfacing it on every single
 * open embed would just be noise; only LOW/HIGH/URGENT get a field.
 *
 * @param {string|undefined|null} priority
 * @returns {{name: string, value: string, inline: boolean} | null}
 */
export function priorityField(priority) {
  if (!priority || priority === "NORMAL") return null;
  const emoji = PRIORITY_EMOJI[priority] || "";
  return { name: `${emoji} Priority`.trim(), value: priority, inline: true };
}
