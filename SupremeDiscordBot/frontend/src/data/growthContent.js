// frontend/src/data/growthContent.js
// Single source of truth for the public /compare and /guides content pages.
// Consumed by BOTH the live React pages (src/pages/Compare*.jsx, Guide*.jsx)
// and scripts/prerender.mjs (static AEO snapshot) — keeping one object means
// the crawlable snapshot and the live SPA can never drift, same pattern as
// data/commandsCatalog.js for /commands.
//
// ── Factual discipline (UCPD / Directive 2006/114/EC — comparative advertising) ──
// Every competitor claim below was verified live (WebFetch) on 2026-08-05
// against ticket-tool.app (/, /pricing, /features) and appy.bot (/, /premium).
// Cells we could not verify from the vendor's own site are marked
// "Not stated on their site" rather than guessed or implied absent-by-omission.
// Currency is quoted as published (USD for Ticket Tool, GBP for Appy, EUR for
// Supreme Bot) — never converted, never implied equivalent. Nothing here is
// disparaging; it is a factual, dated, sourced feature/price comparison, and
// our own numbers (Free/Premium/White-label/Agency) are the same figures the
// live dashboard and pricing page use (src/i18n/landing.js, scripts/prerender.mjs).

export const CHECKED_DATE = "August 2026";

// Supreme Bot's own tiers — mirrors src/i18n/landing.js `tiers` / prerender.mjs
// EN pricing block. Do not restate numbers by hand elsewhere; import this.
export const SUPREME_TIERS = {
  free: { name: "Free", price: "€0", per: "/ month, forever" },
  premium: { name: "Premium", price: "€9.99", per: "/ month", priceYearly: "€99", perYear: "/ year" },
  whitelabel: { name: "White-label", price: "€19.99", per: "/ month", priceYearly: "€199", perYear: "/ year" },
  agency5: { name: "Agency 5", price: "€39.99", per: "/ month", priceYearly: "€399", perYear: "/ year" },
  agency10: { name: "Agency 10", price: "€79.99", per: "/ month", priceYearly: "€799", perYear: "/ year" },
};

