// frontend/src/data/featurePages.js
// Страниците /features/* — по една за всяка функция, която хората ТЪРСЯТ като
// отделен бот („discord ticket bot", „discord verification bot", „reaction
// roles bot", „giveaway bot", „welcome bot", „logging bot", „sticky message
// bot", „poll bot", „application bot"). Заявките са сверени с живите подсказки
// на Google/Bing/DuckDuckGo на 18.09.2026 (tools: scratchpad suggest.py);
// най-честите опашки са „setup", „free", „dashboard", „with role requirements",
// „log deleted messages", „anonymous" — затова всяка страница отговаря на тях
// още в първия абзац (AEO: отговор отпред) и в FAQ.
//
// ЕДИН източник за три консуматора: React страницата (FeaturePage.jsx),
// pre-render снимката (scripts/prerender.mjs — за обхождачи без JavaScript) и
// гейтът (featurePages.test.js). Числата идват от backend/src/lib/premium.js
// (BASE_LIMITS / PREMIUM_LIMITS / PREMIUM_FEATURES) и от каталога на командите;
// промяна там → промяна тук → гейтът пада, ако сме забравили.
//
// Правило на репото: ≥5 ключови думи на страница, една винаги „carbon stealth".
//
// БЕЗ import от components/Seo.jsx: този файл се чете и от scripts/prerender.mjs
// под Node (без JSX/React). SITE се дублира нарочно; featurePages.test.js
// гейтва, че е равен на Seo.SITE.
const SITE = "https://supremebot.carbonstealth.eu";

export const FEATURES_HUB = {
  path: "/features",
  nav: "All features",
  title: "Supreme Bot Features — Discord Ticket Bot, Forms, Verification & More",
  description:
    "Every Supreme Bot feature on one page: ticket system, application forms, verification, reaction roles, giveaways, welcome messages, server logs, sticky and scheduled messages, polls, AI replies, white-label bots and the Server Season game.",
  keywords: ["discord bot features", "discord ticket bot", "discord bot dashboard", "all in one discord bot", "discord leveling bot", "supreme bot", "carbon stealth"],
  h1: "One Discord bot, thirteen jobs",
  answer:
    "Supreme Bot replaces a folder of single-purpose Discord bots with one bot and one web dashboard: a ticket system with transcripts, application forms with a review workflow, member verification, reaction roles, giveaways, welcome messages and autoroles, server activity logs, sticky and scheduled messages, polls, an AI-assisted support layer, an optional white-label bot and Server Season — a leveling and collecting game with level roles, a server shop, companions, weekly server quests, counting and trivia. The base tier is free forever; Premium is €4.99 per server per month, sold through the Discord store.",
};

