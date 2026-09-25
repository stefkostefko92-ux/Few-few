// frontend/src/i18n/landingEn.js
// Английският лендинг (x-default, „/“) в СЪЩИЯ формат като преводите в
// landing.js. Досега живееше като твърд JSX в pages/Login.jsx — второ копие на
// същата страница, което изоставаше от преводите. Редизайнът (25.09.2026)
// рендерира и 8-те езика от един компонент (site/Landing.jsx), така че
// промяна в оформлението стига до всички наведнъж. Текстовете са пренесени
// от Login.jsx; поправени са само двете неверни твърдения, които гейтът
// пропускаше („AI drafts the first response“, „EU-only data residency“).
export const LANDING_EN = {
  locale: "en",
  langName: "English",
  title: "Supreme Bot — Discord Ticket Bot & SaaS Platform | Tickets, Forms, Applications | Carbon Stealth",
  description:
    "Supreme Bot is a Discord ticket bot and all-in-one platform by Carbon Stealth: tickets, application forms, verification, giveaways, a leveling game with companions and server quests, automatic AI first replies and white-label bots — one web dashboard, EU-hosted, Premium billed through Discord.",
  h1a: "Eight bots. Eight bills.",
  h1b: "One dashboard.",
  sub: "Tickets, applications, verification, reaction roles, giveaways, activity logging, a leveling game with collectible companions, scheduled messages, webhooks and AI replies — for Discord communities that outgrew a folder full of single-purpose bots.",
  cta: "Start free with Discord",
  ctaNote: "Free forever on the base tier · Premium billed through Discord · Cancel anytime · EU-hosted, GDPR-native",
  seePricing: "See pricing",
  featuresHeading: "Everything, integrated.",
  featuresSub: "Stop juggling 8 different bots that don't talk to each other — each with its own dashboard, permissions and support channel.",
  features: [
    { key: "ticket", title: "Ticket System", desc: "Unlimited ticket volume via button panels — claim, escalate, rename, priority levels, two-step close, rich transcripts and archive links. Staff can reply straight from the dashboard." },
    { key: "forms", title: "Forms & Applications", desc: "Multi-step questionnaires with validation and conditional branching, a review workflow with approve/deny reasons, and a private discussion channel with the applicant before you decide." },
    { key: "reactionRoles", title: "Reaction Roles", desc: "Members react to a message to get a role and remove the reaction to drop it. Up to 20 emoji-to-role pairs per message, exclusive (pick-one) mode, and the bot places the reactions for you." },
    { key: "verification", title: "Verification & Anti-Bot", desc: "One-click button or math captcha. Account age gates. Brute-force protection. Gate ticket panels behind verification." },
    { key: "polls", title: "Polls", desc: "Live-updating embed polls with up to 9 options, single/multi-choice, auto-close timers — start one from the dashboard or with a slash command." },
    { key: "giveaways", title: "Giveaways", desc: "Prize drawings with required-role gating, auto-end scheduler and reroll support — start one from the dashboard or with a slash command." },
    { key: "sticky", title: "Sticky Messages", desc: "Keep important info pinned at the bottom of channels — auto-reposted as new messages arrive." },
    { key: "scheduled", title: "Scheduled Messages", desc: "One-shot or recurring (daily/weekly/monthly) automated posts." },
    { key: "webhooks", title: "Webhook Integrations", desc: "HMAC-signed event delivery for tickets, applications, giveaways, verification — plug into your stack." },
    { key: "ai", title: "AI Auto-Replies", desc: "The AI replies instantly to the first message in a ticket, clearly labelled as an AI reply; your staff take over from there. Opt-in." },
    { key: "activityLog", title: "Server Activity Logging", desc: "Voice, member, moderation and message events relayed to your own log channel — including edited and deleted messages, with the original text kept." },
    { key: "welcomer", title: "Welcomer & Autorole", desc: "Greet new members in a channel or by DM, and assign roles automatically — separate rules for humans and bots." },
    { key: "knowledgeBase", title: "Knowledge Base", desc: "Write answers once; the bot suggests the matching article the moment a ticket opens — and tracks whether it actually helped." },
    { key: "canned", title: "Canned Responses & SLA", desc: "Saved replies your team can drop in with one command, plus first-response and resolution timers that flag a ticket before it goes stale." },
    { key: "game", title: "Leveling & Server Season", desc: "XP from activity (never from message text), level roles, daily sparks with streaks, a server shop, 60 collectible companions and weekly server quests." },
  ],
  game: {
    heading: "A game that brings members back every day",
    sub: "Server Season turns activity in your server into progress: levels, rewards and a collection that live inside your server. No gambling, and sparks can't be bought.",
    bullets: [
      "Levels on the MEE6 curve members already know, with stacking level roles — only safe roles are ever assigned",
      "/daily sparks with a streak (×2 from day 7) and a shop with timed roles or your own custom rewards",
      "60 original companions spawn in active channels — the first member to press Catch keeps it",
      "Weekly server quests, a counting channel and trivia — the whole server plays as one team",
    ],
    link: "See how the game works",
  },
  euHeading: "Built in the EU, for Europe",
  euBullets: [
    "Hosted and stored in the EU (Germany, Hetzner); Discord, Google and Sentry are recipients in the US under Standard Contractual Clauses",
    "GDPR by design: export, deletion and consent withdrawal right in the dashboard",
    "A registered European company — Carbon Stealth VCC, EIK 208725180, VAT BG208725180",
  ],
  faqHeading: "Common questions",
  faq: [
    { q: "How do I pay for Premium?", a: "Through Discord only. Open the Discord store for Supreme Bot, pick Premium or White-label for your server and complete Discord's checkout. Discord is the seller of record: it shows the final price with VAT, charges you and sends the receipt — we never see your card. Subscriptions are monthly; cancel anytime from Discord's User Settings → Subscriptions and keep access until the end of the paid period." },
    { q: "How is pricing calculated?", a: "Premium is billed per server — €4.99/server/month — not per seat, per agent or per ticket. Every server also has the Free tier forever at €0. Put a server on Premium when it needs it, drop it back to Free when it doesn't; you only ever pay for the servers you actively upgrade." },
    { q: "Where is my data stored?", a: "All data is stored in the EU (Germany, Hetzner); Carbon Stealth VCC operates from Bulgaria. Some sub-processors — Discord, Google (optional, for AI replies) and Sentry — are located in the US; those transfers are governed by Standard Contractual Clauses (see Privacy Policy §5-6). Custom bot tokens and Discord OAuth tokens are encrypted at rest with AES-256-GCM. We never sell or share your data." },
    { q: "Can I use my own Discord bot?", a: "Yes — on the White-label tier (€9.99 per server per month, bought in the Discord store) you upload your own bot token and it runs under your brand: your bot's name, avatar and server presence. The token is encrypted at rest with AES-256-GCM." },
    { q: "What happens if I cancel — can I take my data?", a: "No lock-in. Cancel anytime in Discord (User Settings → Subscriptions) — access continues until the end of the period you paid for, then the server reverts to the Free tier. Panels, forms, applications and settings are kept; transcripts of tickets closed more than 30 days ago are deleted on the Free tier. Export what you need to CSV or PDF before the period ends." },
    { q: "Do you support multiple servers?", a: "Yes — connect unlimited Discord servers from one Supreme Bot account. Each server has independent settings, panels, forms, and billing." },
    { q: "Is there an API?", a: "Yes — a public REST API is available on Premium at /public/v1 with bearer token authentication and scoped permissions. Rate limit is 300 req/min per key." },
    { q: "Does the leveling game read our messages?", a: "No. XP is counted per message event with a cooldown — the text is never read or stored for the game. The only exception is the counting channel an admin designates, where the bot checks whether a message is the next number and stores nothing else. The game is off by default, has no gambling, and sparks can't be bought; members can delete their game data with /privacy delete." },
    { q: "How do I get support?", a: "Join our Discord server — direct support from the team that built Supreme Bot (not outsourced). Response times are best-effort; no contractual SLA is included." },
  ],
  compare: {
    heading: "Free vs Premium",
    colCap: "Capability",
    colFree: "Free",
    colPremium: "Premium",
    rows: [
      ["Ticket panels", "1 panel", "50 panels"],
      ["Forms", "2 forms · 5 questions", "50 forms · 50 questions"],
      ["Form logic", "—", "Branching + regex"],
      ["Verification", "Button only", "+ Math captcha + age gate"],
      ["Ticket workflow", "Basic open/close", "Claim · escalate · round-robin"],
      ["AI replies", "—", "Automatic first reply, labelled as AI"],
      ["White-label bot", "—", "Separate plan (White-label)"],
      ["Webhooks", "—", "20 integrations"],
      ["Transcript retention", "30 days", "Unlimited"],
      ["Server Season game", "5 level roles · 5 shop items · 1 companion · 1 quest", "100 roles · 50 items · every companion · 3 quests"],
      ["Price", "€0, forever", "€4.99/mo · billed through Discord"],
    ],
  },
  pricingHeading: "Simple. Per server.",
  pricingSub: "Pay only for what you need. Upgrade anytime.",
  priceNote: "All prices VAT-inclusive · per server / month · Monthly subscriptions sold and billed through the Discord store · Renews automatically until cancelled · 99.9% uptime target (not a contractual SLA)",
  tiers: {
    free: {
      name: "Free", price: "€0", per: "/ month, forever",
      tagline: "Get a real ticket + application flow live today. €0, forever.",
      bullets: ["1 ticket panel", "2 application forms (up to 5 questions)", "1 verification panel", "Unlimited polls & giveaways", "Server Season game: levels, shop, 1 companion slot", "Persistent transcripts (30-day retention)"],
      cta: "Get started free",
    },
    premium: {
      name: "Premium", badge: "Recommended", price: "€4.99", per: "/ month · via Discord",
      tagline: "For servers where support is a job, not a side task.",
      bullets: ["50 panels · 50 forms · 50 questions", "Math captcha + account-age gates", "Claim · escalate · round-robin", "Sticky + scheduled + recurring messages", "Advanced analytics", "AI auto-replies (labelled as AI)", "Webhooks (HMAC) + public REST API", "Unlimited transcript retention", "Full game: every companion, 3 quests, daily trivia"],
      cta: "Get Premium",
    },
    whitelabel: {
      name: "White-label", price: "€9.99", per: "/ month · via Discord",
      tagline: "Run Supreme under your own brand.",
      bullets: ["Everything in Premium", "White-label custom bot (your token)", "Runs under your name & avatar"],
      cta: "Get White-label",
    },
  },
  finalH: "Ready to consolidate?",
  finalSub: "Takes 60 seconds. Sign in with Discord, pick a server, go live on Free.",
  finalCta: "Get started free",
  footer: { terms: "Terms", privacy: "Privacy", cookies: "Cookies", accessibility: "Accessibility", status: "Status" },
  guides: {
    heading: "Guides", features: "Features", panel: "Panel & button setup", best: "Choosing a ticket bot",
    gdpr: "GDPR for Discord bots", vsTicketTool: "vs Ticket Tool", vsAppy: "vs Appy",
  },
};
