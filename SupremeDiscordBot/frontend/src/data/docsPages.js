// frontend/src/data/docsPages.js
// Ръководствата за клиенти — /docs и /docs/<slug>. На английски (решение на
// собственика, 12.11.2026), както /guides и /features; таблото и /help остават
// на 8 езика.
//
// ЗАЩО СЪЩЕСТВУВАТ: до 12.11.2026 единственото „как се ползва“ беше README за
// оператора на сървъра и страниците /features („какво е“). Клиент, който тепърва
// добавя бота, нямаше откъде да научи как да отвори първия си панел, какви права
// да даде и какво става при край на абонамента (одит на Летописеца).
//
// Подредба по Diátaxis — всяка страница е ЕДИН вид и го казва в `kind`:
//   tutorial     — учим с пример, стъпка по стъпка, до работещ резултат
//   how-to       — решаваме конкретна задача; читателят вече знае основите
//   reference    — сухи факти за справка (ендпойнти, права, лимити)
//   explanation  — защо е така
//
// ЕДИН източник за три консуматора (като featurePages.js): React страницата
// (pages/DocsPage.jsx), pre-render снимката (scripts/prerender.mjs — за
// обхождачи без JavaScript) и гейтът (__tests__/docsPages.test.js).
//
// ПРАВИЛА ЗА СЪДЪРЖАНИЕТО (гейтът ги проверява):
//   • Всяко твърдение е сверено с кода. Числата (лимити, срокове, права) идват от
//     backend/src/lib/premium.js, bot/src/utils/permissionCheck.js и каталога на
//     командите — не от памет.
//   • Пътищата в таблото са по менюто от components/dashboardNav.js:
//     „Protection → Bait channel“, „Community → Welcome & roles → Role saver“ …
//   • Всяка команда, която се споменава (`/ticket close`), съществува в
//     data/commandsCatalog.js.
//   • Без обещания, които кодът не изпълнява; без „GDPR compliant“, без чужди марки
//     като сравнение, без цени „с включен ДДС“ (крайната цена я показва Discord).
//   • ≥5 ключови думи на страница, една винаги „carbon stealth“.
//
// ФОРМАТ НА ТЕКСТА: обикновени низове. Вътре в тях са позволени само:
//   `код`            → <code>
//   [текст](/път)    → връзка (вътрешна, започва с „/“) или https://…
// Нищо друго (без HTML, без **удебеляване**).
//
// БЕЗ import от React/JSX файлове: този файл се чете и от scripts/prerender.mjs
// под Node. SITE се дублира нарочно; гейтът пази да е равен на Seo.SITE.
const SITE = "https://supremebot.carbonstealth.eu";

/**
 * @typedef {object} DocsSection
 * @property {string} id                  котва в адреса (#id), kebab-case, уникална в страницата
 * @property {string} heading             заглавие на раздела (H2)
 * @property {string[]} [body]            абзаци
 * @property {string[]} [steps]           номерирани стъпки (само когато редът има значение)
 * @property {string[]} [list]            неномериран списък
 * @property {{head: string[], rows: string[][]}} [table]
 * @property {string} [note]              важна бележка (един абзац)
 * @property {string} [code]              блок с код (многоредов), показва се дословно
 *
 * @typedef {object} DocsPage
 * @property {string} slug                част от адреса: /docs/<slug>
 * @property {"tutorial"|"how-to"|"reference"|"explanation"} kind
 * @property {string} nav                 кратко име за менюто на /docs (≤ 32 знака)
 * @property {string} title               <title> и H1 (≤ 60 знака без „| Supreme Bot“)
 * @property {string} description         meta description, 120–160 знака
 * @property {string[]} keywords          ≥5, една винаги „carbon stealth“
 * @property {string} answer              отговорът отпред: 1–3 изречения какво ще постигне читателят
 * @property {string} updated             ISO дата на последната сверка с кода
 * @property {string[]} [requires]        какво трябва да има читателят преди да започне
 * @property {DocsSection[]} sections
 * @property {{q: string, a: string}[]} [faq]
 * @property {string[]} related           вътрешни пътища („/docs/…“, „/features/…“, „/commands“)
 */

export const DOCS_HUB = {
  path: "/docs",
  title: "Supreme Bot Documentation — Setup Guides and Reference",
  description:
    "Step-by-step guides for Supreme Bot: add the bot, open your first ticket panel, set up applications, verification, the bait channel, roles, the game, webhooks and the API.",
  keywords: ["supreme bot documentation", "discord ticket bot setup", "discord bot guide", "discord bot dashboard help", "supreme bot", "carbon stealth"],
  h1: "Documentation",
  answer:
    "Guides for server owners and staff: start with the ten-minute setup, then pick the job you need done. Every page is checked against the bot's code.",
};

