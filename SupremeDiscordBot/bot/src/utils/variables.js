// bot/src/utils/variables.js
// TicketTool-style variable interpolation for panel messages.
//
// Supported placeholders:
//   {user}              → <@discord_id> mention
//   {user.mention}      → <@discord_id> (alias)
//   {user.name}         → username
//   {user.tag}          → username#discriminator (legacy) or username
//   {user.id}           → discord ID
//   {ticket}            → <#channel_id> mention
//   {ticket.channel}    → <#channel_id> (alias)
//   {ticket.name}       → channel name (e.g. "ticket-0042-alice")
//   {ticket.count}      → zero-padded ticket number (e.g. "0042")
//   {ticket.number}     → raw number ("42")
//   {ticket.id}         → internal UUID
//   {ticket.reason}     → command-style open reason (optional)
//   {server}            → server name
//   {server.name}       → server name (alias)
//   {server.id}         → guild ID
//   {server.members}    → member count (requires passed ctx)
//   {panel.name}        → panel name
//   {staff}             → pings all support roles (mentions)
//   {date}              → YYYY-MM-DD
//   {time}              → HH:MM UTC

export function interpolate(template, ctx = {}) {
  if (!template) return null;
  const {
    user, ticket, server, panel, reason, supportRoleIds, memberCount,
  } = ctx;

  const pad = (n, len = 4) => String(n ?? 0).padStart(len, "0");
  const now = new Date();

  const vars = {
    "user":                user?.id ? `<@${user.id}>` : "",
    "user.mention":        user?.id ? `<@${user.id}>` : "",
    "user.name":           user?.username || "",
    "user.tag":            user?.tag || user?.username || "",
    "user.id":             user?.id || "",
    "ticket":              ticket?.channelId ? `<#${ticket.channelId}>` : "",
    "ticket.channel":      ticket?.channelId ? `<#${ticket.channelId}>` : "",
    "ticket.name":         ticket?.channelName || "",
    "ticket.count":        pad(ticket?.number, ticket?.padding ?? 4),
    "ticket.number":       String(ticket?.number ?? ""),
    "ticket.id":           ticket?.id || "",
    "ticket.reason":       reason || "",
    "server":              server?.name || "",
    "server.name":         server?.name || "",
    "server.id":           server?.id || "",
    "server.members":      String(memberCount ?? ""),
    "panel.name":          panel?.name || "",
    "staff":               (supportRoleIds || []).map((r) => `<@&${r}>`).join(" "),
    "date":                now.toISOString().slice(0, 10),
    "time":                now.toISOString().slice(11, 16) + " UTC",
  };

  // Replace {key} globally. Longer keys first to avoid partial matches.
  const keys = Object.keys(vars).sort((a, b) => b.length - a.length);
  return keys.reduce(
    (s, k) => s.replaceAll(`{${k}}`, vars[k]),
    template
  );
}

/** Build a default welcome message if none is set. */
export function defaultWelcomeMessage() {
  return "Hello {user}, welcome to your ticket! Support will be with you shortly.\n\nWhen you're done, press the **Close** button below.";
}

/** Build a default close-ask message. */
export function defaultCloseAskMessage() {
  return "Are you sure you want to close this ticket, {user}?";
}