// ═══════════════════════════════════════════════════════════════════════════
// /compare/ticket-tool-alternative
// ═══════════════════════════════════════════════════════════════════════════
export const TICKET_TOOL_COMPARE = {
  path: "/compare/ticket-tool-alternative",
  title: "Supreme Bot vs Ticket Tool — Discord Ticket Bot Comparison (2026)",
  description: "A factual, sourced comparison of Supreme Bot and Ticket Tool: pricing, ticket limits, application forms, verification, AI replies, API, and EU hosting — checked August 2026.",
  competitor: "Ticket Tool",
  sourceUrls: ["https://ticket-tool.app/pricing", "https://ticket-tool.app/features"],
  answer: "Supreme Bot and Ticket Tool are both Discord ticket-management bots. The main differences: Supreme Bot bundles standalone application forms, member verification and giveaways into every tier at no extra cost, includes AI auto-replies from the Premium tier (€9.99/server/month), and is EU-hosted (Hetzner, Germany) with a GDPR data-processing agreement. Ticket Tool is priced per feature tier ($0 / $5 / $12 per server/month) with AI, API access and unlimited retention reserved for its $12 Pro tier, and does not state a hosting region or GDPR posture on its site.",
  rows: [
    ["Free tier price", "€0 / server / forever", "$0 / server / forever"],
    ["Entry paid tier", "€9.99 / server / month (Premium)", "$5 / server / month (Community)"],
    ["Top single-server tier", "€19.99 / server / month (White-label)", "$12 / server / month (Pro)"],
    ["Ticket panels (free)", "1", "3"],
    ["Ticket panels (paid)", "Up to 50 (Premium)", "Unlimited (Community+)"],
    ["Transcript retention (free)", "30 days", "30 days"],
    ["Transcript retention (paid)", "Unlimited (Premium)", "12 months (Community) · unlimited (Pro)"],
    ["Standalone application forms", "Yes, all tiers — up to 50 forms / 50 questions on Premium, approve/deny workflow", "Ticket intake fields (dropdowns/priority) only — no separate application/approval module found"],
    ["Member verification", "Button or math captcha + account-age gate, all tiers", "Not listed as a feature on their site"],
    ["Giveaways", "Unlimited, all tiers (role-gated, scheduled end, re-roll)", "Not listed as a feature on their site"],
    ["AI features", "AI-drafted first-response suggestions, Premium tier, human-in-the-loop, EU AI Act Art. 50 disclosure", "AI ticket assist (draft replies/summaries) + AI flow nodes, Pro tier only, 5M tokens/month included"],
    ["Public REST API", "Included from Premium (€9.99/mo)", "Included from Pro ($12/mo)"],
    ["Webhooks", "20 HMAC-signed integrations, Premium", "10 webhook nodes (Community) · unlimited (Pro)"],
    ["White-label custom bot", "€19.99 / server / month (own Discord token, own brand)", "Enterprise tier only — custom pricing"],
    ["Multi-server / agency plan", "Agency 5: €39.99/mo · Agency 10: €79.99/mo", "Team: $25/mo for 3 servers (+$8/extra server)"],
    ["EU hosting / GDPR", "Hetzner (Germany), GDPR-native, DPA available, self-service export/delete", "Not stated on their site"],
  ],
  faq: [
    { q: "Is Supreme Bot a Ticket Tool alternative?", a: "Yes. Supreme Bot covers the same core job — button-panel ticket creation, staff claim/escalation, and transcripts — and adds application forms, verification and giveaways in the same subscription, which Ticket Tool prices or scopes differently (see the table above)." },
    { q: "Which is cheaper?", a: "Ticket Tool's Free and Community ($5/server/month) tiers are cheaper entry points if you only need tickets. Supreme Bot's Premium (€9.99/server/month) includes application forms, verification, giveaways, AI replies and a REST API in the same price — features that on Ticket Tool require the $12/month Pro tier for AI and API access, and do not include standalone applications at any tier." },
    { q: "Does Ticket Tool offer application forms like Appy Bot?", a: "Ticket Tool's ticket panels support intake fields (text, dropdowns, priority) attached to a ticket, but we found no separate standalone application/approval workflow on their site as of August 2026 — that is a distinct product category (see our Appy Bot comparison)." },
    { q: "Is Supreme Bot GDPR-compliant?", a: "Supreme Bot is hosted on Hetzner servers in Germany, offers a Data Processing Agreement, and gives server owners self-service data export and deletion (GDPR Art. 15, 17, 20). Ticket Tool does not state a hosting region or GDPR posture on its public site." },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// /compare/appy-alternative
// ═══════════════════════════════════════════════════════════════════════════
export const APPY_COMPARE = {
  path: "/compare/appy-alternative",
  title: "Supreme Bot vs Appy Bot — Discord Application Bot Comparison (2026)",
  description: "A factual, sourced comparison of Supreme Bot and Appy Bot: pricing, application forms, tickets, verification, giveaways, and EU hosting — checked August 2026.",
  competitor: "Appy Bot",
  sourceUrls: ["https://appy.bot/", "https://appy.bot/premium"],
  answer: "Supreme Bot and Appy Bot both offer Discord application/questionnaire forms. Appy Bot is priced per server in GBP (Free / £4.99 Premium / £9.99 Custom Bot) and is application-forms-first, with ticket panels as a secondary feature. Supreme Bot is priced in EUR (Free / €9.99 Premium) and adds a full ticket system (claim, escalate, round-robin), AI auto-replies, a public REST API, HMAC webhooks and EU hosting (Hetzner, Germany) with a GDPR data-processing agreement at the same Premium price — none of which Appy Bot states on its site.",
  rows: [
    ["Free tier price", "€0 / server / forever", "£0 / server / forever"],
    ["Paid tier (single server)", "€9.99 / server / month (Premium)", "£4.99 / server / month (Premium x1)"],
    ["Application forms (free)", "2 forms, 5 questions each", "2 forms, 10 questions each"],
    ["Application forms (paid)", "50 forms, 50 questions each (Premium)", "50 forms, 100 questions each (Premium x1)"],
    ["Form logic branching", "Yes, Premium — conditional branching + regex validation", "Regex validation, Premium — no branching stated"],
    ["Ticket system", "Full: panels, claim, escalate, rename, round-robin, HTML transcripts", "Ticket panels + templates; no claim/escalate/round-robin stated"],
    ["Verification / anti-bot", "Button or math captcha + account-age gate, all tiers", "Website captcha (Free) · + in-Discord verification (Premium)"],
    ["Giveaways", "Unlimited, all tiers, role-gated + scheduled + re-roll", "Included, tier/limits not specified on their site"],
    ["AI auto-replies", "Premium tier, human-in-the-loop, EU AI Act Art. 50 disclosure", "Not stated on their site"],
    ["Public REST API / webhooks", "Public REST API + 20 HMAC webhooks, Premium", "Not stated on their site"],
    ["Custom-branded bot", "White-label tier, €19.99/mo — own Discord token, fully own brand", "Custom Bot tier, £9.99/mo — custom avatar, username & status (their bot)"],
    ["Multi-server discount", "Agency 5: €39.99/mo · Agency 10: €79.99/mo", "Premium x3: £8.99/mo for 3 servers (40% off)"],
    ["EU hosting / GDPR", "Hetzner (Germany), GDPR-native, DPA available, self-service export/delete", "Not stated on their site"],
  ],
  faq: [
    { q: "Is Supreme Bot an Appy Bot alternative?", a: "Yes. Supreme Bot matches Appy Bot's application-forms use case (multi-question forms, review workflow, auto-role on approval) and adds a full ticket system, verification, giveaways, AI replies and an EU-hosted, GDPR-documented backend in the same subscription." },
    { q: "Does Supreme Bot support conditional/branching forms?", a: "Yes — Premium-tier forms support conditional logic branching and regex validation on answers. Appy Bot's Premium tier lists regex validation but we found no mention of conditional branching on their site as of August 2026." },
    { q: "Can I white-label the bot under my own name?", a: "Both offer a branded option: Supreme Bot's White-label tier (€19.99/server/month) lets you upload your own Discord bot token and run it fully under your own brand; Appy Bot's Custom Bot tier (£9.99/month) lets you set a custom avatar, username and status on their bot. These are not the same thing — check which fits your use case." },
    { q: "Which has better verification against bots/raids?", a: "Supreme Bot includes a button or math captcha plus an account-age requirement on every tier, including Free. Appy Bot's website captcha is on Free; in-Discord verification is a Premium (£4.99/mo) feature." },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// /guides/best-discord-ticket-bot
// ═══════════════════════════════════════════════════════════════════════════
export const BEST_TICKET_BOT_GUIDE = {
  path: "/guides/best-discord-ticket-bot",
  title: "How to Choose the Best Discord Ticket Bot (2026 Guide)",
  description: "What to actually check before picking a Discord ticket bot — transcripts, forms, permissions, pricing, support, and GDPR — plus how Supreme Bot, Ticket Tool and Appy Bot compare on each.",
  answer: "The best Discord ticket bot for you depends on what you need beyond \"open a channel\": persistent transcripts that survive channel deletion, standalone application forms (not just ticket intake fields), granular staff permissions, predictable per-server pricing, and — if your community or business is in the EU — a stated hosting region and GDPR documentation. Compare candidates against those seven criteria rather than star ratings alone.",
  criteria: [
    {
      title: "1. Transcripts that survive channel deletion",
      body: "A ticket bot that only stores the transcript inside the (deletable) Discord channel loses the record the moment someone deletes it. Check retention length and whether transcripts are stored server-side.",
      supreme: "Supreme Bot generates a persistent HTML transcript on close, stored independently of the channel — 30-day retention on Free, unlimited on Premium.",
    },
    {
      title: "2. Standalone application forms, not just ticket fields",
      body: "\"Application forms\" and \"ticket intake fields\" are different features. A real application module needs multi-question forms, conditional logic, and a review/approve-deny workflow separate from support tickets.",
      supreme: "Supreme Bot ships both: a ticket system with intake, and a separate application-forms module (up to 50 forms, 50 questions, conditional branching on Premium) with its own approve/deny review dashboard.",
    },
    {
      title: "3. Staff permissions and workflow (claim, escalate, round-robin)",
      body: "As a team grows past a couple of moderators, \"anyone can reply to any ticket\" breaks down. Look for claim, escalation, category-based routing and round-robin assignment.",
      supreme: "Supreme Bot Premium includes claim, escalate, rename, and round-robin assignment across staff, so tickets do not pile up on one moderator.",
    },
    {
      title: "4. Verification / anti-bot protection",
      body: "Raid and bot protection (captcha, account-age gates) is a separate concern from tickets but often bundled into the same bot — check whether it's included or a separate purchase.",
      supreme: "Supreme Bot includes button or math-captcha verification with account-age requirements on every tier, including Free.",
    },
    {
      title: "5. Pricing model — per server, per feature, or per team",
      body: "Bots price themselves differently: flat per-server tiers, per-feature add-ons (AI, API access locked behind a higher tier), or per-team multi-server bundles. Model your actual server count and feature needs against the real price, not the headline number.",
      supreme: "Supreme Bot is a flat per-server tier (Free / €9.99 Premium / €19.99 White-label), plus Agency 5 (€39.99/mo) and Agency 10 (€79.99/mo) multi-server bundles for agencies managing several communities under one subscription.",
    },
    {
      title: "6. AI features — and whether they're disclosed",
      body: "Several ticket bots now offer AI-drafted replies or summaries. Check whether it's assistive (staff reviews before sending) or fully automated, and whether the vendor discloses AI use — the EU AI Act (Art. 50) requires disclosure when users interact with an AI system.",
      supreme: "Supreme Bot's AI auto-replies are assistive (staff reviews and sends), Premium-tier, and carry an explicit AI Act Art. 50 disclosure in the product.",
    },
    {
      title: "7. Data hosting region and GDPR documentation",
      body: "If your community, staff, or customers are in the EU, ask directly: where is the data hosted, is there a Data Processing Agreement (DPA), and can server owners self-service export or delete their data? Not every bot states this publicly — see our GDPR guide for the exact questions to ask.",
      supreme: "Supreme Bot is hosted on Hetzner servers in Germany, publishes a DPA, and gives server owners self-service data export (GDPR Art. 15/20) and deletion (Art. 17) from the dashboard.",
    },
  ],
  mentions: "Ticket Tool and Appy Bot are both established, capable bots worth evaluating against this checklist — see our sourced, dated comparisons: Supreme Bot vs Ticket Tool and Supreme Bot vs Appy Bot.",
};

// ═══════════════════════════════════════════════════════════════════════════
// /guides/gdpr-discord-bot  — zero-competition, educational, no competitor mentions.
// ═══════════════════════════════════════════════════════════════════════════
export const GDPR_GUIDE = {
  path: "/guides/gdpr-discord-bot",
  title: "GDPR & EU Hosting for Discord Communities — What to Check",
  description: "Why EU communities and businesses running Discord servers should care about data residency and GDPR when choosing a bot, what Supreme Bot does, and what to ask any vendor. Not legal advice.",
  answer: "If your Discord server processes personal data of EU residents — usernames, ticket contents, application answers, verification records — GDPR applies to whoever processes that data, including the bots you install. A bot vendor's hosting location, sub-processors, and data subject rights process are not incidental details; they determine whether you can meet your own GDPR obligations as the community/business running the server.",
  sections: [
    {
      title: "Why data residency matters for a Discord bot",
      body: "A Discord bot is a data processor: every ticket, application answer, or verification event it stores is personal data flowing through its infrastructure. If that infrastructure sits outside the EU/EEA without an adequate safeguard (Art. 44–49 GDPR — adequacy decision, Standard Contractual Clauses, etc.), you inherit a cross-border transfer risk you may not have chosen or reviewed.",
    },
    {
      title: "What Supreme Bot does",
      body: "Supreme Bot's infrastructure runs on Hetzner servers in Germany — EU-only data residency, no transfer outside the EU/EEA for the core service. Carbon Stealth VCC (the company behind Supreme Bot) publishes a Data Processing Agreement (DPA) under GDPR Art. 28 for server owners acting as controllers, lists its sub-processors (e.g. hosting, payment, email) in its Privacy Policy, and gives server owners self-service tools in the dashboard: data export (Art. 15 access, Art. 20 portability), account and data deletion (Art. 17 erasure), and consent withdrawal (Art. 7(3)) for AI-feature opt-ins.",
    },
    {
      title: "Article 28 — why the DPA matters, not just a privacy policy",
      body: "A public Privacy Policy tells end users what happens to their data. A Data Processing Agreement is the contract between you (as controller of your server's data) and the bot vendor (as processor) — required by GDPR Art. 28 whenever a processor handles personal data on your behalf. If a vendor cannot produce a DPA on request, you cannot demonstrate your own Art. 28 compliance as the party responsible for that server.",
    },
    {
      title: "Questions to ask any Discord bot vendor",
      body: "Where is the data physically hosted, and does it ever leave the EU/EEA? Can you provide a signed Data Processing Agreement (Art. 28)? Who are your sub-processors, and where are they located? What is your data retention period, and can it be configured? Can a server owner export or delete their server's data on request, and how long does that take? If you use AI features, is that disclosed to end users (EU AI Act Art. 50), and can they opt out?",
    },
  ],
  disclaimer: "This page explains what to look for and what Supreme Bot does — it is general information, not legal advice. For your specific GDPR obligations, consult a qualified data protection professional.",
};
