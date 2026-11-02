// frontend/src/data/landingFaqEn.js
// ЕДИНСТВЕНИЯТ източник на въпросите и отговорите в секция FAQ на английската
// начална страница („/“). Четат го ТРИМА: Login.jsx (видимата секция),
// scripts/prerender.mjs (снимката за обхождачи без JavaScript) и FAQPage
// JSON-LD блокът, който prerender вписва само на „/“.
//
// ЗАЩО (SEO одит, 22.10.2026): FAQPage в index.html носеше ДРУГИ осем въпроса
// („What is Supreme Bot?“, „Is Supreme Bot secure?“…), а Login.jsx показваше
// девет различни. Google рендерира JavaScript, тоест вижда React секцията —
// структурирани данни, които не съвпадат с видимото съдържание, нарушават
// правилата на Google за структурирани данни. Освен това блокът седеше в
// шаблона и така влизаше в ВСЯКА страница (/terms, /bg, /features/…), където
// тези въпроси изобщо не се виждат. Едно определение, три читателя.
//
// Цените тук са същите като в ценоразписа (src/data/growthContent.js
// SUPREME_TIERS, backend/src/lib/premium.js) — гейтът marketingTruth.test.js
// чете и този файл.

export const EN_LANDING_FAQ = [
  {
    q: "How do I pay for Premium?",
    a: "Through Discord only. Open the Discord store for Supreme Bot, pick Premium or White-label for your server and complete Discord's checkout. Discord is the seller of record: it shows the final price with VAT, charges you and sends the receipt — we never see your card. Subscriptions are monthly; cancel anytime from Discord's User Settings → Subscriptions and keep access until the end of the paid period.",
  },
  {
    q: "How is pricing calculated?",
    a: "Premium is billed per server — €4.99/server/month — not per seat, per agent or per ticket. Every server also has the Free tier forever at €0. Put a server on Premium when it needs it, drop it back to Free when it doesn't; you only ever pay for the servers you actively upgrade.",
  },
  {
    q: "Where is my data stored?",
    a: "All data is stored in the EU (Germany, Hetzner); Carbon Stealth VCC operates from Bulgaria. Some sub-processors — Discord, Google (optional, for AI replies) and Sentry — are located in the US; those transfers are governed by Standard Contractual Clauses (see Privacy Policy §5-6). Custom bot tokens and Discord OAuth tokens are encrypted at rest with AES-256-GCM. We never sell or share your data.",
  },
  {
    q: "Can I use my own Discord bot?",
    a: "Yes — on the White-label tier (€9.99 per server per month, bought in the Discord store) you connect your own Discord bot application (its bot token from the Discord Developer Portal) and it runs under your brand: your bot's name, avatar and server presence. The token is encrypted at rest with AES-256-GCM.",
  },
  {
    q: "What happens if I cancel — can I take my data?",
    a: "No lock-in. Cancel anytime in Discord (User Settings → Subscriptions) — access continues until the end of the period you paid for, then the server reverts to the Free tier. Panels, forms, applications and settings are kept; transcripts of tickets closed more than 30 days ago are deleted on the Free tier. Export what you need to CSV or PDF before the period ends.",
  },
  {
    q: "Do you support multiple servers?",
    a: "Yes — connect unlimited Discord servers from one Supreme Bot account. Each server has independent settings, panels, forms, and billing.",
  },
  {
    q: "Is there an API?",
    a: "Yes — a public REST API is available on Premium at /public/v1 with bearer token authentication and scoped permissions. Rate limit is 300 req/min per key.",
  },
  {
    q: "Does the leveling game read our messages?",
    a: "No. XP is counted per message event with a cooldown — the text is never read or stored for the game. The only exception is the counting channel an admin designates, where the bot checks whether a message is the next number and stores nothing else. The game is off by default, has no gambling, and sparks can't be bought; members can delete their game data with /privacy delete.",
  },
  {
    q: "How do I get support?",
    a: "Join our Discord server — direct support from the team that built Supreme Bot (not outsourced). Response times are best-effort; no contractual SLA is included.",
  },
];