export const FEATURE_PAGES = [
  {
    slug: "discord-ticket-system",
    path: "/features/discord-ticket-system",
    nav: "Ticket system",
    title: "Discord Ticket System Bot — Panels, Transcripts, Claim & Escalate",
    description:
      "Supreme Bot's Discord ticket system: button or dropdown panels, private ticket channels or threads, claim, escalate, priority levels, two-step close and HTML transcripts that survive channel deletion. Free tier included.",
    keywords: ["discord ticket system", "discord ticket bot", "discord support ticket bot", "ticket bot dashboard", "discord ticket bot free", "ticket bot setup", "supreme bot", "carbon stealth"],
    h1: "Discord ticket system",
    answer:
      "Supreme Bot is a Discord ticket bot: members click a button on a panel, the bot opens a private ticket channel or thread for them and your support roles, and staff work the ticket with claim, escalate, priority, add/remove member and a two-step close. Every ticket produces an HTML transcript that survives the channel being deleted and records edited and deleted messages. The Free tier includes one panel with unlimited tickets and 30-day transcript retention; Premium (€4.99/server/month) raises this to 50 panels, unlimited retention, round-robin assignment, SLA timers and feedback ratings.",
    steps: [
      { title: "Invite the bot and run /setup wizard", body: "The wizard asks for your support roles, a ticket category and an optional log channel, then sends you to the dashboard. The bot needs Manage Channels, Manage Roles, Manage Threads and Read Message History — /debug audits the permissions and tells you what is missing." },
      { title: "Build a panel in the dashboard", body: "Dashboard → your server → Panels. Each button or dropdown option is a ticket type (Support, Report, Billing…) with its own label, emoji, colour, category, support roles and an optional application form that opens before the ticket. Layouts: buttons, dropdown or threads." },
      { title: "Spawn it in a channel", body: "Click Spawn in the dashboard or run /panel spawn <name>. Members open tickets by clicking; staff can also open one for someone with /new or the “Open ticket for user” context menu, or turn any message into a ticket with “Create ticket from message”." },
      { title: "Work the ticket", body: "/ticket claim, /ticket unclaim, /ticket priority (Low, Normal, High, Urgent), /ticket add and remove, /rename, /escalate to another panel's team. Staff can also reply straight from the web dashboard. Saved replies are one command away with /tag use." },
      { title: "Close and keep the record", body: "/ticket close (with an optional reason and a two-step confirmation if the panel enables it). The transcript is generated automatically, stored encrypted at rest and stays available in the dashboard after the Discord channel is gone." },
    ],
    tiers: [
      ["Ticket panels", "1", "50"],
      ["Tickets per panel", "Unlimited", "Unlimited"],
      ["Transcript retention", "30 days after close", "Unlimited"],
      ["Claim, escalate, rename", "—", "Included"],
      ["Round-robin assignment", "—", "Included"],
      ["SLA timers, feedback ratings, inactivity auto-close", "—", "Included"],
      ["Observer roles, DM on open/close, separate open/closed categories", "—", "Included"],
      ["Staff replies from the dashboard, priority levels, two-step close", "Included", "Included"],
      ["CSV export", "—", "Included"],
    ],
    faq: [
      { q: "Is the Discord ticket bot free?", a: "Yes. The Free tier includes one ticket panel with unlimited tickets, priority levels, two-step close, staff replies from the dashboard and HTML transcripts kept for 30 days after a ticket closes. Premium (€4.99 per server per month, billed through the Discord store) adds 50 panels, unlimited retention, claim/escalate/rename, round-robin assignment and SLA timers." },
      { q: "Where are ticket transcripts stored and do they survive channel deletion?", a: "Transcripts are generated by the bot when a ticket closes, stored encrypted at rest on EU servers (Hetzner, Germany) and shown in the dashboard. They do not depend on the Discord channel existing, and they record edits and deletions with the original text." },
      { q: "Which permissions does the ticket bot need?", a: "View Channels, Send Messages, Manage Channels (to create ticket channels), Manage Roles, Manage Threads, Read Message History, Embed Links and Attach Files. The invite link requests exactly these; Administrator is never requested. Run /debug to audit them in your server." },
      { q: "Can I use threads instead of channels for tickets?", a: "Yes. A panel can use the Threads layout, which opens a private thread per ticket instead of a channel. Buttons and dropdown layouts open channels in the category you choose." },
      { q: "Can staff reply without opening Discord?", a: "Yes. The Tickets page of the dashboard lists open tickets; staff can read the conversation and reply from the browser, and the reply is posted in the ticket channel by the bot." },
    ],
    related: ["/guides/ticket-panel-setup", "/guides/best-discord-ticket-bot", "/compare/ticket-tool-alternative", "/features/discord-support-bot-ai"],
  },
  {
    slug: "discord-application-forms",
    path: "/features/discord-application-forms",
    nav: "Application forms",
    title: "Discord Application Bot & Forms — Staff Applications with Review",
    description:
      "Build Discord application forms and questionnaires: multi-step questions in DMs, validation, conditional branching, an approve/deny review dashboard with reasons, and automatic roles on approval. Free tier: 2 forms, 5 questions each.",
    keywords: ["discord application bot", "discord form bot", "application form discord bot", "discord staff application bot", "discord application bot free", "supreme bot", "carbon stealth"],
    h1: "Application forms for Discord",
    answer:
      "Supreme Bot is a Discord application bot: you design a form in the dashboard, post it as a button with /form spawn or let members start it with /apply, and the bot asks the questions one by one in the member's DMs. Submissions land on a review page where staff approve or deny with a reason that is sent back to the applicant; approvals can grant a role automatically. The Free tier includes two forms with five questions each; Premium raises this to 50 forms with 50 questions, adds conditional branching, regex validation, submission cooldowns and custom DM messages.",
    steps: [
      { title: "Create the form", body: "Dashboard → your server → Forms. Add questions (short text, paragraph, single or multiple choice, number), mark required ones and set validation rules. On Premium, add branching so the next question depends on the previous answer, and regex validation for things like an in-game ID." },
      { title: "Publish it", body: "Run /form spawn <name> in a channel to post an application button, or tell members to use /apply <form>. A form can also be attached to a ticket panel button so it opens before the ticket." },
      { title: "Applicant fills it in DMs", body: "The bot walks the applicant through the questions privately, step by step, and confirms the submission. Cooldowns (Premium) stop repeat submissions." },
      { title: "Review and decide", body: "Applications page → open the submission → Approve or Deny with a note; the applicant receives the decision by DM. Need to ask something first? Open a private discussion channel with the applicant before deciding. Staff can also use /form review <id> <action>." },
      { title: "Automate the outcome", body: "On Premium, an approval or denial can grant or remove roles automatically, and the DM texts are customisable. Every decision is kept in the applicant history for the server." },
    ],
    tiers: [
      ["Forms", "2", "50"],
      ["Questions per form", "5", "50"],
      ["Conditional branching, regex validation", "—", "Included"],
      ["Submission cooldowns", "—", "Included"],
      ["Auto role on approve / deny", "—", "Included"],
      ["Custom DM messages", "—", "Included"],
      ["Review dashboard, decision reasons, private discussion channel", "Included", "Included"],
    ],
    faq: [
      { q: "Is there a free Discord application bot?", a: "Yes. Supreme Bot's Free tier includes two application forms with up to five questions each, the review dashboard and decision reasons sent to the applicant. Premium adds 50 forms, 50 questions, branching, regex validation, cooldowns and auto roles." },
      { q: "Where does the applicant answer the questions?", a: "In their Discord DMs with the bot, one question at a time. Nothing is posted in a public channel; only the review team sees the answers in the dashboard." },
      { q: "Can an application open a ticket?", a: "Yes. Attach a form to a ticket panel button and the form runs before the ticket is created; the answers are posted into the new ticket for staff." },
      { q: "Can I talk to the applicant before deciding?", a: "Yes. From the review page you can open a private discussion channel with the applicant, ask follow-up questions, then approve or deny." },
    ],
    related: ["/compare/appy-alternative", "/features/discord-ticket-system", "/features/discord-verification-bot"],
  },
  {
    slug: "discord-verification-bot",
    path: "/features/discord-verification-bot",
    nav: "Verification",
    title: "Discord Verification Bot — Button, Captcha & Account-Age Gate",
    description:
      "Stop bots and raiders with Supreme Bot's Discord verification: one-click button verification on the Free tier, math captcha and minimum account age on Premium, auto role on success, brute-force protection and no IP collection.",
    keywords: ["discord verification bot", "discord captcha bot", "discord verification bot free", "discord age verification bot", "discord anti bot verification", "verification bot setup", "supreme bot", "carbon stealth"],
    h1: "Verification and anti-bot gate",
    answer:
      "Supreme Bot's verification panel asks a new member to click a button (Free) or solve a short math captcha (Premium) before they get the verified role. On Premium you can also require a minimum Discord account age, and ticket panels can be locked behind the verified role so unverified accounts cannot open tickets. Repeated failures are rate-limited, attempts are kept for 90 days and then deleted, and no IP addresses are collected — Discord interactions do not carry any.",
    steps: [
      { title: "Create a verification panel", body: "Dashboard → your server → Verification. Choose the type (button, or math captcha on Premium), the role to grant on success and, on Premium, the minimum account age in days." },
      { title: "Post it and restrict the server", body: "Spawn the panel in your #verify channel. Configure your channel permissions so unverified members only see that channel; the granted role unlocks the rest." },
      { title: "Gate tickets and forms", body: "In a ticket panel's settings, require the verified role — unverified accounts cannot open tickets or forms attached to that panel." },
      { title: "Watch the numbers", body: "The dashboard shows daily verification counts per panel. Attempt records are pruned automatically after 90 days and are deleted on any /privacy delete request." },
    ],
    tiers: [
      ["Verification panels", "1", "10"],
      ["Button verification", "Included", "Included"],
      ["Math captcha", "—", "Included"],
      ["Minimum account age", "—", "Included"],
      ["Auto role on success, brute-force protection", "Included", "Included"],
    ],
    faq: [
      { q: "Is the verification bot free?", a: "Button verification with an auto role is free (one panel). Math captcha, the account-age gate and up to ten panels are Premium features." },
      { q: "Does the bot collect IP addresses or personal data for verification?", a: "No IP addresses are collected: the bot only receives Discord interactions, which do not carry them. It stores the user id, the panel, the outcome and a timestamp for 90 days, then deletes them automatically." },
      { q: "How does account-age verification work?", a: "Premium panels can require a minimum account age in days. The bot compares the Discord account creation date with your threshold when the member clicks; accounts that are too new are told the minimum age required." },
      { q: "Can I require verification before opening a ticket?", a: "Yes. Set the verified role as required on a ticket panel and only verified members can open tickets there." },
    ],
    related: ["/features/discord-ticket-system", "/features/discord-welcome-bot-autorole", "/guides/gdpr-discord-bot"],
  },
  {
    slug: "discord-reaction-roles",
    path: "/features/discord-reaction-roles",
    nav: "Reaction roles",
    title: "Discord Reaction Roles Bot — Self-Assign Roles with Emoji",
    description:
      "Set up Discord reaction roles in the dashboard: up to 20 emoji-to-role pairs per message, exclusive pick-one mode, the bot adds the reactions for you, and removing a reaction removes the role. Free tier included.",
    keywords: ["discord reaction roles bot", "reaction roles discord free", "discord self assign roles bot", "reaction role setup", "discord role menu bot", "supreme bot", "carbon stealth"],
    h1: "Reaction roles",
    answer:
      "Reaction roles let members give themselves a role by reacting to a message with an emoji and drop it by removing the reaction. In Supreme Bot you configure the message in the dashboard with up to 20 emoji-to-role pairs, optionally in exclusive mode (one role at a time, useful for colour or region roles), and the bot posts the message and places the initial reactions itself. The Free tier includes two reaction-role messages per server; Premium raises this to 25.",
    steps: [
      { title: "Create the message", body: "Dashboard → your server → Automation → Reaction roles. Write the message text, then add pairs: pick an emoji (standard or one of your server's custom emojis) and the role it grants." },
      { title: "Choose the mode", body: "Normal mode lets a member hold several roles from one message. Exclusive mode removes the previous role when a new reaction is added — pick-one menus for colours, regions or pronouns." },
      { title: "Post it", body: "Choose the channel and publish. The bot sends the message and adds every configured reaction so members only have to click." },
      { title: "Members manage themselves", body: "Reacting grants the role, removing the reaction removes it — including after a bot restart. The bot never grants roles above its own or roles with dangerous permissions." },
    ],
    tiers: [
      ["Reaction-role messages", "2", "25"],
      ["Emoji-to-role pairs per message", "20", "20"],
      ["Exclusive (pick-one) mode", "Included", "Included"],
    ],
    faq: [
      { q: "Is the reaction roles bot free?", a: "Yes. Two reaction-role messages per server are free, each with up to 20 emoji-to-role pairs. Premium raises the limit to 25 messages." },
      { q: "Do custom server emojis work?", a: "Yes. Standard Unicode emojis and your server's custom emojis can both be mapped to roles." },
      { q: "What happens when a member removes their reaction?", a: "The role is removed. This works even for reactions added before the bot last restarted." },
      { q: "Can I limit members to one role from a message?", a: "Yes. Turn on exclusive mode: adding a new reaction swaps the role and the previous reaction is cleared." },
    ],
    related: ["/features/discord-welcome-bot-autorole", "/features/discord-verification-bot", "/features"],
  },
  {
    slug: "discord-giveaway-bot",
    path: "/features/discord-giveaway-bot",
    nav: "Giveaways",
    title: "Discord Giveaway Bot — Role Requirements, Auto-End & Reroll",
    description:
      "Run Discord giveaways with Supreme Bot: set the prize, duration and number of winners, require roles to enter, let the scheduler pick winners automatically, end early or reroll. Free tier, dashboard or /giveaway command.",
    keywords: ["discord giveaway bot", "giveaway bot with role requirements", "discord giveaway bot free", "giveaway bot dashboard", "discord giveaway reroll", "supreme bot", "carbon stealth"],
    h1: "Giveaways",
    answer:
      "Supreme Bot runs timed giveaways in your Discord server: start one from the dashboard or with /giveaway start, set the prize, duration in minutes, number of winners and an optional list of required roles, and the scheduler picks the winners when the timer ends. You can end a giveaway early with /giveaway end or pick new winners with /giveaway reroll. Giveaways are included in the Free tier.",
    steps: [
      { title: "Start the giveaway", body: "/giveaway start <prize> <duration_minutes> [winners] [required_roles] [description], or Dashboard → your server → Automation → Giveaways. The bot posts an embed with an Enter button." },
      { title: "Gate entries by role", body: "Pass one or more required roles and only members holding them can enter — for example boosters or verified members." },
      { title: "Let the scheduler finish it", body: "When the timer ends the bot draws the winners, announces them and updates the embed. Ending early: /giveaway end <id>." },
      { title: "Reroll if needed", body: "/giveaway reroll <id> picks new winners from the remaining entrants, for a no-show winner." },
    ],
    tiers: [
      ["Giveaways with auto-end and reroll", "Included", "Included"],
      ["Required roles to enter", "Included", "Included"],
      ["Start from dashboard or /giveaway", "Included", "Included"],
    ],
    faq: [
      { q: "Is the giveaway bot free?", a: "Yes. Giveaways with role requirements, automatic winner selection, early end and reroll are part of the Free tier." },
      { q: "Can I require a role to enter a giveaway?", a: "Yes. Add required roles when starting the giveaway; members without them cannot enter." },
      { q: "Are winners chosen randomly?", a: "Yes. The scheduler selects winners at random among the entrants when the timer ends; reroll draws again from the remaining entrants." },
    ],
    related: ["/features/discord-poll-bot", "/features/discord-sticky-scheduled-messages", "/commands"],
  },
  {
    slug: "discord-welcome-bot-autorole",
    path: "/features/discord-welcome-bot-autorole",
    nav: "Welcome & autorole",
    title: "Discord Welcome Bot & Autorole — Greetings, Roles, Sticky Roles",
    description:
      "Greet new members in a channel or by DM, assign roles automatically with separate rules for humans and bots, and restore roles when someone rejoins with sticky roles. Supreme Bot's welcomer is free.",
    keywords: ["discord welcome bot", "discord autorole bot", "discord welcome message bot free", "discord sticky roles", "welcome bot setup", "supreme bot", "carbon stealth"],
    h1: "Welcome messages and autorole",
    answer:
      "Supreme Bot greets every new member with a customisable embed in a channel of your choice, by DM, or both, and assigns starter roles automatically with separate rules for humans and for bots. With sticky roles enabled, a member who leaves and rejoins gets their previous roles back (kicked or banned members are excluded). All of this is in the Free tier and is configured from the dashboard, no commands required.",
    steps: [
      { title: "Turn on the welcomer", body: "Dashboard → your server → Settings → Welcomer. Pick the channel, write the greeting and optionally enable a DM greeting as well." },
      { title: "Set autoroles", body: "In the same settings, choose the roles new humans receive and, separately, the roles new bots receive. The bot never assigns roles above its own role or roles with dangerous permissions." },
      { title: "Enable sticky roles (optional)", body: "Settings → Sticky roles. When a member leaves, the bot snapshots their roles and restores them on rejoin. Snapshots are deleted after 180 days, on restore, on ban or on a data-deletion request; nothing is stored while the feature is off." },
      { title: "Log joins and leaves", body: "Pair it with Server Activity Logging's members category to see join, leave, role and nickname changes in your log channel." },
    ],
    tiers: [
      ["Welcome message in channel and/or DM", "Included", "Included"],
      ["Autorole with separate human / bot rules", "Included", "Included"],
      ["Sticky roles on rejoin", "Included", "Included"],
    ],
    faq: [
      { q: "Is the welcome bot free?", a: "Yes. Welcome messages, DM greetings, autorole and sticky roles are all included in the Free tier." },
      { q: "Can bots get different roles than humans?", a: "Yes. Autorole has two rule sets: one for human members and one for bot accounts." },
      { q: "What are sticky roles?", a: "An opt-in feature that remembers a member's roles when they leave and restores them if they rejoin. Members who were kicked or banned do not get their roles back, and snapshots expire after 180 days." },
    ],
    related: ["/features/discord-reaction-roles", "/features/discord-logging-bot", "/features/discord-verification-bot"],
  },
  {
    slug: "discord-logging-bot",
    path: "/features/discord-logging-bot",
    nav: "Server logs",
    title: "Discord Logging Bot — Deleted & Edited Messages, Voice, Members",
    description:
      "Supreme Bot's server activity log relays voice, member, moderation and message events to your own log channel, including deleted and edited messages with the original text kept. Off by default, free, and nothing is stored in our database.",
    keywords: ["discord logging bot", "discord bot log deleted messages", "discord message logging bot", "discord audit log bot", "discord logging bot free", "supreme bot", "carbon stealth"],
    h1: "Server activity logging",
    answer:
      "Supreme Bot can act as your Discord logging bot: enable the categories you want (voice, members, moderation, messages) and events are relayed to a log channel in your server — joins and leaves, role and nickname changes, timeouts, bans and unbans, voice joins, moves, mutes and streaming, and edited or deleted messages with the original text preserved. Each category can go to its own channel. Logging is off by default, included in the Free tier, and the events are never stored in our database — they exist only in your log channel.",
    steps: [
      { title: "Enable the categories you need", body: "Dashboard → your server → Settings → Server activity log. Turn logging on and tick voice, members, moderation and/or messages. Everything is off until you enable it." },
      { title: "Pick the channel", body: "Choose the log channel; each category can also be routed to its own channel (for example #mod-log for moderation, #message-log for messages)." },
      { title: "Give the bot View Audit Log", body: "With that permission the bot shows who performed a moderation action (kick, ban, timeout) by reading the server's audit log; without it, the event is still logged without the actor." },
      { title: "Read the log", body: "Deleted messages show the original text and attachments; edits show before and after; bulk deletions are summarised. Voice events cover join, leave, move, server and self mute or deaf, streaming and camera." },
    ],
    tiers: [
      ["Voice, members, moderation and message logs", "Included", "Included"],
      ["Separate channel per category", "Included", "Included"],
      ["Actor from the audit log", "Included", "Included"],
    ],
    faq: [
      { q: "Can the bot log deleted messages?", a: "Yes. With the messages category enabled, deleted messages are posted to your log channel with the original text and attachment links, and edits show the before and after text." },
      { q: "Does Supreme Bot store my server's messages?", a: "Server activity events are relayed to your log channel and not stored in our database. Only messages written inside ticket channels are recorded, for the ticket transcript." },
      { q: "Is logging free?", a: "Yes. All four log categories and per-category channels are included in the Free tier." },
      { q: "Why does the bot ask for View Audit Log?", a: "To attribute moderation actions to the moderator who performed them. It is the only reason the permission is requested." },
    ],
    related: ["/features/discord-welcome-bot-autorole", "/features/discord-ticket-system", "/guides/gdpr-discord-bot"],
  },
  {
    slug: "discord-sticky-scheduled-messages",
    path: "/features/discord-sticky-scheduled-messages",
    nav: "Sticky & scheduled",
    title: "Discord Sticky Message Bot & Scheduled Messages — Auto-Post",
    description:
      "Keep a sticky message pinned at the bottom of a channel and schedule one-off or recurring posts (daily, weekly, monthly) with Supreme Bot. Set from the dashboard or with /admin sticky and /admin schedule.",
    keywords: ["discord sticky message bot", "discord scheduled messages bot", "discord auto message bot", "discord recurring message bot", "sticky bot for discord", "supreme bot", "carbon stealth"],
    h1: "Sticky and scheduled messages",
    answer:
      "A sticky message is a post the bot re-sends at the bottom of a channel whenever new messages push it up, so rules or instructions stay visible; a scheduled message is a post the bot sends at a set time, once or on a daily, weekly or monthly schedule. Supreme Bot does both from the dashboard or with /admin sticky set and /admin schedule add, which accepts an exact timestamp or a relative time such as 2h, 1d or 30m. Both are Premium features: up to 100 sticky messages and 100 scheduled messages per server.",
    steps: [
      { title: "Set a sticky", body: "/admin sticky set <content> [title] in the channel, or Dashboard → your server → Automation → Sticky. The bot deletes its previous copy and re-posts the sticky as new messages arrive. Remove it with /admin sticky remove." },
      { title: "Schedule a post", body: "/admin schedule add <content> <when> [recurrence] [channel_id]. <when> is an ISO timestamp or relative (2h, 1d, 30m); recurrence is daily, weekly or monthly." },
      { title: "Manage the queue", body: "/admin schedule list shows every pending message; /admin schedule remove <id> cancels one. Dashboard → your server → Automation → Scheduled shows the same list." },
    ],
    tiers: [
      ["Sticky messages per server", "—", "100"],
      ["Scheduled messages per server", "—", "100"],
      ["Recurring schedules (daily / weekly / monthly)", "—", "Included"],
    ],
    faq: [
      { q: "Are sticky and scheduled messages free?", a: "No. They are Premium features (€4.99 per server per month): up to 100 sticky messages and 100 scheduled messages per server, including recurring schedules." },
      { q: "How does the sticky message stay at the bottom?", a: "When new messages are posted, the bot removes its previous copy and posts the sticky again, so it is always the most recent message in the channel." },
      { q: "Can I schedule a message to repeat every week?", a: "Yes. Add the message with recurrence weekly (or daily, monthly) and the bot re-sends it on that cadence until you remove it." },
    ],
    related: ["/features/discord-giveaway-bot", "/features/discord-poll-bot", "/commands"],
  },
  {
    slug: "discord-poll-bot",
    path: "/features/discord-poll-bot",
    nav: "Polls",
    title: "Discord Poll Bot — Live Results, Multi-Choice, Auto-Close",
    description:
      "Create Discord polls with up to 9 options, single or multiple choice and an auto-close timer. Results update live in the embed. Start a poll with /poll or from the Supreme Bot dashboard. Free tier included.",
    keywords: ["discord poll bot", "discord voting bot", "discord poll bot free", "discord poll bot commands", "create poll discord bot", "supreme bot", "carbon stealth"],
    h1: "Polls",
    answer:
      "Supreme Bot's poll bot posts an embed with up to nine options; members vote with buttons and the counts update live in the message. You choose single-choice or multi-choice and an optional duration in hours after which the poll closes automatically and the embed shows the final percentages with the winning option highlighted. Start one with /poll <question> <options> or from the dashboard's Automation page. Polls are included in the Free tier.",
    steps: [
      { title: "Create the poll", body: "/poll <question> <options> [multi_choice] [duration_hours] with the options comma-separated, or Dashboard → your server → Automation → Polls. Up to nine options per poll." },
      { title: "Members vote", body: "Each option is a button under the embed; every vote updates the counts in the message immediately. Turn on multi_choice to let members pick more than one option." },
      { title: "Close it", body: "Set duration_hours and the poll closes itself: the vote buttons disappear and the embed shows the final percentages with the winning option highlighted." },
    ],
    tiers: [
      ["Polls with live results", "Included", "Included"],
      ["Options per poll", "9", "9"],
      ["Multi-choice and auto-close", "Included", "Included"],
    ],
    faq: [
      { q: "Is the poll bot free?", a: "Yes. Polls with up to nine options, multi-choice and auto-close are included in the Free tier." },
      { q: "Where do I see the results?", a: "In the poll message itself: the counts update live while the poll is open, and when it closes the embed shows the final percentages and highlights the winning option." },
      { q: "Are votes anonymous?", a: "The poll message shows only the number of votes per option, not who voted." },
    ],
    related: ["/features/discord-giveaway-bot", "/features/discord-sticky-scheduled-messages", "/commands"],
  },
  {
    slug: "discord-leveling-game",
    path: "/features/discord-leveling-game",
    nav: "Leveling & game",
    title: "Discord Leveling Bot — XP, Level Roles, Shop, Companions & Server Quests",
    description:
      "Server Season is Supreme Bot's leveling game: XP from activity (never message text), level roles, daily sparks with streaks, a server shop, 60 collectible companions, weekly server quests, counting and trivia. Free tier included.",
    keywords: ["discord leveling bot", "discord xp bot", "discord level roles bot", "discord economy bot", "discord counting bot", "discord trivia bot", "mee6 alternative", "discord leveling bot free", "supreme bot", "carbon stealth"],
    h1: "Leveling, sparks, companions and server quests",
    answer:
      "Server Season is a leveling bot and a collecting game in one. Members earn XP for messages, voice minutes, poll votes, giveaway entries, approved applications and verification — the bot counts the event, never the text of a message — and climb the same level curve MEE6 users know, unlocking role rewards you set in the dashboard. /daily pays sparks with a streak that doubles from day seven; sparks buy rewards in a server shop you define (roles for a period, custom perks) and feed companions: sixty original creatures that appear in active channels, get caught by the first member to click, evolve through three forms and can be traded. Weekly server quests give the whole server one goal and reward every contributor; a counting channel and trivia rounds keep the chat moving. Free servers get the full loop with five level roles, five shop items, one companion slot and one active quest; Premium raises the limits and adds rare companions, daily and knowledge-base trivia and party commands.",
    steps: [
      { title: "Turn the game on", body: "Dashboard → your server → Game → Overview. Enable Server Season, set XP per message, the cooldown, XP per voice minute and the daily sparks. Pick an announcement channel for level-ups and game events." },
      { title: "Add level roles and shop items", body: "Level roles tab: choose a level and a role; roles stack, and the bot never assigns managed roles, roles with dangerous permissions or roles above itself. Shop tab: create items with a price in sparks — a role for N days, or a custom perk you fulfil yourself from the purchases list." },
      { title: "Let companions spawn", body: "Companions appear in active channels (or only in the channels you list) after a burst of activity. The first member to press Catch keeps it; /companion list, feed, activate, trade and release manage the collection. Free servers see common and uncommon companions; Premium unlocks rare, epic, legendary and seasonal ones." },
      { title: "Run server quests and mini-games", body: "Set a quest channel and a weekly quest starts on its own (messages, /daily claims, voice minutes, poll votes, verifications); the bot keeps a progress bar in the channel and rewards every contributor when the goal is reached, with a chest for the top contributor. Add a counting channel and a trivia channel with a schedule; admins can also start a round any time with /trivia." },
      { title: "Watch the season", body: "Season XP ranks members for the current season; when it ends, the bot announces the top three and season XP resets while levels, sparks and companions stay. /profile and /leaderboard show progress in Discord; the dashboard shows players, XP, sparks in circulation, top collectors and quest history." },
    ],
    tiers: [
      ["Levels, XP, /daily, /profile, /leaderboard", "Included", "Included"],
      ["Level roles", "5", "100"],
      ["Shop items", "5", "50"],
      ["Companion collection slots", "1", "Unlimited"],
      ["Companion rarities", "Common, uncommon", "All, incl. seasonal"],
      ["Active server quests", "1", "3"],
      ["Counting channel", "Included", "Included"],
      ["Trivia rounds", "Weekly, question bank", "Daily + knowledge-base questions"],
      ["/wyr and /tod party commands", "—", "Included"],
    ],
    faq: [
      { q: "Is the leveling bot free?", a: "Yes. The Free tier includes levels and XP, five level roles, /daily with streaks, a shop with five items, one companion slot, weekly server quests, a counting channel and weekly trivia. Premium (€4.99 per server per month, billed through the Discord store) raises the limits to 100 level roles, 50 shop items, unlimited companion slots and three active quests, and adds all companion rarities, daily and knowledge-base trivia and the party commands." },
      { q: "Does the bot read my messages to give XP?", a: "No. XP is awarded per message event with a cooldown; the text of the message is never read or stored for the game. The only place the game reads message content is the counting channel you designate, and there it only checks whether the message is the next number." },
      { q: "Is there gambling or can members buy sparks?", a: "No. There are no slots, roulette or loot boxes bought with money, and sparks cannot be purchased. Everything in the game is earned through activity in your server, which keeps Supreme Bot inside Discord's App Discovery content rules." },
      { q: "What happens to the data if a member leaves or asks for deletion?", a: "Game progress, companions, purchases, quest contributions and trivia answers are personal data tied to the Discord user id. /privacy delete removes them; a server's game data is purged 30 days after the bot is removed, like every other server data." },
      { q: "How does it compare to MEE6 or Arcane leveling?", a: "The level curve is the same one members already know (5·n² + 50·n + 100 XP per level), role rewards stack the same way, and the dashboard shows the same leaderboard. On top of that Supreme Bot adds sparks and a shop, companions, cooperative server quests and the ticket-system tie-ins (staff earn XP for closing tickets within SLA) — in one bot, EU-hosted." },
    ],
    related: ["/features/discord-poll-bot", "/features/discord-giveaway-bot", "/features/discord-verification-bot", "/commands"],
  },
  {
    slug: "discord-support-bot-ai",
    path: "/features/discord-support-bot-ai",
    nav: "AI support & knowledge base",
    title: "Discord Support Bot with AI Replies, Knowledge Base, Canned Responses & SLA",
    description:
      "Turn tickets into a support desk: AI-drafted first replies reviewed by staff, a knowledge base the bot suggests when a ticket opens, saved replies with /tag, SLA timers and staff performance stats. Premium features on top of the free ticket system.",
    keywords: ["discord support bot", "discord ai support bot", "discord knowledge base bot", "discord canned responses", "discord ticket sla", "discord support bot features", "supreme bot", "carbon stealth"],
    h1: "AI-assisted support desk",
    answer:
      "On top of the free ticket system, Supreme Bot adds the tools a support team actually uses: a knowledge base whose best-matching article the bot suggests the moment a ticket opens (3 articles on Free, 50 on Premium), canned responses posted with /tag use, first-response and resolution SLA timers that flag a ticket before it goes stale, /stats for staff performance, and AI auto-replies that draft a first answer for staff to review and send. The AI never replies on its own: a human approves every message, the feature is opt-in per server, and it is disclosed to members as required by the EU AI Act.",
    steps: [
      { title: "Write the knowledge base", body: "Dashboard → your server → Knowledge base. Each article has a title, body and keywords. When a ticket opens, the bot matches the articles against what it knows about the ticket (the quoted message, the form answers or the panel name), posts the best match in the ticket and asks whether it helped." },
      { title: "Save canned responses", body: "/tag add <name> <content> stores a reply (up to 50 per server, 1500 characters each). Staff post one with /tag use <name> or the “Reply with tag” message context menu; /tag list shows usage counts." },
      { title: "Enable AI replies (Premium, opt-in)", body: "Turn on AI auto-replies for the server. The first message of a new ticket is sent to the model (Google Gemini) and a suggested reply appears for staff; staff edit, send or discard it. The platform operator must attest a paid provider tier that does not train on your data before the feature can run at all." },
      { title: "Set SLA timers and watch stats", body: "Premium panels can define first-response and resolution targets; tickets that breach them are flagged. /stats gives open/closed counts for 7 and 30 days, the top staff by tickets closed and the average feedback rating." },
    ],
    tiers: [
      ["Knowledge base articles", "3", "50"],
      ["Canned responses (/tag)", "50", "50"],
      ["AI auto-replies (human-in-the-loop)", "—", "Included"],
      ["SLA timers, feedback ratings", "—", "Included"],
      ["Round-robin assignment", "—", "Included"],
    ],
    faq: [
      { q: "Does the AI answer members directly?", a: "No. It drafts a suggested first reply that a staff member reviews, edits and sends, or discards. Members are told when AI assisted the reply." },
      { q: "Which AI model is used and is my data used for training?", a: "Google Gemini (Flash). The feature only runs when the platform operator has attested a paid provider tier that does not use the content for model training, in line with Discord's Developer Policy; otherwise it is disabled." },
      { q: "Is the knowledge base free?", a: "Three articles are free; Premium allows 50. Canned responses (up to 50 per server) are available on every tier." },
      { q: "What do SLA timers do?", a: "A Premium panel can set a first-response target and a resolution target. When a ticket exceeds either, it is flagged in the dashboard so the team notices before the member does." },
    ],
    related: ["/features/discord-ticket-system", "/guides/best-discord-ticket-bot", "/compare/ticket-tool-alternative"],
  },
  {
    slug: "white-label-discord-bot",
    path: "/features/white-label-discord-bot",
    nav: "White-label bot",
    title: "White-Label Discord Bot — Run Supreme Under Your Own Brand",
    description:
      "The White-label tier (€9.99/server/month) runs the whole Supreme Bot feature set under your own bot name and avatar using your own Discord application token, stored encrypted. Everything in Premium is included.",
    keywords: ["white label discord bot", "custom branded discord bot", "discord bot with own name and avatar", "custom bot token discord", "white label ticket bot", "supreme bot", "carbon stealth"],
    h1: "White-label custom bot",
    answer:
      "The White-label tier lets a server run Supreme Bot's complete feature set as its own bot: you create a Discord application, give the bot your name and avatar, and attach its token with /premium custombot or in the dashboard. The token is stored encrypted (AES-256-GCM) and used only to run your bot; you remain the owner and developer of that application and Supreme Bot acts as your service provider. The tier costs €9.99 per server per month through the Discord store and includes everything in Premium.",
    steps: [
      { title: "Create your application", body: "In the Discord Developer Portal create an application, set the bot's name and avatar, and enable the same gateway intents Supreme Bot uses (Message Content and Server Members)." },
      { title: "Subscribe to White-label", body: "Open the Premium page of the dashboard for the server and buy the White-label subscription in the Discord store." },
      { title: "Attach the token", body: "/premium custombot <token> or Dashboard → your server → Settings → Custom bot. The token is encrypted before it is stored and is never displayed again; the branded bot connects and takes over every feature for the server." },
      { title: "Keep control", body: "You can replace or remove the token at any time from the same settings; when the server downgrades or the token is removed, the branded bot is shut down. The Developer Terms obligations for your application (privacy policy, intents) remain yours." },
    ],
    tiers: [
      ["Custom bot name and avatar (own token)", "—", "White-label tier"],
      ["Everything in Premium", "—", "Included"],
      ["Token encrypted at rest (AES-256-GCM)", "—", "Included"],
    ],
    faq: [
      { q: "What does the White-label tier cost?", a: "€9.99 per server per month, VAT included, sold as a monthly subscription in the Discord store. It includes every Premium feature." },
      { q: "Do I need to host anything?", a: "No. You only create the Discord application and provide its token; Supreme Bot runs it on EU infrastructure." },
      { q: "Is my bot token safe?", a: "The token is encrypted with AES-256-GCM before it is stored and is never shown again in the dashboard. You can replace or remove it at any time, and the branded bot is shut down when the server downgrades or the token is removed." },
      { q: "Can one subscription cover several servers?", a: "No. Subscriptions are per server; Discord's Premium Apps store does not offer multi-server bundles." },
    ],
    related: ["/features/discord-ticket-system", "/eula", "/features"],
  },
];

