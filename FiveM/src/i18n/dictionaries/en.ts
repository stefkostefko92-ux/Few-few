import type { Dictionary } from './bg';

/**
 * Пълен превод, не частичен: типът идва от българския файл, затова липсващ
 * ключ пада `npm run typecheck`. Правните формулировки са преведени по СМИСЪЛ
 * с оставени европейски препратки (GDPR/DSA са едни и същи актове на двата
 * езика) — не са машинен превод и минават през агента Преводач.
 */
export const en: Dictionary = {
  meta: {
    siteName: 'FiveM BG',
    tagline: 'The directory of Bulgarian FiveM RP servers',
  },
  nav: {
    servers: 'Servers',
    rules: 'Rules',
    tutorials: 'Tutorials',
    news: 'News',
    submit: 'Add a server',
    discord: 'Discord',
    faq: 'FAQ',
    team: 'Team',
    contact: 'Contact',
    support: 'Support us',
    skipToContent: 'Skip to content',
    main: 'Main navigation',
    language: 'Language',
  },
  footer: {
    product: 'a product by',
    impresum: 'Legal notice',
    privacy: 'Privacy',
    terms: 'Terms',
    report: 'Report',
    discord: 'Community Discord',
    disclaimer:
      'An independent project. Not affiliated with Rockstar Games, Take-Two Interactive Software, Inc. or Cfx.re. GTA V, Grand Theft Auto and Rockstar Games are trademarks of Take-Two Interactive Software, Inc.; FiveM and Cfx.re are trademarks of their respective owners. They are used here solely to identify the platform this content refers to.',
  },
  home: {
    title: 'Bulgarian FiveM RP servers — live list with status and players',
    description:
      'Every Bulgarian FiveM RP server in one place: online status, player count, framework (ESX, QBCore, Qbox), whitelist, Discord and rules. Updated automatically.',
    h1: 'Bulgarian FiveM RP servers — all in one place',
    intro:
      'A live list of every server’s status: whether it is online, how many people are playing, which framework it runs and whether it is whitelisted. The data is read straight from the servers themselves.',
    statsOnline: 'online out of',
    statsPlayers: 'players right now',
    filters: 'Filters',
    serverList: 'Server list',
    emptyLead: 'The list is still filling up.',
    emptyCta: 'Add your server',
    emptyTail: '— submissions are reviewed by hand.',
    faqHeading: 'Frequently asked questions',
    discordCta: 'Ask in the community Discord',
    discordLead: 'Looking for the right server, or have a question?',
  },
  server: {
    breadcrumb: 'Servers',
    status: 'Status',
    framework: 'Framework',
    access: 'Access',
    rating: 'Rating',
    whitelisted: 'whitelisted (approval required)',
    open: 'open entry',
    noReviews: 'no reviews yet',
    ratingOf: 'from',
    reviewsWord: 'reviews',
    ratingDisclaimer:
      'Ratings are visitors’ opinions. We do not verify whether the author actually played on the server; we publish after a manual review and remove the obviously fake ones. We do not accept payment for a rating.',
    hiddenNotice:
      'The owner has hidden the server’s public status (sv_requestParanoia). This does not mean the server is offline — we simply cannot read the player count.',
    join: 'Join the server',
    discord: 'Discord',
    website: 'Website',
    about: 'About the server',
    reportContent: '⚑ Report this content',
    reportShort: '⚑ Report',
    reviews: 'Reviews',
    reviewsEmpty: 'No approved reviews for this server yet.',
    reviewsShownOf: 'Showing the latest',
    reviewsOfTotal: 'of',
    reviewOk: 'Thank you. The review goes into the review queue and is published once approved.',
    leaveReview: 'Leave a review',
    ratingLabel: 'Rating (1–5)',
    aliasLabel: 'Nickname (optional)',
    bodyLabel: 'Your opinion',
    reviewHelp:
      'We do not ask for and do not store a name, email or IP address. Do not post other people’s personal data. Reviews are checked by hand before publishing — see the',
    reviewHelpTerms: 'Terms',
    reviewSubmit: 'Submit review',
    anonymous: 'anonymous',
    promoted: 'promoted (paid)',
    promotedShort: 'promoted',
    discovered: 'found automatically',
    discoveredNote:
      'This server was found in the public Cfx.re list rather than submitted by its owner. If you represent the server and want to edit or remove the listing, write to us.',
    lastChecked: 'Last checked',
  },
  frameworks: {
    ESX: 'ESX',
    QBCORE: 'QBCore',
    QBOX: 'Qbox',
    OX_CORE: 'ox_core',
    STANDALONE: 'Custom framework',
    UNKNOWN: 'Unknown',
  },
  status: {
    online: 'players',
    offline: 'offline',
    hidden: 'status hidden',
    unreachable: 'no response',
  },
  filters: {
    whitelist: 'Whitelist',
    all: 'All',
  },
  rules: {
    title: 'Rules',
    description:
      'The rules of the FiveM platform, of GTA V, and the core roleplay rules that apply on every Bulgarian RP server.',
    h1: 'Rules',
    intro:
      'Three layers of rules stack on every Bulgarian RP server: the Cfx.re platform rules, Rockstar’s terms for the game itself, and the server’s own roleplay rules. All three are here.',
    onThisPage: 'On this page',
    sourceLabel: 'Source',
    communityPractice: 'Community practice, not an official rule',
  },
  tutorials: {
    title: 'Tutorials',
    description:
      'How to install FiveM, how to join a Bulgarian server and what to do in your first 15 minutes of roleplay.',
    h1: 'Tutorials',
    intro: 'From zero to your first character — step by step, no filler.',
    step: 'Step',
  },
  news: {
    title: 'FiveM news and tutorials',
    description:
      'News from the FiveM world and tutorials: how to install the client, how to join a server, what ESX and QBCore are.',
    h1: 'News',
    empty: 'No articles published yet.',
    notFound: 'Article not found',
  },
  submit: {
    title: 'Add your FiveM server',
    description:
      'Submit your Bulgarian FiveM RP server for listing in the directory. Submissions go through manual moderation — free of charge.',
    h1: 'Add your server',
    intro:
      'The basic listing is free. Your submission enters a queue and is published after a manual check — that is what keeps the list clear of dead and fake servers. Separately we offer paid promotion, which only raises the position in the ordering and is marked with a badge — the terms and the ranking parameters are in the',
    introTerms: 'Terms',
    ok: 'We received your submission. We will write to the email you provided once it has been reviewed.',
    nameLabel: 'Server name',
    cfxLabel: 'cfx.re code',
    cfxHelp: 'Or an address below — at least one of the two is required.',
    addressLabel: 'Address (host:port)',
    discordLabel: 'Discord invite',
    emailLabel: 'Contact email',
    emailHelp:
      'We use it only to reply about this submission (Art. 13 GDPR). It is not published and does not go on a mailing list.',
    noteLabel: 'Short description',
    honeypot: 'Do not fill in this field',
    consent1:
      'By submitting you confirm that you are entitled to represent this server and that the texts and links you provided are yours or you have permission to use them (see the',
    consent2: '). How we handle your email — see the',
    consent3:
      '. This is not consent within the meaning of the GDPR: the legal basis is Art. 6(1)(b) and (f).',
    submitButton: 'Submit',
  },
  report: {
    title: 'Report illegal content',
    description:
      'Report illegal content in the directory under Art. 16 of Regulation (EU) 2022/2065 (Digital Services Act).',
    h1: 'Report illegal content',
    intro:
      'This form is the notice mechanism under Art. 16 of Regulation (EU) 2022/2065. We review every report in a timely, non-arbitrary manner, send a confirmation of receipt, and notify you of the decision together with information about the available redress.',
    ok: 'We received your report. A confirmation has been sent to the email you provided and we will write once a decision is made.',
    urlLabel: 'Exact address of the content',
    urlHelp: 'Copy the address from your browser’s address bar — Art. 16(2)(b).',
    reasonLabel: 'Why you consider the content illegal',
    reasonHelp: 'A sufficiently substantiated and detailed explanation — Art. 16(2)(a).',
    nameLabel: 'Name',
    emailLabel: 'Email',
    emailHelp:
      'We use it only for the confirmation and the decision on this report. Legal basis: Art. 6(1)(c) GDPR (legal obligation under the DSA). Details are in the',
    emailHelpLink: 'privacy policy',
    goodFaith:
      'I declare in good faith that the information and allegations in this report are accurate and complete — Art. 16(2)(d).',
    submitButton: 'Send report',
    mailFallback: 'If you prefer email:',
    mailTail: 'Reports with a full explanation and an exact address are handled fastest.',
  },
  notFound: {
    h1: 'This page does not exist',
    body: 'The server may have been removed from the directory, or the address is wrong.',
    toList: 'To the server list',
    submit: 'Add a server',
  },
  errors: {
    invalid: 'Check what you entered — something is off.',
    required_name: 'The server name is required (at least 2 characters).',
    required_email: 'A valid contact email is required.',
    required_target: 'A cfx.re code or a host:port address is required.',
    invalid_cfx: 'Invalid cfx.re code.',
    invalid_address: 'Invalid address. Format: host:port (for example 1.2.3.4:30120).',
    invalid_url: 'The link must be a full address starting with https://',
    invalid_rating: 'The rating is a number from 1 to 5.',
    required_reason: 'Describe why you consider the content illegal (at least 20 characters).',
    required_goodfaith: 'The good-faith declaration is required.',
    rate_limit: 'Too many submissions right now. Try again in a minute.',
    storage: 'We could not save your submission. Please try again later.',
  },
  common: {
    breadcrumbLabel: 'Breadcrumb',
  },
};