/** @type {DocsPage[]} */
export const DOCS_PAGES = [
  // ─────────────────────────────────────────────────────────────────────────
  // 1 · getting-started (tutorial)
  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: "getting-started",
    kind: "tutorial",
    nav: "Set up in ten minutes",
    title: "Set Up Supreme Bot in Ten Minutes",
    description:
      "Add Supreme Bot to your Discord server, check its permissions, post your first ticket panel and open and close your first ticket. Ten minutes, no code.",
    keywords: ["supreme bot setup", "add discord ticket bot", "discord ticket panel setup", "discord bot quick start", "discord support bot", "carbon stealth"],
    answer:
      "By the end of this guide the bot is in your server with the right permissions, a ticket panel is posted in a channel, and you have opened and closed one real ticket. Every step works on the Free plan.",
    updated: "2026-11-13",
    requires: [
      "A Discord server where you have the Manage Server permission",
      "A Discord account to sign in to the dashboard",
    ],
    sections: [
      {
        id: "add-the-bot",
        heading: "1. Add the bot to your server",
        steps: [
          "Open [the dashboard](/dashboard) and sign in with Discord.",
          "On the Your servers page, click Add to a server (or + Invite bot) and choose your server in Discord.",
          "Leave every permission ticked. The invite asks for 13 permissions and never asks for Administrator. [Permissions](/docs/permissions) explains each one.",
          "Confirm. The bot joins and posts a welcome message with three buttons: Open Dashboard, a support link and Quick Setup. It uses the server's system channel, or the first channel where it can write. If it cannot write anywhere, it sends the message to the server owner by direct message.",
        ],
      },
      {
        id: "check-permissions",
        heading: "2. Check the permissions",
        body: [
          "In any channel, run `/debug`. Only members with Manage Server can use it, and only you see the answer. A green tick next to all 12 required permissions means you are ready.",
          "If a permission shows a red cross, use the re-invite link in the same message or edit the bot's role in Server Settings → Roles.",
        ],
        note: "`/debug` checks the 12 required permissions. It does not report Pin Messages, Ban Members or Timeout Members. Those are covered in the permissions reference.",
      },
      {
        id: "quick-setup",
        heading: "3. Run the quick setup (optional)",
        body: [
          "Click Quick Setup in the welcome message, or run `/setup wizard`. The wizard asks, one step at a time:",
        ],
        list: [
          "Which roles should work on tickets (up to 5; you can skip)",
          "Which category new ticket channels should go in (you can skip)",
          "Which channel should receive a log of ticket events (you can skip)",
          "A summary with a Create Panel on Dashboard button",
        ],
        note: "The wizard does not save anything. It is a checklist: you enter the same choices when you create the panel in the next step. The wizard session ends after 10 minutes.",
      },
      {
        id: "first-panel",
        heading: "4. Create your first ticket panel",
        body: ["A panel is the message with the button members click to open a ticket."],
        steps: [
          "In the dashboard, open your server and choose Support → Panels, then click New panel.",
          "Fill in Internal name (only staff see it), Embed title and Embed description. These are the words members read above the button.",
          "Under Support roles (full access), pick the roles that should see and answer tickets.",
          "Under Categories & channels, pick a Category for open tickets.",
          "A new panel starts with one button labelled Open ticket. Change its label or emoji if you like.",
          "Click Create panel.",
        ],
      },
      {
        id: "post-panel",
        heading: "5. Post the panel in a channel",
        steps: [
          "On the new panel's row, choose the channel where members should see it.",
          "Click Post to channel. The bot posts the panel in that channel.",
        ],
        
        note: "You can also post it from Discord: run `/panel spawn` in the channel and type the panel name. Needs Manage Server.",
      },
      {
        id: "first-ticket",
        heading: "6. Open and close your first ticket",
        steps: [
          "In the channel with the panel, click the Open ticket button. The bot creates a private channel in your category, adds your support roles, and posts a Ticket message with Claim and Close buttons.",
          "Write a message in the ticket, as a member would.",
          "Click Close. If the panel has two-step close on, confirm with Yes, close.",
          "The bot posts a Ticket closed message with Reopen, Delete and View Transcript buttons.",
          "In the dashboard, open Support → Tickets. Your ticket is in the list; View transcript opens the saved conversation.",
        ],
        note: "By default one member can have one open ticket at a time. If you click the button a second time, the bot says you already have the maximum number of open tickets.",
      },
      {
        id: "what-next",
        heading: "Where to go next",
        body: [
          "The Overview page has a First steps checklist: invite the bot, create a ticket panel, post a panel in a channel, build an application form. It ticks itself off as you go.",
          "The bot and dashboard speak 8 languages: English, Bulgarian, German, Spanish, French, Italian, Dutch and Polish. Members see the bot in their own Discord language when it is supported. Settings → Bot language for this server sets the fallback.",
        ],
        list: [
          "[Tickets](/docs/tickets): claim, priority, close, transcripts, SLA",
          "[Verification and bait channel](/docs/verification-and-bait): keep spam bots out",
          "[Applications](/docs/applications): staff applications with a review step",
          "[Premium](/docs/premium): what the paid plans add",
        ],
      },
    ],
    faq: [
      { q: "Does Supreme Bot need the Administrator permission?", a: "No. The invite never asks for Administrator. It asks for 13 specific permissions, listed in the permissions reference." },
      { q: "Do I have to run the quick setup?", a: "No. It saves nothing. You can go straight to Support → Panels and create a panel." },
      { q: "How many panels can I create on the Free plan?", a: "One panel with unlimited tickets. Premium allows up to 50 panels." },
      { q: "Can I test a ticket with my own account?", a: "Yes. Click the panel button yourself. Keep in mind the default limit of one open ticket per person." },
      { q: "The panel did not appear. What now?", a: "Run `/debug` and look for red crosses. The bot needs View Channels, Send Messages and Embed Links in the channel you chose. See [Troubleshooting](/docs/troubleshooting)." },
    ],
    related: ["/docs/permissions", "/docs/tickets", "/guides/ticket-panel-setup", "/features/discord-ticket-system", "/commands"],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 2 · permissions (reference)
  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: "permissions",
    kind: "reference",
    nav: "Bot permissions",
    title: "Supreme Bot Permissions Reference",
    description:
      "All 13 permissions in the Supreme Bot invite and what each is for, the role order the bot needs, when to add Ban Members and Timeout Members, and /debug.",
    keywords: ["discord bot permissions", "supreme bot permissions", "discord role hierarchy bot", "discord bot missing permissions", "discord ticket bot permissions", "carbon stealth"],
    answer:
      "The invite asks for 13 permissions: 12 the bot needs and one it only recommends. Administrator is never requested. Ban Members and Timeout Members are not in the invite; you give them by hand and only the bait channel uses them.",
    updated: "2026-11-13",
    sections: [
      {
        id: "invite-number",
        heading: "The invite",
        body: [
          "The invite link requests the bot and applications.commands scopes and the permission value 2252160859499664. The dashboard, the welcome message and the re-invite link in `/debug` all use the same value.",
        ],
      },
      {
        id: "required-permissions",
        heading: "The 12 required permissions",
        body: ["`/debug` checks exactly these 12. If one is missing, the bot cannot do its job properly."],
        table: {
          head: ["Permission", "What it is used for"],
          rows: [
            ["View Channels", "See the channels and ticket channels it works in."],
            ["Send Messages", "Post panels, ticket messages, replies and logs."],
            ["Manage Channels", "Create, move and delete ticket channels. Also lets /bait setup create the bait channel."],
            ["Manage Roles", "Give and remove roles: verification, auto roles, reaction roles, role saver, shop and level rewards, application decisions."],
            ["Manage Messages", "Delete the message that triggers the bait channel."],
            ["Embed Links", "Panels, review messages and logs are embeds."],
            ["Attach Files", "Required by the bot's own permission check for ticket channels."],
            ["Read Message History", "Fetch the bot's own earlier messages so it can update them: panels, the Claim button, the bait warning."],
            ["Create Private Threads", "Open a private thread per ticket when a panel uses the Private threads style."],
            ["Manage Threads", "Lock and archive a thread when its ticket closes; open it again on reopen."],
            ["Send Messages in Threads", "Write inside those ticket threads."],
            ["View Audit Log", "Show who did what in the activity log, and tell a kick or ban apart from a member who left on their own (role saver)."],
          ],
        },
      },
      {
        id: "recommended-permission",
        heading: "The recommended permission",
        table: {
          head: ["Permission", "What it is used for", "Without it"],
          rows: [
            ["Pin Messages", "Pin the welcome message inside a new ticket. Since 2026 Discord treats pinning as its own permission; Manage Messages no longer covers it.", "Tickets work; the welcome message is not pinned."],
          ],
        },
        body: ["Older installations may not have it. Add it by re-inviting the bot or by editing its role."],
      },
      {
        id: "bait-permissions",
        heading: "Ban Members and Timeout Members (bait channel only)",
        body: [
          "The bait channel removes spam bots. To do that the bot needs one extra permission, depending on the action you choose. The invite does not include either one: you give them by hand in Server Settings → Roles.",
        ],
        table: {
          head: ["Bait action", "Permission the bot's role needs"],
          rows: [
            ["Kick (soft-ban)", "Ban Members"],
            ["Ban", "Ban Members"],
            ["Timeout for 24 hours", "Timeout Members"],
          ],
        },
        note: "Without the permission the bot still deletes the message in the bait channel, but it cannot remove anyone. The log channel says so. `/debug` does not check these two permissions; `/bait status` and the log do.",
      },
      {
        id: "role-order",
        heading: "Role order",
        body: [
          "Discord lets a bot manage only the roles below its own. In Server Settings → Roles, drag the bot's role above every role it must give, remove or act on (members for the bait channel).",
          "The bot also refuses to hand out some roles whatever the order is. It does not give a role that is managed by an integration or a server boost, that has any risky permission, or that sits at or above its own role. Risky permissions are: Administrator, Manage Server, Manage Roles, Manage Channels, Manage Webhooks, Manage Expressions, Ban Members, Kick Members, Timeout Members, Mention Everyone, Manage Messages, Manage Nicknames and View Audit Log.",
          "The role pickers in the dashboard mark such roles as bot role, risky permissions or above the bot before you choose them.",
        ],
      },
      {
        id: "debug-command",
        heading: "The /debug command",
        body: [
          "`/debug` needs Manage Server and answers only to you. It lists the bot's name, its highest role position, whether the backend is reachable and a tick or cross for each of the 12 required permissions. When something is missing it adds a re-invite link.",
        ],
      },
      {
        id: "white-label",
        heading: "White-label bots",
        body: [
          "A white-label bot is your own Discord application. Enable the Server Members and Message Content privileged intents for it in the Discord Developer Portal, then invite it with the same permission value.",
        ],
      },
    ],
    faq: [
      { q: "Why does the bot not ask for Administrator?", a: "It only asks for what its features need. Fewer permissions mean less damage if a role is ever misconfigured." },
      { q: "Can I remove a permission after inviting?", a: "You can, in Server Settings → Roles. The features that use it stop working. Run `/debug` to see what is missing." },
      { q: "Do I need Ban Members if I do not use the bait channel?", a: "No. Nothing else in the bot uses Ban Members or Timeout Members." },
      { q: "Which permissions does a ticket in a thread need?", a: "Create Private Threads, Manage Threads and Send Messages in Threads, in the channel where the panel is posted." },
    ],
    related: ["/docs/getting-started", "/docs/verification-and-bait", "/docs/troubleshooting", "/features/discord-anti-spam-bait-channel"],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 3 · tickets (how-to)
  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: "tickets",
    kind: "how-to",
    nav: "Run a ticket system",
    title: "Run a Discord Ticket System",
    description:
      "Build ticket panels with forms, claim and prioritise tickets, close them four ways, keep transcripts and set SLA alerts. Free and Premium limits included.",
    keywords: ["discord ticket system", "discord ticket bot guide", "ticket transcript discord", "discord ticket sla", "discord ticket round robin", "carbon stealth"],
    answer:
      "How to set up and run tickets: panels, a form before the ticket, claiming and priority, the four ways a ticket closes, transcripts, threads, SLA alerts and round-robin assignment, with a clear line between Free and Premium.",
    updated: "2026-11-13",
    requires: ["The bot is in your server (see [Set up in ten minutes](/docs/getting-started))"],
    sections: [
      {
        id: "build-a-panel",
        heading: "Build a panel",
        steps: [
          "Open Support → Panels and click New panel.",
          "Choose a Display style: Buttons (each option is its own button), Dropdown (one message, many options) or Private threads.",
          "Add one option per ticket type (Support, Report, Billing). Each has its own label and emoji.",
          "Under Categories & channels set the Category for open tickets, an optional Log channel and an optional Transcript channel.",
          "Pick the Support roles (full access). Roles listed under Observer roles can read but not write (Premium).",
          "Click Create panel, then Post to channel.",
        ],
        body: ["Editing a panel later keeps the existing button IDs, so buttons on an already posted panel keep working."],
      },
      {
        id: "form-on-a-button",
        heading: "Ask questions before the ticket opens",
        steps: [
          "Create a form in Support → Forms with the type Ticket form.",
          "In the panel editor, set the option's action to Ask questions first (form) and choose the form.",
          "A member clicks the button, answers the questions and the ticket opens. The answers appear inside the ticket.",
        ],
        body: ["The ticket opens through the same path as a ticket without a form: same number, same buttons, same limits. If the ticket cannot be created, no empty channel is left behind."],
      },
      {
        id: "claim-and-priority",
        heading: "Claim a ticket and set its priority",
        list: [
          "Claim (Premium): click Claim in the ticket, run `/ticket claim`, or use Claim ticket in Support → Tickets. Only an open ticket can be claimed, and you cannot take over someone else's claim. `/ticket unclaim` releases it.",
          "Priority (Free): `/ticket priority` sets Low, Normal, High or Urgent. A panel's Default ticket priority sets the starting value. The priority shows on the ticket's first message when it is not Normal.",
          "Rename (Premium): `/rename` changes the channel name.",
          "Escalate (Premium): `/escalate` moves the ticket to another panel and its support team.",
        ],
      },
      {
        id: "closing",
        heading: "Close a ticket",
        body: ["A ticket closes in four ways. All of them end in the same result, so you can choose by habit:"],
        list: [
          "The Close button inside the ticket",
          "`/ticket close` with an optional reason of up to 1000 characters",
          "Close ticket in Support → Tickets",
          "Automatically (Premium): after a number of hours without activity (panel setting Inactivity auto-close, checked every 30 minutes), or when the ticket's creator leaves the server",
        ],
        table: {
          head: ["What happens on every close", "Plan"],
          rows: [
            ["The channel is moved to the Category for closed tickets and the creator can no longer write. A thread is locked and archived.", "Moving to a closed category is Premium"],
            ["A Ticket closed message appears with Reopen, Delete and View Transcript buttons.", "Free"],
            ["The transcript link is posted in the panel's Transcript channel.", "Free"],
            ["The creator gets a direct message and a 1 to 5 star rating request.", "Premium"],
            ["A line goes to the Log channel.", "Free"],
            ["The TICKET_CLOSE webhook is sent.", "Premium"],
          ],
        },
        note: "If two people click Close at once, the ticket closes once and posts one message. A ticket that gets a new message shortly before an automatic close stays open.",
      },
      {
        id: "two-step-close",
        heading: "Ask for confirmation before closing",
        body: [
          "Turn on Two-step close under Close behaviour. Free panels use the standard question. Premium lets you write your own Close confirmation message.",
        ],
      },
      {
        id: "transcripts",
        heading: "Transcripts",
        body: [
          "Every closed ticket gets an HTML transcript. Staff open it with View transcript in Support → Tickets, or download a PDF with Download PDF transcript. If a panel has a Transcript channel, the bot posts the link there on close. Transcripts are stored encrypted at rest.",
          "Free servers keep a transcript for 30 days after the ticket closes. Premium keeps them until you delete them.",
        ],
      },
      {
        id: "threads",
        heading: "Tickets in threads",
        body: [
          "Choose the Private threads display style to open one private thread per ticket instead of a channel. The bot needs Create Private Threads, Manage Threads and Send Messages in Threads in the channel where the panel is posted. Close locks and archives the thread. Reopen unlocks it.",
        ],
        note: "Thread tickets do not move between categories. Use channel tickets if you rely on open and closed categories.",
      },
      {
        id: "sla-and-round-robin",
        heading: "SLA alerts and round-robin assignment (Premium)",
        body: [
          "SLA: in the panel editor, under Automation, set SLA: first response (minutes) and SLA: resolution (minutes). Every 10 minutes the bot looks for tickets that missed a target. It sends a direct message to the person who claimed the ticket, or to the server owner if nobody claimed it, with a link to the ticket list. Each missed target is reported once. If the recipient has direct messages closed, the alert is not delivered.",
          "Round-robin: in Settings, switch on Round-robin assignment and choose a role. New tickets are assigned to the members of that role in turn. The bot must be able to see the members of that role.",
        ],
      },
      {
        id: "free-vs-premium",
        heading: "Free and Premium at a glance",
        table: {
          head: ["", "Free", "Premium"],
          rows: [
            ["Panels", "1", "50"],
            ["Tickets per panel", "Unlimited", "Unlimited"],
            ["Priority levels, two-step close, staff replies from the dashboard", "Included", "Included"],
            ["Forms in total / questions per form", "2 / 5", "50 / 50"],
            ["Transcript retention", "30 days after close", "Unlimited"],
            ["Claim, rename, escalate", "No", "Included"],
            ["Round-robin, SLA alerts, feedback ratings", "No", "Included"],
            ["Direct messages on open and close, observer roles, closed category", "No", "Included"],
            ["Inactivity auto-close, close when the creator leaves", "No", "Included"],
            ["Duplicate panel, CSV export, webhooks", "No", "Included"],
          ],
        },
      },
    ],
    faq: [
      { q: "Why can a member not open a second ticket?", a: "Each panel has Max open tickets per user (whole server), one by default. You can raise it, and add a separate per-panel limit." },
      { q: "A closed ticket was a mistake. Can I bring it back?", a: "Yes. Click Reopen in the Ticket closed message. The creator can write again, and the Claim button works again." },
      { q: "Can staff answer without opening Discord?", a: "Yes, on every plan. In Support → Tickets, use Reply from dashboard. The bot posts the reply in the ticket." },
      { q: "Where do I read an old transcript?", a: "Support → Tickets, then View transcript. On the Free plan transcripts disappear 30 days after the ticket closed." },
      { q: "The bot says the category is full. What do I do?", a: "A category holds 50 channels. Pick another category in the panel or delete old tickets. See [Troubleshooting](/docs/troubleshooting)." },
    ],
    related: ["/docs/getting-started", "/docs/premium", "/docs/webhooks-and-api", "/guides/ticket-panel-setup", "/features/discord-ticket-system"],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 4 · verification-and-bait (how-to)
  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: "verification-and-bait",
    kind: "how-to",
    nav: "Verification and bait channel",
    title: "Verification Panel and Bait Channel Setup",
    description:
      "Set up a Discord verification panel with a role reward, see what members get when roles fail, and trap spam bots with a bait channel, false alarms included.",
    keywords: ["discord verification bot", "discord bait channel", "discord anti spam bot", "discord verification setup", "honeypot channel discord", "carbon stealth"],
    answer:
      "Two ways to keep unwanted accounts out. A verification panel gives members a role after a button click or a math question. A bait channel removes spam bots that write in a channel nobody should write in.",
    updated: "2026-11-13",
    requires: ["The bot is in your server", "For the bait channel: Ban Members or Timeout Members for the bot's role (see [Permissions](/docs/permissions))"],
    sections: [
      {
        id: "how-verification-works",
        heading: "How verification works",
        body: [
          "A verification panel is a message with a button. When a member passes the check, the bot gives them the roles you chose. You decide what those roles unlock: in Discord's channel settings, let @everyone see only your verify channel and let the role see the rest. The bot grants the role. It does not change channel permissions for you.",
        ],
      },
      {
        id: "create-a-panel",
        heading: "Create a verification panel",
        steps: [
          "Open Protection → Verification and click New verification panel.",
          "Choose the type: One-click button, Math captcha, or Reaction (experimental).",
          "Under Roles granted on verification, pick the roles members receive. Under Roles to remove, pick roles that should disappear (for example an Unverified role).",
          "Under Anti-bot & limits, set the Math difficulty (1 digit, 2 digits or multiplication), Max attempts, Cooldown (minutes) and Minimum account age (days). Leave a field empty for no check.",
          "Optionally write a Success message, switch on DM the member after successful verification and pick a Log channel.",
          "Save, then choose a channel and click Post to channel.",
        ],
        note: "The Free plan includes 1 verification panel with the button, math captcha and account-age checks. Premium allows 10 panels.",
      },
      {
        id: "assignable-roles",
        heading: "Which roles the bot can give",
        body: [
          "The bot gives a role only if it is not managed by an integration or boost, has none of the risky permissions, and sits below the bot's own role. The picker marks the roles that fail. The full list of risky permissions is in [Permissions](/docs/permissions).",
        ],
      },
      {
        id: "what-members-see",
        heading: "What the member sees",
        table: {
          head: ["Situation", "Message to the member"],
          rows: [
            ["Passed", "You are verified, with the number of roles granted (or your own Success message)."],
            ["Wrong math answer", "Wrong answer. Try again."],
            ["Too many attempts", "Too many attempts. Wait the number of minutes you set as Cooldown."],
            ["Account too new", "Your account must be at least the number of days you set old to verify here."],
            ["Already verified", "You are already verified. Roles are not touched again."],
            ["No role could be given", "Your answer was correct, but no role could be given to you. Please contact the staff."],
          ],
        },
        body: [
          "The last case is not a success. The member stays locked out, and the panel's Log channel gets a warning that names the panel and gives the likely reasons: the role is above the bot, it has risky permissions, or the bot lacks Manage Roles. Fix the role order and ask the member to try again.",
        ],
      },
      {
        id: "gate-tickets",
        heading: "Require verification before a ticket",
        body: [
          "In Support → Panels, edit a panel and open Verification gate. Add the roles a member must have (all of them) and, if you like, a custom message for people who lack them. The check applies to every way of opening a ticket: button, menu, form button and `/new`.",
        ],
      },
      {
        id: "bait-what-it-does",
        heading: "The bait channel: what it does",
        body: [
          "Hacked accounts and spam bots post the same scam in every channel they can see. The bait channel is a channel the bot's warning tells everyone not to write in. Whoever writes there is removed automatically. The bot does not read the message: the channel alone decides. The server owner and anyone with Administrator, Manage Server, Manage Messages, Timeout Members or Ban Members are never touched; the bot only deletes their message and notes it in the log.",
        ],
      },
      {
        id: "bait-set-up",
        heading: "Set up the bait channel",
        steps: [
          "Open Protection → Bait channel.",
          "Pick the Bait channel. Keep it visible to everyone: bots only fall for channels they can see, and people must be able to read the warning. In Discord you can also run `/bait setup`; without a channel the bot creates one named bait.",
          "Choose what happens to whoever writes there.",
          "Pick a Log channel (it cannot be the bait channel itself). It shows who bit, how old the account is and the action taken.",
          "Optionally tick the direct message option. The person is told why, with advice if their account was hacked. The message goes out before the action.",
          "Turn on Bait on and click Save. The bot posts a warning in the channel and keeps its counter up to date.",
        ],
        table: {
          head: ["Action", "What happens", "Bot permission"],
          rows: [
            ["Kick (soft-ban), the default", "Ban and immediate unban. Discord deletes the person's messages from the last hour in every channel. They can rejoin with an invite.", "Ban Members"],
            ["Ban", "Permanent ban. Messages from the last hour are deleted in every channel.", "Ban Members"],
            ["Timeout for 24 hours", "The person cannot write for 24 hours. Only the message in the bait channel is deleted.", "Timeout Members"],
          ],
        },
        note: "In the bait channel the bot needs View Channel, Send Messages, Embed Links, Read Message History and Manage Messages. If it cannot post its warning there, the bait stays off.",
      },
      {
        id: "false-alarm",
        heading: "If a real person bites",
        body: [
          "The Log channel entry tells you who it was. What you do depends on the action:",
        ],
        list: [
          "Kick: nothing to undo. Send them a new invite.",
          "Ban: unban them in Server Settings → Bans.",
          "Timeout: remove the timeout from the member in Discord.",
          "Soft-ban where the unban failed: the log says so and the person is still banned. Unban them in Server Settings → Bans.",
        ],
        note: "Staff are exempt, so you cannot test the bait with your own account. Use a spare account without staff permissions, and start with the Timeout action while you test.",
      },
    ],
    faq: [
      { q: "Is verification a paid feature?", a: "No. One panel with button, math captcha and account-age check is on the Free plan. Premium raises the number of panels from 1 to 10." },
      { q: "Does the bait channel read messages?", a: "No. Any message written there triggers it. That is why the warning is posted in the channel itself." },
      { q: "Can a member who passed verification be verified twice?", a: "The bot answers that they are already verified and does not touch their roles, so a role you removed by hand does not come back with a click." },
      { q: "Is the bait channel free?", a: "Yes, on every plan." },
      { q: "The bait switched itself off. Why?", a: "The most common cause is a deleted bait channel. See [Troubleshooting](/docs/troubleshooting)." },
    ],
    related: ["/docs/permissions", "/docs/troubleshooting", "/features/discord-verification-bot", "/features/discord-anti-spam-bait-channel", "/commands"],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 5 · applications (how-to)
  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: "applications",
    kind: "how-to",
    nav: "Staff applications",
    title: "Run Staff Applications on Discord",
    description:
      "Build an application form, choose a review channel and managers, approve or deny with a note, open a discussion channel and limit repeat applications.",
    keywords: ["discord application bot", "discord staff application", "discord form bot guide", "application review discord", "discord application cooldown", "carbon stealth"],
    answer:
      "How to collect applications in Discord: build the form, post its button, send each submission to a review channel, decide with Approve or Deny, talk to the applicant first if you need to, and limit repeat submissions.",
    updated: "2026-11-13",
    requires: ["The bot is in your server", "A channel where your team reviews applications"],
    sections: [
      {
        id: "build-the-form",
        heading: "Build the form",
        steps: [
          "Open Support → Forms and click New form.",
          "Enter the Form name and choose the type Application form.",
          "Add questions. Each can be Short text, Paragraph, Single choice, Multi choice or Number. Mark the ones that must be answered as Required, and set Min length and Max length where it helps.",
          "Choose the Review channel: the channel where each submission is posted for your team.",
          "Click Create form.",
        ],
        note: "Free servers get 2 forms with 5 questions each. Premium raises this to 50 forms with 50 questions each and adds conditional branching and regex validation.",
      },
      {
        id: "notify-and-managers",
        heading: "Who is told and who may decide",
        list: [
          "Ping these roles on new submission: the roles mentioned in the review message.",
          "Application managers (can review alongside admins): roles that may approve and deny. Members with Manage Server can always review.",
          "Transcript channel (optional): where a record is posted after approve or deny. Leave it empty to switch it off.",
          "Discussion category: where a private discussion channel is created. Empty means the bot picks a category by name (applications, tickets, reviews, staff).",
        ],
        note: "If the bot cannot post in the review channel, the applicant still sees Submitted and your log channel gets a warning to check the review channel and the bot's permissions. The application waits in Support → Applications.",
      },
      {
        id: "publish",
        heading: "Publish the form",
        body: [
          "In the channel where applicants should see it, run `/form spawn` with the form name. The bot posts a button. Members can also start an application from anywhere with `/apply`. `/form spawn` needs Manage Server; `/apply` is open to everyone.",
          "To ask for an application before a ticket, attach a form to a ticket panel button: see [Tickets](/docs/tickets).",
        ],
      },
      {
        id: "applicant-experience",
        heading: "What the applicant does",
        list: [
          "The bot sends the questions one by one in a direct message. Direct messages from server members must be on; otherwise the bot says it could not send a message.",
          "Optional questions can be skipped by typing skip. Typing cancel stops the session.",
          "A session expires after 15 minutes of inactivity.",
          "At the end the applicant sees Form Submitted.",
        ],
      },
      {
        id: "review",
        heading: "Review an application",
        body: ["Each submission appears in the review channel with three buttons, and on the page Support → Applications."],
        list: [
          "Approve or Deny: opens a box for a note. The applicant receives the note in a direct message.",
          "Open a ticket: opens a private discussion channel with the applicant before you decide. The application stays pending. The channel closes after the decision.",
          "In the dashboard: open the application, press Review application, then Confirm approval or Confirm denial. The applicant history shows earlier applications.",
          "In Discord, `/form review` with the application ID and the action approve or deny does the same.",
        ],
        note: "Only the first decision counts. If a second reviewer clicks later, they see that the application was already reviewed, and roles and messages are sent once. Nobody but a member with Manage Server can decide their own application: an application manager who applies is refused.",
      },
      {
        id: "roles-and-messages",
        heading: "Give roles and send your own messages (Premium)",
        body: [
          "Under Advanced: roles, messages, cooldowns, set Accept → add roles, Accept → remove roles and Deny → add roles. Write your own Accept DM message and Deny DM message; {user} and {note} are replaced. Without Premium the standard messages are used and no roles are changed automatically.",
        ],
      },
      {
        id: "limits",
        heading: "Limit repeat applications",
        list: [
          "Cooldown (seconds): the time before the same person can submit again. Free servers have a 60-second cooldown. Premium lets you set your own.",
          "Max submissions per user (Premium): how many times one person can submit the form. Empty means unlimited.",
          "Applications closed: tick it to stop accepting submissions. People see that the form is closed.",
        ],
      },
    ],
    faq: [
      { q: "An applicant says the bot could not message them. Why?", a: "They have direct messages from server members turned off. They switch it on in their Discord privacy settings and start again." },
      { q: "Who can approve an application?", a: "Members with Manage Server and members with an application manager role." },
      { q: "Does the applicant learn why they were denied?", a: "If you write a note, yes. It is sent to them in a direct message." },
      { q: "Can I read applications outside Discord?", a: "Yes, in Support → Applications. Premium servers can also export them as CSV or read them through the [API](/docs/webhooks-and-api)." },
    ],
    related: ["/docs/tickets", "/docs/premium", "/features/discord-application-forms", "/commands"],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 6 · premium (how-to + explanation)
  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: "premium",
    kind: "how-to",
    nav: "Premium: buy, cancel, export",
    title: "Premium: Buy, Manage and What Happens After",
    description:
      "How to buy Supreme Bot Premium or White-label in Discord, what each plan includes, how to cancel, and the 30-day window to export your data after a plan ends.",
    keywords: ["supreme bot premium", "discord premium app subscription", "discord bot subscription cancel", "discord ticket bot pricing", "supreme bot white-label", "carbon stealth"],
    answer:
      "You buy Premium inside Discord, one subscription per server. This page lists what each plan includes, how to cancel, and what happens to your data and settings when a plan ends, including 30 days to export.",
    updated: "2026-11-13",
    sections: [
      {
        id: "buy",
        heading: "Buy a plan",
        steps: [
          "Open your server in the dashboard and choose Server → Premium. (In Discord, `/premium` shows the server's status and an upgrade link.)",
          "Click Open the Discord store.",
          "Pick Premium or White-label for this server and finish Discord's checkout.",
          "Discord sells the subscription: it takes the payment, applies VAT and sends the receipt. The plan switches on when Discord confirms the purchase.",
        ],
        note: "Price: from €4.99 / €9.99 per server per month; the final price including VAT for your country is shown in Discord before you pay. Plans are monthly only. There is no annual plan and no free trial.",
      },
      {
        id: "plans",
        heading: "What each plan includes",
        body: ["Limits come from the plan table in the bot's code. White-label is Premium plus your own bot (see below)."],
        table: {
          head: ["", "Free", "Premium"],
          rows: [
            ["Ticket panels", "1", "50"],
            ["Forms / questions per form", "2 / 5", "50 / 50"],
            ["Verification panels", "1", "10"],
            ["Transcript retention", "30 days after close", "Unlimited"],
            ["Webhooks", "0", "20"],
            ["Sticky messages / scheduled messages", "0 / 0", "100 / 100"],
            ["Knowledge base articles", "3", "50"],
            ["Reaction role messages", "2", "25"],
            ["Game: shop items / level roles", "5 / 5", "50 / 100"],
            ["Game: companion slots per member / active quests", "1 / 1", "1000 / 3"],
          ],
        },
        list: [
          "Premium also adds: claim, rename and escalate for tickets; round-robin assignment; SLA alerts; feedback ratings; direct messages on open and close; observer roles; separate open and closed categories; inactivity auto-close; close when the creator leaves; duplicate panels; CSV export.",
          "Forms: conditional branching, regex validation, your own cooldown and submission limit, roles on approve or deny, your own direct messages.",
          "Automation: sticky, scheduled and recurring messages.",
          "Integrations: webhooks, the public REST API and AI auto-replies.",
          "Game: rare, epic and legendary companions, daily trivia, trivia from your knowledge base, and the party commands `/wyr` and `/tod`.",
          "Not behind Premium: verification and the bait channel, polls and giveaways, reaction roles (with lower limits), welcome messages, auto roles, role saver and the server activity log.",
        ],
      },
      {
        id: "white-label",
        heading: "The White-label plan",
        body: [
          "White-label includes everything in Premium and runs the bot under your own Discord application, with your own name and avatar. Add the bot token in Settings → White-label bot, or run `/premium custombot` with the token.",
        ],
      },
      {
        id: "cancel",
        heading: "Cancel",
        body: [
          "Cancel in Discord: User Settings → Subscriptions. Access stays until the end of the period you paid for. The dashboard shows Subscription cancelled and the end date.",
          "Refunds follow Discord's refund policy. Ask Discord (User Settings → Subscriptions, or Discord Support). We cannot refund a Discord purchase ourselves.",
        ],
      },
      {
        id: "after-the-plan-ends",
        heading: "What happens when a plan ends",
        body: [
          "The server returns to the Free plan. Panels, forms and settings are kept, but Premium-only options stop taking effect and the Free limits apply again. Webhooks stop sending, and API keys answer with 403 PREMIUM_REQUIRED.",
          "You have 30 days after the plan ends to export your data. The Premium page shows a banner with the last day, and the export buttons Export tickets (CSV) and Export applications (CSV) keep working until then. A PDF of a single ticket is on the Tickets page.",
        ],
        note: "Free servers keep transcripts for 30 days after a ticket closes. Transcripts of tickets that closed more than 30 days before the plan ended can be removed as soon as the plan ends, so export before you cancel.",
      },
      {
        id: "multi-server",
        heading: "More than one server",
        body: [
          "Each server needs its own subscription. Multi-server bundles are no longer sold; bundles bought earlier work until they are cancelled.",
        ],
      },
    ],
    faq: [
      { q: "Does the price include VAT?", a: "Plans start at €4.99 (Premium) and €9.99 (White-label) per server per month. Discord shows the final price including VAT for your country before you pay." },
      { q: "Is there a free trial or an annual plan?", a: "No. Discord supports monthly subscriptions only for this kind of purchase, and Supreme Bot offers no trial." },
      { q: "Can I use one subscription on several servers?", a: "No. A subscription belongs to one server." },
      { q: "What do I lose if I cancel?", a: "Premium-only features and the higher limits. Settings and structure stay. Old transcripts, webhooks and API access are the parts to plan for." },
      { q: "Where do I get the receipt?", a: "From Discord. Discord is the seller and issues receipts and VAT." },
    ],
    related: ["/docs/tickets", "/docs/privacy-and-data", "/features/white-label-discord-bot", "/commands"],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 7 · privacy-and-data (how-to)
  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: "privacy-and-data",
    kind: "how-to",
    nav: "Privacy, export and deletion",
    title: "Privacy, Data Export and Deletion",
    description:
      "What Supreme Bot stores and for how long, how members use /privacy to see and delete data, how owners export server data, and what removing the bot does.",
    keywords: ["discord bot data privacy", "discord bot gdpr export delete", "supreme bot privacy command", "discord ticket data retention", "discord bot data deletion", "carbon stealth"],
    answer:
      "How long Supreme Bot keeps each kind of data, what a member can do with /privacy, how a server owner exports data, and what is deleted when you remove the bot. The legal texts are the [Privacy Policy](/privacy) and the [Terms](/terms); this page is the practical guide.",
    updated: "2026-11-13",
    sections: [
      {
        id: "what-is-kept",
        heading: "What is kept, and for how long",
        table: {
          head: ["Data", "How long"],
          rows: [
            ["Ticket transcripts and the message text of closed tickets, Free servers", "30 days after the ticket closes, then removed"],
            ["Ticket transcripts, Premium servers", "Until you delete them"],
            ["Role snapshots (role saver)", "180 days, or at once when you turn role saver off"],
            ["Verification attempts", "90 days"],
            ["Companion battle records", "30 days"],
            ["Audit log entries", "2 years"],
            ["Abuse reports", "1 year after resolution"],
            ["Payment and invoice records", "7 years, kept for legal reasons"],
            ["Server data after the bot is removed", "Personal data is purged 30 days after removal (not while a paid subscription is live)"],
          ],
        },
        note: "The server activity log (Protection → Activity log) is posted to your Discord channel. It is not stored by Supreme Bot and not shown in the dashboard. Server Season never reads message text; it counts only that a message happened.",
      },
      {
        id: "members-privacy-command",
        heading: "For members: /privacy",
        list: [
          "`/privacy info` shows what the bot stores about you: tickets, ticket messages, applications, role snapshots, verification attempts and game progress, with counts, and links to the policy.",
          "`/privacy delete` asks for confirmation with a button, then anonymises your profile and the author signature on your ticket messages, and deletes your sessions, API keys, role snapshots, verification attempts and membership records across all servers that use Supreme Bot. It cannot be undone. The erasure is all or nothing: if a step fails, no data is removed, you are asked to try again, and the failure is recorded in the audit log.",
        ],
        note: "The text of tickets stays as the server's own record. To have it erased too, write to privacy@carbonstealth.eu. An active paid subscription must be cancelled first, in Discord under User Settings → Subscriptions.",
      },
      {
        id: "owners-export",
        heading: "For owners: export server data",
        steps: [
          "Open Server → Premium. In the Data export card, click Export tickets (CSV) or Export applications (CSV).",
          "For one ticket, open Support → Tickets and click Download PDF transcript.",
          "Read data through the [API](/docs/webhooks-and-api) if you need it in your own tools.",
        ],
        body: ["CSV export is a Premium feature. After a plan ends it keeps working for 30 days: see [Premium](/docs/premium). A CSV file holds up to 200,000 rows, and a note in the file says so if the limit is reached."],
      },
      {
        id: "owners-account",
        heading: "For owners: your own account data",
        steps: [
          "Open the account menu and choose Privacy & data.",
          "To get a copy of your data, click Download my data (JSON). It contains your profile, the servers you manage, tickets, applications, API keys and audit log entries.",
          "To delete your account, cancel any paid subscription in Discord first, then type your Discord ID to confirm and click Permanently delete my account.",
        ],
        note: "Transaction records and audit logs are kept for 7 years under tax law. Only a non-identifying reference to your Discord ID remains.",
      },
      {
        id: "remove-the-bot",
        heading: "Remove the bot",
        body: [
          "If you kick the bot, personal data of that server (tickets and their messages, applications, forms, panels, verification panels, reaction roles, knowledge base articles, polls, giveaways, scheduled and sticky messages, canned replies, webhooks, game data) is purged 30 days later. The subscription record, payment log and audit log are kept. If a paid subscription is still live, nothing is purged, so you can add the bot back without losing data.",
          "If you add the bot again within the 30 days, nothing is purged.",
        ],
      },
      {
        id: "your-role",
        heading: "Your role as server owner",
        body: [
          "You decide which features run on your server and what you log. For the activity log the dashboard reminds you that you are the data controller for it: enable it only with a lawful basis, and tell your members. For legal questions, read the [Privacy Policy](/privacy) or write to privacy@carbonstealth.eu.",
        ],
      },
    ],
    faq: [
      { q: "Does the bot read my members' messages?", a: "It sees messages to run features such as the bait channel, sticky messages and the game. Server Season counts the event and never stores the text. Ticket messages are stored, because they are the ticket's record." },
      { q: "A member asks me to delete their data. What do I do?", a: "Point them to `/privacy delete`. For the text of a ticket, they can write to privacy@carbonstealth.eu." },
      { q: "Is there a button to delete all data of my server?", a: "Not in the dashboard. Removing the bot starts the 30-day purge. For anything else, write to privacy@carbonstealth.eu." },
      { q: "How long are Free-plan transcripts available?", a: "30 days after the ticket closes." },
    ],
    related: ["/docs/premium", "/docs/tickets", "/privacy", "/terms"],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 8 · welcome-and-roles (how-to)
  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: "welcome-and-roles",
    kind: "how-to",
    nav: "Welcome, auto roles, role saver",
    title: "Welcome Messages, Auto Roles and Role Saver",
    description:
      "Greet new members with variables, give roles on join, restore roles when members return, and let people pick roles with reactions, including one-role mode.",
    keywords: ["discord welcome bot", "discord autorole", "discord reaction roles setup", "discord role saver", "discord sticky roles", "carbon stealth"],
    answer:
      "Everything that happens when a person joins, all on one dashboard page: the greeting, the roles given at once, the roles given back to returning members, and the roles people choose themselves. All four are free.",
    updated: "2026-11-13",
    requires: ["The bot's role is above the roles you want it to give (see [Permissions](/docs/permissions))"],
    sections: [
      {
        id: "welcome-message",
        heading: "Greet new members",
        steps: [
          "Open Community → Welcome & roles. The first section is Welcome message.",
          "Turn on Enable welcome message in a channel, pick the Welcome channel and write the message. Pick an Embed color if you like.",
          "To also message the person privately, tick Also DM the new member and write the Welcome DM.",
          "Save.",
        ],
        body: [
          "Variables work in both texts: {user} mentions the person, {user.name} is their name, {server} is the server name, {server.members} is the member count, and {date} and {time} are the current date and time. The text can be up to 2000 characters.",
        ],
        code: "Welcome {user} to {server}! You are member #{server.members}.",
      },
      {
        id: "auto-roles",
        heading: "Give roles when someone joins",
        steps: [
          "Open the Auto roles section.",
          "Under Autorole — roles for new members, pick the roles every new member receives.",
          "Under Autorole — roles for new bots, pick the roles bot accounts receive.",
          "Save.",
        ],
        body: [
          "Roles with dangerous permissions are never given automatically, and neither are roles the bot sits below. Each list holds up to 20 roles. If a verification panel removes a role, auto roles do not give it back to a member who is already verified.",
        ],
      },
      {
        id: "role-saver",
        heading: "Give roles back to returning members",
        steps: [
          "Open the Role saver section.",
          "Tick Save roles when a member leaves and restore them when they return, and save.",
        ],
        list: [
          "When a member leaves, the bot remembers their roles. When they come back, the bot gives them again.",
          "Never restored: roles with dangerous permissions (Administrator, Manage Server and similar), roles managed by integrations or boosts, and roles above the bot's own role.",
          "A kick or a ban is not a leave. Roles are not saved for members you removed, so a punishment does not undo itself.",
          "Saved roles are deleted after 180 days, or at once when you turn role saver off.",
        ],
        note: "A moderator who leaves and returns gets back their non-dangerous roles by rejoining. The bot tells a kick or a ban apart from a normal leave using the audit log, which is why it needs View Audit Log. If it cannot tell, it saves the roles.",
      },
      {
        id: "reaction-roles",
        heading: "Let people pick roles with reactions",
        steps: [
          "Open the Reaction roles section and click New message.",
          "Write the title and description members will see.",
          "Add pairs of emoji and role (Add pair). One message holds up to 20 pairs.",
          "Tick One role if members may hold only one role from this message.",
          "Click Post to channel.",
        ],
        body: [
          "A member reacts to get the role and removes the reaction to lose it. In One role mode, picking a second emoji gives the new role first, then takes the old one away, so a failed change never leaves the member with no role.",
          "The Free plan allows 2 reaction role messages. Premium allows 25.",
        ],
        note: "If a role is one the bot will not give (managed, risky permissions, or above the bot), the bot removes the person's reaction instead of giving the role. If your reactions keep vanishing, check the role order.",
      },
    ],
    faq: [
      { q: "Why does the bot not give a role I picked?", a: "The role is managed by an integration, has a risky permission, or sits above the bot's role. The role picker marks such roles. Move the bot's role higher or choose another role." },
      { q: "Does role saver restore Administrator?", a: "No. Roles with dangerous permissions are never restored." },
      { q: "How long are saved roles kept?", a: "180 days. Turning role saver off deletes the saved roles at once." },
      { q: "Where did the welcome settings go?", a: "They moved out of Settings. Settings → Other settings live next to what they control points to Community → Welcome & roles." },
    ],
    related: ["/docs/permissions", "/docs/troubleshooting", "/features/discord-welcome-bot-autorole", "/features/discord-reaction-roles"],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 9 · server-season (how-to + explanation)
  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: "server-season",
    kind: "how-to",
    nav: "Server Season game",
    title: "Server Season: XP, Sparks, Companions and Quests",
    description:
      "Turn on Server Season, set XP and rewards, build a shop, understand companions, spawn odds and battles, and run weekly quests. Sparks are earned, never sold.",
    keywords: ["discord leveling bot", "discord xp bot setup", "discord game bot", "discord companion bot", "discord server shop bot", "carbon stealth"],
    answer:
      "Server Season is the leveling game built into Supreme Bot. Members earn XP and sparks by being active, spend sparks in a server shop and on companions, and work on weekly server quests. Nothing in it is bought with money.",
    updated: "2026-11-13",
    requires: ["The bot is in your server"],
    sections: [
      {
        id: "turn-it-on",
        heading: "Turn the game on",
        steps: [
          "Open Community → Game. The Overview tab opens.",
          "Tick Enable Server Season on this server. It is off until you do.",
          "Set XP per message (15 by default), Message cooldown (seconds) (60), XP per voice minute (5) and Daily sparks (/daily) (50).",
          "Pick an Announcement channel for level-ups. Leave it empty for no announcements.",
          "Click Save.",
        ],
        body: ["The tabs are Overview, Level roles, Shop, Leaderboard, Companions and Quests & mini-games."],
      },
      {
        id: "xp-and-levels",
        heading: "How XP and levels work",
        body: [
          "The bot counts that a message happened. It never reads or stores the text. XP comes from:",
        ],
        list: [
          "Messages (with the cooldown you set) and voice minutes",
          "Poll votes (5 XP), giveaway entries (10), an approved application (50), verification (20), a trivia win (25), every 100th number in the counting channel (15), `/daily` (25)",
          "For staff: closing a ticket within its SLA (30)",
        ],
        table: {
          head: ["Level", "XP needed to reach the next level"],
          rows: [["0 to 1", "100"], ["1 to 2", "155"], ["2 to 3", "220"], ["3 to 4", "295"], ["4 to 5", "380"]],
        },
        note: "The formula is 5 × n² + 50 × n + 100 XP to go from level n to level n + 1. Each level-up also pays sparks: 10 times the new level, up to 250.",
      },
      {
        id: "sparks",
        heading: "Sparks",
        body: [
          "Sparks are the game's currency. Members get them from `/daily`, level-ups, quests, trivia and won battles. `/daily` can be claimed once every 24 hours; consecutive days build a streak that survives a gap of up to 48 hours, and from day 7 the reward doubles.",
          "Sparks cannot be bought. Supreme Bot has no product that sells sparks, XP or companions, and no loot boxes. The only paid products are the Premium and White-label subscriptions.",
        ],
      },
      {
        id: "level-roles",
        heading: "Give roles for reaching a level",
        steps: [
          "Open the Level roles tab.",
          "Click Add level role, choose a level and a role, and save.",
        ],
        body: [
          "Roles stack: a member at level 20 holds every role listed for level 20 and below. The bot never gives managed roles, roles with dangerous permissions or roles above its own. Free servers can set 5 level roles; Premium allows 100.",
        ],
      },
      {
        id: "shop",
        heading: "Build the shop",
        steps: [
          "Open the Shop tab and click New item.",
          "Set the Name, Price (sparks) and Description.",
          "Choose the Type: Role (the bot gives the role) or Custom perk (you hand it over yourself).",
          "For a role, pick it and set Duration (days) (empty means permanent). Optionally set Stock (empty means unlimited).",
          "Keep Visible in /shop ticked and click Create.",
        ],
        body: [
          "Members browse with `/shop`. The bot checks it can give the role before it takes any sparks. If the role still cannot be given, the sparks are returned. A member who already holds a permanent role is not charged. For custom perks, the Recent purchases list shows who bought what.",
          "Free servers can have 5 shop items; Premium allows 50.",
        ],
      },
      {
        id: "companions",
        heading: "Companions",
        body: [
          "Companions are 60 collectible creatures. They appear in active channels: after at least 6 XP-earning events since the last appearance, each further event has a 1 in 25 chance, with at least 12 minutes between appearances. The first member to press Catch within 5 minutes keeps the companion. Only one companion is live per server. Under Companions & mini-games you can limit where they appear (empty means any text channel with activity) or switch them off.",
          "Admins can call one up with `/spawn` (Manage Server). It follows the same rules as a natural appearance: a specific companion or a random one, in this channel or another.",
        ],
        list: [
          "`/companion list` shows your collection. Feed sparks with `/companion feed`: at 100 and 300 sparks it evolves into its next form.",
          "`/companion activate` shows one on your `/profile`. `/companion trade` offers a one-for-one swap; the other member has 10 minutes to accept. `/companion release` frees a slot.",
          "Each member has 1 collection slot on the Free plan and 1000 on Premium.",
          "Companions marked as seasonal appear only while their season runs.",
        ],
      },
      {
        id: "spawn-odds",
        heading: "Spawn odds",
        body: [
          "When a companion appears, its rarity is drawn first, then one companion of that rarity at random. Free servers draw only from common and uncommon. Premium servers draw from all five. These are the weights in the bot's code:",
        ],
        table: {
          head: ["Rarity", "Companions in the catalog", "Chance on a Free server", "Chance on Premium"],
          rows: [
            ["Common", "24", "70.6 %", "60 %"],
            ["Uncommon", "16", "29.4 %", "25 %"],
            ["Rare", "12", "not drawn", "10 %"],
            ["Epic", "6", "not drawn", "4 %"],
            ["Legendary", "2", "not drawn", "1 %"],
          ],
        },
        note: "Seasonal companions appear only while their season runs. If the rarity you drew has only seasonal companions and the season is over, the draw falls to the next lower rarity.",
      },
      {
        id: "battles",
        heading: "Battles, and how to leave them",
        body: [
          "Battles are on by default once the game is on. `/companion attack` pits your active companion against another member's. The fight is decided on the server and replayed in the channel. The loser loses 1 to 3 percent of their sparks (less against a stronger opponent) and the sparks vanish. The winner earns 10 sparks, 15 against a stronger opponent, and nothing against a much weaker one.",
          "`/companion train` raises one of a companion's four stats (attack, defense, speed, health) for sparks. The levels cost 20, 40, 60 and so on, and each form caps the stat levels at 4, 7 and 10, so evolving matters.",
        ],
        table: {
          head: ["Limit", "Value"],
          rows: [
            ["Between two of your attacks", "5 minutes"],
            ["Same opponent again", "1 hour"],
            ["Attacks per 24 hours", "15"],
            ["Rewarded wins per 24 hours", "5"],
            ["Lost defenses that cost sparks per 24 hours", "5"],
            ["Shield after a lost defense", "30 minutes"],
          ],
        },
        list: [
          "To leave battles: members run `/companion pvp off`. Nobody can attack them and they cannot attack. Switching off works one hour after your own last attack. `/companion pvp on` returns.",
          "To switch battles off for the server: Overview → Companion battles enabled.",
          "Battle records are deleted after 30 days.",
        ],
      },
      {
        id: "quests",
        heading: "Quests, counting and trivia",
        list: [
          "Weekly quests start by themselves when Weekly server quests enabled is ticked and no quest is active. The topics rotate: messages, `/daily` claims, voice minutes, poll votes, verifications. A quest lasts 7 days. Everyone who contributes is rewarded; the top contributor opens a chest. Members see progress with `/quest`.",
          "In the Quests & mini-games tab you can start your own quest (Type, Target, Reward, Duration) or cancel one. A cancelled quest pays nobody. Free servers run 1 active quest, Premium 3.",
          "Counting: members count up one by one in the Counting channel. A wrong number, or the same member twice in a row, resets to 1.",
          "Trivia: set a Trivia channel and a Trivia schedule (Off, Daily or Weekly). Free servers get weekly rounds from our question bank. Premium adds daily rounds and questions from your knowledge base. Admins can start a round with `/trivia`.",
        ],
      },
    ],
    faq: [
      { q: "Is this gambling?", a: "No. There are no slots, roulette or loot boxes, and nothing is bought with money. Every reward comes from activity in your server." },
      { q: "Can members buy sparks?", a: "No. Sparks are earned only." },
      { q: "Can a battle take a companion away?", a: "A lost battle costs sparks, 1 to 3 percent of the loser's total. Releasing a companion is a separate, confirmed action." },
      { q: "How do I stop battles?", a: "Switch Companion battles enabled off in Game → Overview. Each member can also leave with `/companion pvp off`." },
      { q: "What is free and what is Premium?", a: "The whole loop is on the Free plan with lower limits: 5 level roles, 5 shop items, 1 companion slot and 1 active quest. Premium raises the limits and adds rare companions and daily trivia." },
    ],
    related: ["/features/discord-leveling-game", "/docs/premium", "/docs/privacy-and-data", "/commands"],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 10 · messages-and-engagement (how-to)
  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: "messages-and-engagement",
    kind: "how-to",
    nav: "Polls, giveaways, schedules",
    title: "Polls, Giveaways, Sticky and Scheduled Messages",
    description:
      "Run polls and giveaways with role requirements, keep a sticky message at the bottom of a channel, and schedule one-off or repeating messages in your local time.",
    keywords: ["discord poll bot", "discord giveaway bot", "discord sticky message bot", "discord scheduled messages", "discord recurring message", "carbon stealth"],
    answer:
      "Ask members a question, give something away, pin a message to the bottom of a channel, or send a message on a schedule. Polls and giveaways are free. Sticky and scheduled messages are Premium.",
    updated: "2026-11-13",
    requires: ["The bot can View Channels and Send Messages in the channels you use"],
    sections: [
      {
        id: "polls",
        heading: "Run a poll",
        steps: [
          "Open Community → Polls & giveaways. The Polls tab opens. Click New poll.",
          "Pick the Channel, write the Question and list the Options, one per line (2 to 9).",
          "Tick Multi-choice if members may vote for more than one option. Set Auto-close after (hours, optional) if you want a deadline.",
          "Click Post poll.",
        ],
        body: [
          "In Discord, `/poll` does the same: `/poll` with the question and up to 9 comma-separated options, plus optional multi-choice and a duration in hours. Votes are counted live. You can close a poll early from the dashboard.",
        ],
      },
      {
        id: "giveaways",
        heading: "Run a giveaway",
        steps: [
          "On the same page, open the Giveaways tab and click New giveaway.",
          "Pick the Channel, enter the Prize and the Duration (minutes), and set the number of Winners.",
          "Optionally add Required roles. Only members who hold the roles can enter.",
          "Click Start giveaway.",
        ],
        body: [
          "Members enter with the button on the message and leave by pressing it again. Someone without a required role is told which roles they need. When the timer ends the bot picks the winners from the people who entered and are still in the server. End a giveaway early with End now, or draw new winners with Reroll after it has ended.",
          "In Discord, `/giveaway start`, `/giveaway end` and `/giveaway reroll` do the same (Manage Server).",
        ],
      },
      {
        id: "sticky",
        heading: "Keep a sticky message at the bottom (Premium)",
        steps: [
          "Open Community → Messages. The Sticky messages section is first.",
          "Click Set sticky message, pick the channel, write a title (optional) and the content, then click Save sticky.",
        ],
        body: [
          "The bot reposts the message at the bottom of the channel as new messages arrive. Each channel has one sticky message; setting it again replaces the text. Premium allows up to 100 sticky messages. `/admin sticky set` and `/admin sticky remove` work in the current channel (Manage Server).",
        ],
      },
      {
        id: "scheduled",
        heading: "Schedule a message (Premium)",
        steps: [
          "On Community → Messages, open Scheduled messages and click Schedule new message.",
          "Pick the channel, write the content and set Send At (local time).",
          "Set Recurrence: One-shot, Daily, Weekly or Monthly.",
          "Click Schedule. The list shows each message as Pending or Sent.",
        ],
        body: [
          "Premium allows up to 100 scheduled messages, repeating ones included.",
        ],
      },
      {
        id: "recurrence-rules",
        heading: "How repeating messages behave",
        list: [
          "Time zone: the dashboard sends your browser's time zone with the message. A daily message set for 9:00 stays at 9:00 your time when the clocks change.",
          "Monthly on the 29th, 30th or 31st: in a shorter month the message goes out on the last day of that month, and returns to the original day the month after. It does not drift.",
          "If the bot was unavailable and missed several runs, the next send is one message, not a burst.",
          "A one-off message that is more than 24 hours late is not sent. A server on the Free plan sends nothing, and its repeating messages move forward without being sent.",
        ],
        note: "Messages created with `/admin schedule add` use UTC, not your local time. The `when` value is an ISO timestamp or a relative time such as 2h, 1d or 30m. Use the dashboard if you need local time.",
      },
    ],
    faq: [
      { q: "Are polls and giveaways free?", a: "Yes, with no limit on how many you run." },
      { q: "Can I limit a giveaway to a role?", a: "Yes. Add Required roles when you create it. Members without them cannot enter." },
      { q: "Why did my 31st-of-the-month message arrive on the 30th?", a: "That month has no 31st, so the message goes out on the last day. Next month it returns to the 31st." },
      { q: "Can a member vote twice?", a: "On a single-choice poll each member has one vote, even if they click several times at once." },
    ],
    related: ["/features/discord-poll-bot", "/features/discord-giveaway-bot", "/features/discord-sticky-scheduled-messages", "/docs/premium", "/commands"],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 11 · webhooks-and-api (reference)
  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: "webhooks-and-api",
    kind: "reference",
    nav: "Webhooks and REST API",
    title: "Webhooks and Public API Reference",
    description:
      "Reference for Supreme Bot webhooks and the public REST API: events and payloads, HMAC signatures, retries, endpoints, scopes, query parameters and rate limits.",
    keywords: ["discord bot webhooks", "discord ticket api", "hmac webhook signature", "supreme bot rest api", "discord bot integration", "carbon stealth"],
    answer:
      "Webhooks push events to your URL as they happen. The public REST API at /public/v1 lets you read tickets, forms, applications and daily analytics. Both need Premium.",
    updated: "2026-11-13",
    requires: ["A Premium plan on the server", "For webhooks: an https URL that accepts POST requests", "For the API: an API key"],
    sections: [
      {
        id: "create-a-webhook",
        heading: "Create a webhook",
        steps: [
          "Open Data & integrations → Webhooks and click New webhook.",
          "Enter a Name and the URL. The URL must start with https://.",
          "Enter a Secret (optional). With a secret, every request is signed.",
          "Select at least one event under Events, then click Create webhook.",
        ],
        body: [
          "A server can have up to 20 webhooks. The URL cannot contain a user name or password and cannot point to a private or internal address. The check runs when you save and again on every delivery. Redirects are not followed.",
        ],
      },
      {
        id: "events",
        heading: "Events",
        table: {
          head: ["Event", "Sent when", "Fields in data"],
          rows: [
            ["TICKET_OPEN", "A ticket is opened, by any route.", "ticketId, number, creatorId, panelId, channelId"],
            ["TICKET_CLOSE", "A ticket is closed, by any route.", "ticketId, number, creatorId, assigneeId, reason, closedBy, source"],
            ["TICKET_REOPEN", "A closed ticket is reopened.", "ticketId, number, creatorId, reopenedBy"],
            ["TICKET_DELETE", "A ticket is deleted.", "ticketId, deletedBy"],
            ["APPLICATION_APPROVED", "An application is approved in the dashboard.", "applicationId, formId, userId, reviewerId, note"],
            ["APPLICATION_DENIED", "An application is denied in the dashboard.", "applicationId, formId, userId, reviewerId, note"],
            ["APPLICATION_SUBMITTED", "Selectable, but not sent today.", "none"],
            ["GIVEAWAY_ENDED", "A giveaway ends or is rerolled.", "giveawayId, prize, winners, entryCount, reroll"],
            ["POLL_CLOSED", "A poll closes.", "pollId, question, options, counts, totalVotes, multiChoice, closedAt"],
            ["VERIFICATION_SUCCESS", "A member passes a verification check.", "panelId, userId"],
            ["VERIFICATION_FAILURE", "A member fails a verification check.", "panelId, userId"],
          ],
        },
        note: "Applications approved or denied with the buttons in Discord do not send APPLICATION_APPROVED or APPLICATION_DENIED today. Only reviews made in the dashboard do. Treat the application events as incomplete until this changes.",
      },
      {
        id: "request-format",
        heading: "Request format",
        body: [
          "Each delivery is an HTTP POST with a JSON body. `event` is the event name, `serverId` the Discord server ID, `timestamp` the time of the event in ISO 8601, and `data` the fields from the table above.",
        ],
        code: [
          "POST /webhook HTTP/1.1",
          "Content-Type: application/json",
          "User-Agent: SupremeBot-Webhooks/1.0",
          "X-SupremeBot-Event: true",
          "X-SupremeBot-Delivery: 5d0c8f5e-9c7e-4a36-8c4f-0a7f3a9e1c11",
          "X-SupremeBot-Timestamp: 1794567890",
          "X-SupremeBot-Signature-V2: sha256=<hex>",
          "X-SupremeBot-Signature: sha256=<hex>",
          "",
          "{\"event\":\"TICKET_CLOSE\",\"serverId\":\"123456789012345678\",\"timestamp\":\"2026-11-13T10:15:00.000Z\",\"data\":{\"ticketId\":\"…\",\"number\":42,\"creatorId\":\"…\",\"assigneeId\":null,\"reason\":null,\"closedBy\":\"…\",\"source\":\"manual\"}}",
        ].join("\n"),
        list: [
          "X-SupremeBot-Delivery is one ID for all retries of the same delivery. Use it to ignore duplicates.",
          "The signature headers appear only when the webhook has a secret.",
        ],
      },
      {
        id: "signature",
        heading: "Verify the signature",
        body: [
          "The new header covers the time as well, so you can reject replayed requests. X-SupremeBot-Signature-V2 is `sha256=` followed by the hex HMAC-SHA256 of the text `timestamp.body`, keyed with your secret. The timestamp is in X-SupremeBot-Timestamp, in seconds. Use the raw request body, exactly as received. Do not parse and re-serialise the JSON.",
          "The older header, X-SupremeBot-Signature, is the HMAC-SHA256 of the body alone. It stays for receivers that already use it. New integrations should use the V2 header.",
        ],
        code: [
          "import crypto from \"node:crypto\";",
          "",
          "// Returns true when the request really comes from Supreme Bot and is recent.",
          "export function isValidWebhook({ secret, rawBody, timestamp, signature }) {",
          "  const age = Math.abs(Date.now() / 1000 - Number(timestamp));",
          "  if (!Number.isFinite(age) || age > 300) return false; // reject anything older than 5 minutes",
          "  const expected = \"sha256=\" + crypto",
          "    .createHmac(\"sha256\", secret)",
          "    .update(`${timestamp}.${rawBody}`)",
          "    .digest(\"hex\");",
          "  const a = Buffer.from(expected);",
          "  const b = Buffer.from(String(signature || \"\"));",
          "  return a.length === b.length && crypto.timingSafeEqual(a, b);",
          "}",
        ].join("\n"),
        note: "The five-minute window is a suggestion, not a rule of the bot. Choose your own.",
      },
      {
        id: "delivery-and-retries",
        heading: "Delivery, retries and automatic disabling",
        list: [
          "Your endpoint has 10 seconds to answer. Any status below 400 counts as delivered. The response body is ignored.",
          "These failures are retried after 2 seconds, 10 seconds and 60 seconds: a network error or timeout, 408, 429 and any 5xx. Other 4xx statuses are not retried.",
          "Retries are held in the memory of the sending service. A restart of that service can lose a pending retry.",
          "After 10 deliveries in a row fail, the webhook is switched off and shows Disabled in the dashboard. Switching it on again resets the failure count.",
          "If the server drops to the Free plan, webhooks stop sending.",
        ],
      },
      {
        id: "create-an-api-key",
        heading: "Create an API key",
        steps: [
          "Open Data & integrations → API keys and click New key.",
          "Enter a name, tick the Scopes the integration needs and optionally set Expires in (days), from 1 to 3650.",
          "Click Create key. The full key starts with bpk_live_ and is shown only once. Copy it now.",
        ],
        body: ["Revoke a key at any time with Revoke key. Keys are read-only: no endpoint changes data."],
      },
      {
        id: "endpoints",
        heading: "Endpoints",
        body: [
          "Base URL: `https://supremebot.carbonstealth.eu/public/v1`. Send the key as a bearer token in the Authorization header. Every endpoint returns data for the key's own server only.",
        ],
        table: {
          head: ["Method and path", "Scope", "Returns"],
          rows: [
            ["GET /me", "none", "server (id, name, icon, isPremium, plan), keyId, scopes"],
            ["GET /tickets", "tickets:read", "data, total, limit, offset. Query: limit, offset, status"],
            ["GET /tickets/{id}", "tickets:read", "The ticket. 404 if it does not exist on this server"],
            ["GET /forms", "forms:read", "data: forms with the number of applications"],
            ["GET /applications", "applications:read", "data, total, limit, offset. Query: limit, offset, status"],
            ["GET /analytics/daily", "analytics:read", "data: daily metrics in date order, at most 365 rows. Query: from, to"],
          ],
        },
        code: [
          "curl https://supremebot.carbonstealth.eu/public/v1/tickets?status=OPEN&limit=50 \\",
          "  -H \"Authorization: Bearer bpk_live_...\"",
        ].join("\n"),
      },
      {
        id: "scopes",
        heading: "Scopes",
        body: [
          "The four scopes `/public/v1` uses are tickets:read, forms:read, applications:read and analytics:read. The key form also lists server:read, panels:read, polls:read and giveaways:read. No `/public/v1` endpoint uses those four today, so leave them unticked.",
        ],
      },
      {
        id: "query-parameters",
        heading: "Query parameters",
        table: {
          head: ["Parameter", "Applies to", "Rule"],
          rows: [
            ["limit", "tickets, applications", "Whole number from 1. Default 20. Values above 100 are treated as 100."],
            ["offset", "tickets, applications", "Whole number, 0 or more. Default 0."],
            ["status", "tickets", "OPEN, CLAIMED, CLOSED or ARCHIVED"],
            ["status", "applications", "PENDING, APPROVED, DENIED or INTERVIEW"],
            ["from, to", "analytics/daily", "A valid date, for example 2026-11-01"],
          ],
        },
        body: ["A bad value returns 400 with a message that names the parameter."],
      },
      {
        id: "errors-and-limits",
        heading: "Errors and rate limits",
        table: {
          head: ["Status", "Meaning"],
          rows: [
            ["400", "A query parameter is invalid."],
            ["401", "The bearer token is missing, not a bpk_live_ key, invalid, revoked or expired."],
            ["403", "The key lacks the scope (Missing scope), or the server has no Premium plan (code PREMIUM_REQUIRED)."],
            ["404", "The ticket does not exist on this server."],
            ["429", "Too many requests."],
          ],
        },
        list: [
          "Each key may make 300 requests per minute.",
          "In addition, each IP address may make 60 requests per minute to /public/v1. These are counted before the key is checked, so the lower limit applies to a single client.",
          "Repeated invalid keys from one address are blocked for a while.",
        ],
      },
    ],
    faq: [
      { q: "Do webhooks and the API need Premium?", a: "Yes. A server on the Free plan cannot create webhooks, and API keys answer 403 PREMIUM_REQUIRED." },
      { q: "Is there a sandbox?", a: "No. Create a key with only the scopes you need and, if you like, a short expiry." },
      { q: "My endpoint was switched off. How do I get it back?", a: "Fix the endpoint, then switch the webhook on again in Data & integrations → Webhooks. The failure count resets." },
      { q: "Can the API change data?", a: "No. All endpoints read." },
    ],
    related: ["/docs/premium", "/docs/tickets", "/docs/applications"],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 12 · troubleshooting (how-to)
  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: "troubleshooting",
    kind: "how-to",
    nav: "Troubleshooting",
    title: "Troubleshooting Supreme Bot",
    description:
      "Fixes for This interaction failed, roles the bot cannot give, a full ticket category, missing permissions, AI replies that do not start and a bait that is off.",
    keywords: ["discord bot interaction failed", "discord bot cannot assign role", "discord bot missing permissions", "discord ticket category full", "supreme bot troubleshooting", "carbon stealth"],
    answer:
      "Start with `/debug`: most problems are a missing permission or a role in the wrong order. Below are the six problems we see most, with the steps that fix them.",
    updated: "2026-11-13",
    sections: [
      {
        id: "interaction-failed",
        heading: "This interaction failed",
        body: [
          "Discord shows this when the bot does not answer a click or a command within 3 seconds. The usual reason is that the bot is offline or restarting.",
        ],
        steps: [
          "Run `/debug` in any channel. If it does not answer either, the bot is not responding.",
          "Open the dashboard Overview and look at System status (Database, Discord bot, Cache), or open the [status page](/status).",
          "Wait a minute and try again. Panels you already posted keep working after a restart.",
          "If it persists, contact support from the dashboard (Get help) with the time, the channel and what you clicked.",
        ],
      },
      {
        id: "cannot-give-role",
        heading: "The bot cannot give a role",
        body: [
          "You see it as: a verified member who still has no access (they read No role could be given to you), a reaction that vanishes, a shop purchase that is refused, or a level role that never arrives. There are three possible reasons.",
        ],
        list: [
          "The role is above the bot, or at its position. Fix: Server Settings → Roles, drag the bot's role above it.",
          "The role has a risky permission such as Administrator, Manage Server or Manage Messages. The bot never gives these. Fix: use a separate role without those permissions.",
          "The role is managed by an integration or a server boost. These cannot be given by anyone. Fix: pick another role.",
        ],
        note: "The role pickers in the dashboard mark roles as bot role, risky permissions or above the bot, so you can see the problem before you save.",
      },
      {
        id: "category-full",
        heading: "The ticket category is full",
        body: [
          "A member sees that the category (50 channels) or the server (500 channels) is full. Discord allows 50 channels in a category and 500 on a server.",
        ],
        steps: [
          "Delete old closed ticket channels (the Delete button on the Ticket closed message), or move them elsewhere.",
          "Or open the panel in Support → Panels and choose another Category for open tickets.",
          "On Premium, set a Category for closed tickets so closed channels leave the open category.",
        ],
        note: "A different message says a channel, category or role set for the panel no longer exists. Open the panel, choose a new one and save.",
      },
      {
        id: "missing-permissions",
        heading: "Permissions are missing",
        steps: [
          "Run `/debug`. Every red cross is a missing permission.",
          "Use the re-invite link in the message, or edit the bot's role in Server Settings → Roles.",
          "If the bot cannot create ticket channels, give it Manage Channels, including on the ticket category itself.",
          "If thread tickets fail, give it Create Private Threads and Manage Threads in the channel where the panel is posted.",
        ],
        note: "`/debug` does not check Pin Messages, Ban Members or Timeout Members. See [Permissions](/docs/permissions).",
      },
      {
        id: "ai-replies",
        heading: "AI replies do not start",
        body: [
          "The AI reply is the first message the bot posts in a new ticket, labelled as AI-generated. The bot posts it automatically, without a staff review. The member's first message is sent to Google Gemini to write it. Check these in order:",
        ],
        list: [
          "The server has an active Premium plan.",
          "In Support → Knowledge base, open AI auto-replies and tick Send an AI-generated first reply when a ticket is opened. Save.",
          "The server has used up its hourly quota: at most 20 AI replies per hour per server.",
          "The custom prompt is at most 2000 characters.",
        ],
        note: "If the bot fails to get a reply, it stays silent and the ticket opens normally. If all of the above is in order and replies still do not appear, the feature may be switched off on our side. Contact support.",
      },
      {
        id: "bait-switched-off",
        heading: "The bait channel switched itself off",
        body: [
          "The bait turns off when it cannot be kept safe. People must be warned before they can be removed, so the bot does not run a bait without its warning.",
        ],
        list: [
          "The bait channel was deleted. The log channel shows: the bait channel was deleted, so the bait is now off.",
          "The bot could not post its warning in the channel, for example because it lost View Channel, Send Messages or Embed Links there.",
        ],
        steps: [
          "Run `/bait status`. It shows off and says if the channel was deleted.",
          "Open Protection → Bait channel, pick a channel that exists and give the bot the five permissions it needs there (see [Verification and bait channel](/docs/verification-and-bait)).",
          "Turn on Bait on and click Save, or run `/bait setup`.",
        ],
      },
      {
        id: "cannot-open-ticket",
        heading: "A member cannot open a ticket",
        list: [
          "They already have the maximum number of open tickets (one by default). They close the old one first.",
          "The panel has a Verification gate and they lack the required role.",
        ],
      },
    ],
    faq: [
      { q: "Where do I get help?", a: "In the dashboard sidebar, under Server, choose Get help. It opens our support server." },
      { q: "Which command shows what is wrong?", a: "`/debug`. It needs Manage Server and only you see the answer." },
      { q: "Do I need to re-post a panel after changing it?", a: "No. Editing a panel keeps its buttons working. `/setup sync` updates every posted panel from the dashboard settings." },
      { q: "A reaction role disappears right after I click it. Why?", a: "The role is one the bot will not give. See The bot cannot give a role, above." },
    ],
    related: ["/docs/permissions", "/docs/getting-started", "/docs/verification-and-bait", "/status"],
  },
];

/** Заглавията на видовете по Diátaxis — за етикета на страницата и за групите в /docs. */
export const DOCS_KINDS = {
  tutorial: { label: "Tutorial", plural: "Start here" },
  "how-to": { label: "How-to guide", plural: "How-to guides" },
  reference: { label: "Reference", plural: "Reference" },
  explanation: { label: "Explanation", plural: "Background" },
};

export const docsPath = (page) => `/docs/${page.slug}`;
export const docsUrl = (page) => `${SITE}${docsPath(page)}`;
export const DOCS_SITE = SITE;
