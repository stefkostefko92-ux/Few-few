// bot/src/utils/commandsCatalog.js
// Single source of truth for all bot commands. Consumed by:
//   - /help slash command (bot side)
//   - CommandsPage in dashboard (via API endpoint)
// Keeping this in one place means no drift between what the bot announces
// and what the dashboard documents.

export const COMMAND_CATALOG = [
  // ═══ TICKETS ═══
  {
    category: "Tickets",
    icon: "🎫",
    description: "Open, manage, and close support tickets.",
    commands: [
      { name: "/new",      signature: "/new [panel] [reason] [on_behalf_of]",
        description: "Open a new ticket. Optionally specify the panel, a short reason, or open on behalf of another user (staff only).",
        dashboard: "Tickets page · click 'New' or use panel buttons in Discord",
        permission: "Everyone (or staff for on_behalf_of)" },
      { name: "/ticket add",      signature: "/ticket add <user>",
        description: "Add a user to the current ticket channel.",
        dashboard: "Tickets page · open ticket · Add Member",
        permission: "Ticket staff" },
      { name: "/ticket remove",   signature: "/ticket remove <user>",
        description: "Remove a user from the current ticket.",
        dashboard: "Tickets page · open ticket · Remove Member",
        permission: "Ticket staff" },
      { name: "/ticket claim",    signature: "/ticket claim",
        description: "Claim this ticket as the assignee.",
        dashboard: "Tickets page · ticket row · shield icon",
        permission: "Ticket staff" },
      { name: "/ticket unclaim",  signature: "/ticket unclaim",
        description: "Release your claim on this ticket.",
        dashboard: "Tickets page · ticket row · unclaim",
        permission: "Ticket staff" },
      { name: "/ticket close",    signature: "/ticket close [reason]",
        description: "Close this ticket (two-step confirmation if enabled on the panel).",
        dashboard: "Tickets page · close button · or click Close inside the ticket channel",
        permission: "Ticket creator or staff" },
      { name: "/ticket priority", signature: "/ticket priority <level>",
        description: "Set this ticket's priority: Low, Normal, High, or Urgent. Shown as a field on the ticket-open embed when not Normal.",
        dashboard: "Tickets page · ticket row · priority badge",
        permission: "Ticket staff" },
      { name: "/rename",          signature: "/rename <name>",
        description: "Rename the current ticket channel (e.g. to `billing-issue-42`).",
        dashboard: "Tickets page · ticket detail · rename action",
        permission: "Ticket staff" },
      { name: "/escalate",        signature: "/escalate <panel> [reason]",
        description: "Move this ticket to a different panel (different support team). Updates category + permissions.",
        dashboard: "Tickets page · ticket detail · Escalate",
        permission: "Ticket staff" },
      { name: "Create ticket from message", signature: "Right-click a message → Apps → Create ticket from message",
        description: "Open a ticket seeded with the quoted message as context. Asks which panel to use if the server has more than one.",
        dashboard: "N/A — Discord message context menu",
        permission: "Everyone" },
      { name: "Open ticket for user", signature: "Right-click a user → Apps → Open ticket for user",
        description: "Open a ticket on behalf of another member (e.g. someone with DMs closed who can't complete a form). Staff only.",
        dashboard: "N/A — Discord user context menu",
        permission: "Manage Messages or a support role" },
    ],
  },

  // ═══ CANNED RESPONSES ═══
  {
    category: "Canned Responses",
    icon: "🏷️",
    description: "Saved replies staff can post instantly instead of re-typing the same answer.",
    commands: [
      { name: "/tag use",  signature: "/tag use <name>",
        description: "Post a saved reply in the current channel.",
        dashboard: "N/A — Discord only",
        permission: "Manage Messages or a support role" },
      { name: "/tag add",  signature: "/tag add <name> <content>",
        description: "Save a new canned response (kebab-case name, ≤32 chars; content ≤1500 chars; up to 50 per server).",
        dashboard: "N/A — Discord only",
        permission: "Manage Messages or a support role" },
      { name: "/tag remove", signature: "/tag remove <name>",
        description: "Delete a canned response.",
        dashboard: "N/A — Discord only",
        permission: "Manage Messages or a support role" },
      { name: "/tag list", signature: "/tag list",
        description: "List all canned responses and how often each was used.",
        dashboard: "N/A — Discord only",
        permission: "Manage Messages or a support role" },
      { name: "Reply with tag", signature: "Right-click a message → Apps → Reply with tag",
        description: "Pick from the top 25 canned responses (by usage) and post it in this channel.",
        dashboard: "N/A — Discord message context menu",
        permission: "Manage Messages or a support role" },
    ],
  },

  // ═══ PANELS ═══
  {
    category: "Panels",
    icon: "📋",
    description: "Ticket panels — the buttons/dropdowns users click to open tickets.",
    commands: [
      { name: "/panel",  signature: "/panel <name>",
        description: "Spawn an existing panel from the dashboard into the current channel.",
        dashboard: "Panels page · create/edit/spawn panels · configure categories, welcome messages, automation",
        permission: "Manage Server" },
      { name: "/setup wizard", signature: "/setup wizard",
        description: "Interactive quick-start wizard — pick support roles, a ticket category, and an optional log channel, then jump to the dashboard to create your first panel.",
        dashboard: "Dashboard home shows setup progress",
        permission: "Manage Server" },
      { name: "/setup sync", signature: "/setup sync",
        description: "Force-sync all spawned panel messages with their current dashboard configuration.",
        dashboard: "N/A — maintenance command",
        permission: "Manage Server" },
    ],
  },

  // ═══ FORMS & APPLICATIONS ═══
  {
    category: "Forms & Applications",
    icon: "📝",
    description: "Multi-step forms (questionnaires) and applications with review workflow.",
    commands: [
      { name: "/form spawn",   signature: "/form spawn <name> [button_label]",
        description: "Post an application form button in this channel.",
        dashboard: "Forms page · create/edit forms · branching logic · validation rules",
        permission: "Manage Server" },
      { name: "/form review",  signature: "/form review <id> <action> [note]",
        description: "Manually approve or deny an application by ID. Same effect as the Approve/Deny buttons on the review embed.",
        dashboard: "Applications page · review · approve/deny",
        permission: "Manage Server" },
      { name: "/apply",  signature: "/apply <form>",
        description: "Start an application submission in DMs.",
        dashboard: "Applications page · review · approve/deny",
        permission: "Everyone" },
    ],
  },

  // ═══ VERIFICATION ═══
  {
    category: "Verification",
    icon: "✅",
    description: "Anti-bot gates. Users verify once, tickets can require a verified role.",
    commands: [
      // No slash commands — entirely dashboard-driven. Users interact via the spawned embed's buttons.
    ],
    dashboardOnly: [
      { feature: "Create verification panel",
        description: "Button / math captcha / reaction. Configure grant roles, account age gate, cooldowns.",
        dashboard: "Verification page · New Panel" },
      { feature: "Spawn in Discord",
        description: "Paste channel ID → Send icon on the panel row.",
        dashboard: "Verification page · panel row · send icon" },
      { feature: "Require verification on ticket panel",
        description: "Gate ticket creation behind specific roles.",
        dashboard: "Panels page · panel editor · Verification Gate section" },
    ],
  },

  // ═══ POLLS ═══
  {
    category: "Polls",
    icon: "📊",
    description: "Interactive polls with real-time vote counts.",
    commands: [
      { name: "/poll",   signature: "/poll <question> <options> [multi_choice] [duration_hours]",
        description: "Create a poll with up to 9 comma-separated options. Optional multi-choice and auto-close.",
        dashboard: "Automation page · Polls tab · list, view results, close early",
        permission: "Everyone" },
    ],
  },

  // ═══ GIVEAWAYS ═══
  {
    category: "Giveaways",
    icon: "🎉",
    description: "Timed prize drawings with automatic winner selection.",
    commands: [
      { name: "/giveaway start",  signature: "/giveaway start <prize> <duration_minutes> [winners] [required_roles] [description]",
        description: "Start a giveaway. Scheduler automatically picks winners when timer ends.",
        dashboard: "Automation page · Giveaways tab · start / view / end early / reroll",
        permission: "Manage Server" },
      { name: "/giveaway end",     signature: "/giveaway end <giveaway_id>",
        description: "End a giveaway early and pick winners now.",
        dashboard: "Automation page · Giveaways tab · End action",
        permission: "Manage Server" },
      { name: "/giveaway reroll",  signature: "/giveaway reroll <giveaway_id>",
        description: "Pick new winners from remaining entrants.",
        dashboard: "Automation page · Giveaways tab · Reroll action",
        permission: "Manage Server" },
    ],
  },

  // ═══ SCHEDULED & STICKY MESSAGES ═══
  {
    category: "Scheduled & Sticky Messages",
    icon: "📅",
    description: "Automate recurring messages and keep important info pinned.",
    commands: [
      { name: "/admin sticky set",    signature: "/admin sticky set <content> [title]",
        description: "Set a sticky message for this channel. Auto-reposts at the bottom as new messages arrive.",
        dashboard: "Automation page · Sticky tab",
        permission: "Manage Server" },
      { name: "/admin sticky remove", signature: "/admin sticky remove",
        description: "Remove the sticky from this channel.",
        dashboard: "Automation page · Sticky tab · Remove",
        permission: "Manage Server" },
      { name: "/admin schedule add",    signature: "/admin schedule add <content> <when> [recurrence] [channel_id]",
        description: "Schedule a message for future delivery. `when` accepts ISO timestamp or relative (`2h`, `1d`, `30m`). Optional recurrence: daily/weekly/monthly.",
        dashboard: "Automation page · Scheduled tab",
        permission: "Manage Server" },
      { name: "/admin schedule list",   signature: "/admin schedule list",
        description: "List all scheduled messages.",
        dashboard: "Automation page · Scheduled tab",
        permission: "Manage Server" },
      { name: "/admin schedule remove", signature: "/admin schedule remove <id>",
        description: "Remove a scheduled message.",
        dashboard: "Automation page · Scheduled tab · Delete",
        permission: "Manage Server" },
    ],
  },

  // ═══ INTEGRATIONS ═══
  {
    category: "Integrations",
    icon: "🔗",
    description: "Webhooks — receive real-time event notifications to your own services.",
    commands: [],
    dashboardOnly: [
      { feature: "Webhook CRUD",
        description: "Subscribe to events (ticket opened/closed, application approved, giveaway ended, etc.). Each webhook gets HMAC signing for verification.",
        dashboard: "Automation page · Webhooks tab · Create / Edit / Delete / Test" },
      { feature: "Panel duplicate",
        description: "Copy an existing ticket panel with all its configuration. Ticket counter resets to 0, message ID is cleared.",
        dashboard: "Panels page · panel row · Duplicate action" },
      { feature: "Reaction Roles",
        description: "Members react to a message to get a role, remove the reaction to lose it. Exclusive (one-role) mode supported; up to 20 emoji → role pairs per message.",
        dashboard: "Automation page · Reaction Roles tab · New Message → Post to channel" },
    ],
  },

  // ═══ SERVER ADMIN ═══
  {
    category: "Server Administration",
    icon: "⚙️",
    description: "Server-wide settings and premium features.",
    commands: [
      { name: "/premium", signature: "/premium",
        description: "Show server's premium status and upgrade link.",
        dashboard: "Premium page · view features · subscribe via Stripe",
        permission: "Everyone" },
      { name: "/debug",   signature: "/debug",
        description: "Audit the bot's permissions in this server. Flags missing perms with fix instructions.",
        dashboard: "Settings page · diagnostics section",
        permission: "Manage Server" },
      { name: "/stats",   signature: "/stats",
        description: "Ticket + staff performance snapshot: open/closed (7d/30d), top 3 staff by tickets closed, average feedback rating.",
        dashboard: "Analytics page · same data, with heatmap/funnel charts",
        permission: "Manage Server" },
      { name: "/help",    signature: "/help [category]",
        description: "Show this command reference. Optionally filter by category (e.g. tickets, polls).",
        dashboard: "Commands page · same information, searchable",
        permission: "Everyone" },
    ],
    dashboardOnly: [
      { feature: "Welcomer",
        description: "Channel embed + optional DM when a member joins. Supports {user}, {server}, {server.members} variables.",
        dashboard: "Settings page · Welcomer & Autorole" },
      { feature: "Autorole",
        description: "Automatically assign roles to new members (separate list for bots).",
        dashboard: "Settings page · Welcomer & Autorole" },
      { feature: "White-label bot (Premium)",
        description: "Replace the Supreme Bot's name and token with your own. Requires Premium.",
        dashboard: "Settings page · White-label section" },
      { feature: "AI Auto-Replies (Premium)",
        description: "AI-powered first-response suggestions in new tickets.",
        dashboard: "Settings page · AI Replies" },
      { feature: "Round-robin ticket assignment (Premium)",
        description: "Automatically distribute new tickets across your support team in rotation.",
        dashboard: "Settings page · Round-Robin" },
    ],
  },
];

/**
 * Flatten catalog to a searchable list — useful for /help filtering and dashboard search.
 */
export function getAllCommands() {
  return COMMAND_CATALOG.flatMap((cat) =>
    (cat.commands || []).map((cmd) => ({ ...cmd, category: cat.category, icon: cat.icon }))
  );
}
