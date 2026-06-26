// backend/src/i18n/en.js
// English — source of truth. All other languages translate against these keys.
export default {
  // Errors
  "error.generic": "Something went wrong.",
  "error.notFound": "Not found.",
  "error.unauthorized": "You don't have permission.",

  // Tickets
  "ticket.opened": "✅ Your ticket has been created: {{channel}}",
  "ticket.closed": "🔒 Ticket closed by {{user}}.\n**Reason:** {{reason}}",
  "ticket.claimed": "🛡️ Ticket claimed by {{user}}.",
  "ticket.unclaimed": "🔓 Ticket unclaimed. Any staff member can assist.",
  "ticket.notATicket": "❌ This is not a ticket channel.",
  "ticket.limitReached": "❌ You have {{count}} open tickets already. Close one before opening another.",
  "ticket.renamed": "✏️ Channel renamed to `{{name}}`.",
  "ticket.escalated": "⬆️ Ticket escalated to {{panel}}.",
  "ticket.feedback.prompt": "Thanks for using our support! Please rate your experience:",
  "ticket.autoClosedInactivity": "⏱️ This ticket was auto-closed after {{hours}} hours of inactivity.",
  "ticket.autoClosedLeave": "👋 This ticket was auto-closed because the creator left the server.",

  // Panels
  "panel.spawned": "Panel spawned in {{channel}}.",
  "panel.defaultButtonLabel": "Open Ticket",

  // Forms / Applications
  "form.started": "Check your DMs to answer the form.",
  "form.submitted": "✅ Thank you! Your submission has been received.",
  "form.cooldownActive": "❌ You can submit again in {{time}}.",
  "form.closedByAdmin": "❌ This form is currently closed.",
  "form.invalidAnswer": "❌ Invalid answer. {{reason}}",
  "application.approved": "✅ Your application was approved.",
  "application.denied": "❌ Your application was denied.",

  // Verification
  "verify.success": "✅ You've been verified! Welcome.",
  "verify.wrongAnswer": "❌ Wrong answer. Try again.",
  "verify.rateLimited": "❌ Too many attempts. Try again in {{minutes}} minutes.",
  "verify.accountTooNew": "❌ Your account must be at least {{days}} days old.",
  "verify.gateBlocked": "❌ You need to verify first. Please visit the verification channel.",

  // Polls & Giveaways
  "poll.voted": "✅ Vote recorded.",
  "poll.voteRemoved": "Vote removed.",
  "poll.closed": "This poll is closed.",
  "giveaway.entered": "🎉 You're entered! Good luck!",
  "giveaway.left": "You left the giveaway.",
  "giveaway.missingRoles": "❌ You need these roles to enter: {{roles}}",
  "giveaway.ended": "Giveaway ended.",
  "giveaway.winnersAnnounce": "🎉 Congratulations {{winners}}! You won **{{prize}}**!",
  "giveaway.noWinners": "😔 Giveaway for **{{prize}}** ended with no eligible entrants.",

  // Sticky & Scheduled
  "sticky.set": "📌 Sticky message set for this channel.",
  "sticky.removed": "🗑️ Sticky removed.",
  "schedule.added": "📅 Scheduled for {{time}}",

  // Premium
  "premium.required": "❌ This feature requires Premium.",
  "premium.limitReached": "❌ Limit reached: {{resource}} ({{limit}}). Upgrade to Premium.",
  "premium.trialStarted": "✨ Your 14-day Premium trial has started!",
  "premium.trialEndingSoon": "⏰ Your Premium trial ends in {{days}} days.",

  // Welcomer
  "welcomer.default": "Welcome {{user}} to {{server}}! We're now {{memberCount}} members strong.",
};