/** Всички публични страници под /features — хъбът + функциите. */
export const FEATURE_ROUTES = [FEATURES_HUB.path, ...FEATURE_PAGES.map((p) => p.path)];

export function featureBySlug(slug) {
  return FEATURE_PAGES.find((p) => p.slug === slug) || null;
}

/** JSON-LD за страница на функция: WebPage в сайта + трохи + FAQ (за AI разбиране). */
export function featureJsonLd(page) {
  const url = `${SITE}${page.path}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: page.title,
        description: page.description,
        inLanguage: "en",
        isPartOf: { "@id": `${SITE}/#website` },
        about: { "@id": `${SITE}/#software` },
        breadcrumb: { "@id": `${url}#breadcrumbs` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumbs`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Supreme Bot", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Features", item: `${SITE}${FEATURES_HUB.path}` },
          { "@type": "ListItem", position: 3, name: page.nav, item: url },
        ],
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: page.faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };
}

export function hubJsonLd() {
  const url = `${SITE}${FEATURES_HUB.path}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${url}#webpage`,
        url,
        name: FEATURES_HUB.title,
        description: FEATURES_HUB.description,
        inLanguage: "en",
        isPartOf: { "@id": `${SITE}/#website` },
        about: { "@id": `${SITE}/#software` },
        hasPart: FEATURE_PAGES.map((p) => ({ "@type": "WebPage", "@id": `${SITE}${p.path}#webpage`, url: `${SITE}${p.path}`, name: p.title })),
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumbs`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Supreme Bot", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Features", item: url },
        ],
      },
    ],
  };
}
