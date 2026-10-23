# Външни канали — готови текстове

Текстовете са на английски, готови за поставяне. Публикува ги собственикът, от собствения си акаунт,
**само когато може да отговаря поне 3 часа подред**. Винаги „аз съм разработчикът“. Без гласове по
поръчка, без молби към познати, без кросспост на един и същ текст. Линковете към магазина носят UTM от
`docs/METRICS.md` — не ги чисти. Числата в текстовете са сверени с репото на 23 октомври 2026; ако
пускаш по-късно, свери версията и броя правила (`server/index.html`).

## Hacker News — Show HN

Правилата: <https://news.ycombinator.com/showhn.html>. Пусни във вторник–четвъртък сутрин по
американско време. Не моли никого за глас (HN го наказва).

**Title** (74 знака):

```
Show HN: MV3 ad blocker with Ed25519-signed filter updates and no telemetry
```

**URL:** `https://adblock.carbonstealth.eu/` (чист адрес — HN не обича параметри в линка на поста).

**Първият коментар** (пусни го веднага след поста):

```
Hi HN, I'm the developer. Supreme AdBlock is a Manifest V3 ad blocker for Chrome, Edge and Brave,
made by a small company in Bulgaria. No account, no telemetry, MIT licensed.

The design goal: get a filter fix (a new ad network, YouTube renaming a field) to every user within
hours, without a store review, and without anything that could count as remote code.

How it works:

- Network blocking is declarativeNetRequest. EasyList, EasyPrivacy and the uBlock filters are
  compiled into static rulesets at build time (60,000+ rules). The browser does the matching; the
  extension never sees your requests.
- About twice a day it fetches one data file, filters.json, and its Ed25519 signature (WebCrypto;
  Chrome 137+ requires a valid one). The file holds domain names, CSS selectors and the names of
  YouTube response fields that carry ads. It is validated against a schema and never evaluated. A
  list of public keys is embedded, so the signing key can be rotated without a flag day.
- YouTube: a MAIN-world script, registered by the service worker, takes the ad entries
  (adPlacements, playerAds, adSlots) out of the player response text before the page parses it,
  instead of hooking JSON.parse globally. If YouTube refuses anyway, the extension steps aside on
  YouTube for six hours so the video plays.
- Scriptlets (##+js): a clean-room engine with 39 routines. The per-site directives are compiled
  into the package at build time; nothing from the network reaches the page's main world. (Until
  5.1.4 there was a live channel for them; it was removed to stay clearly inside the store policy.)
- Cookie banners: only consent-platform-specific Reject buttons are clicked everywhere. Generic
  text matching runs only inside a container that is about cookies, and never on sign-in, OAuth or
  payment pages.
- When you uninstall, the browser opens a static page with no parameters, and the site keeps no
  access logs.

What it can't do, compared with uBlock Origin on Manifest V2: no HTML filtering (##^), no response
rewriting ($replace), no CNAME uncloaking, no per-request webRequest decisions. Manifest V3 doesn't
allow them. If you want an extension that makes no network requests at all, uBlock Origin Lite is
the more conservative choice; this one trades that for the signed data channel.

Licensing: the extension's code is MIT. The bundled filter lists keep their own licences: mostly
GPLv3 and/or CC BY-SA (the EasyList family, the uBlock filters, AdGuard's regional lists), plus CC0,
CC BY 4.0, CC BY-SA 4.0, AGPL-3.0, MPL-2.0, Apache-2.0, MIT and Unlicense for some regional lists.
They ship as separate data files; THIRD_PARTY_NOTICES.txt gives the source, retrieval date and
SHA-256 of every entry and points to the full licence texts in the licenses/ folder. The scriptlet
code is written from scratch against uBO's documented syntax; the per-site directives taken from
the uBlock filters are GPLv3 data and are marked as such.

You can check the "no telemetry" part yourself: https://adblock.carbonstealth.eu/privacy#verify
Source: https://github.com/stefkostefko92-ux/Few-few/tree/main/adblock
Chrome Web Store: https://chromewebstore.google.com/detail/chbjbiabkgocfbbfhednpbhfeipjcclk?utm_source=hn&utm_medium=comment

I'd especially like to hear where it breaks a site.
```

**Очаквани въпроси — кратки отговори** (адаптирай, не поставяй наведнъж):

- *„Why not just use uBO Lite?“* — It's a good choice, and safer if you want zero requests. The
  difference here is the signed data channel (fixes within hours instead of with the next version),
  the repair page, Focus mode and the import from uBO/AdGuard/ABP. Not a claim that it blocks more.
- *„Remote data is remote code with extra steps.“* — The data can only name domains to block, CSS
  selectors to hide and JSON field names to drop; the code that interprets it is fixed in the package
  and the schema rejects anything else. A compromised server could at worst block, hide or drop
  things, not run code — and the signature check rejects files the key didn't sign.
- *„Who pays for this?“* — The company that makes it; optional donations. No acceptable-ads program,
  no ad is let through for a fee, no data is sold.
- *„Firefox?“* — The package builds for Firefox, but it isn't on AMO yet and some features differ
  there (`docs/AMO.md`). Don't promise a date.

## AlternativeTo

<https://alternativeto.net/> → Add an app (с акаунта на собственика). В полето за връзка с
продукта отбележи, че си разработчикът.

- **Name:** Supreme AdBlock
- **Tagline:** Manifest V3 ad blocker with signed filter updates, no account and no telemetry
- **Description:**

  ```
  Supreme AdBlock is a free, open-source (MIT) ad blocker for Chrome, Edge and Brave. It blocks
  video ads on YouTube at the source, banners, pop-ups and trackers with EasyList, EasyPrivacy and
  31 regional lists built in. Cookie banners are answered with Reject where the banner offers it.
  Filter data is updated about twice a day with an Ed25519 signature, without a new version of the
  extension. A repair page fixes a broken site in one click, and settings can be imported from
  uBlock Origin, AdGuard or Adblock Plus. No account, no analytics, no telemetry.
  ```

- **Platforms:** Chrome, Microsoft Edge, Brave (не Firefox, докато AMO не е публичен)
- **License:** Free, Open Source (MIT)
- **Tags:** ad-blocker, privacy, youtube-ad-blocker, tracker-blocker, cookie-banner-blocker, no-tracking
- **Alternative to:** uBlock Origin, uBlock Origin Lite, AdGuard AdBlocker, AdBlock, Adblock Plus
- **Website:** `https://adblock.carbonstealth.eu/`
- **Store link:** `https://chromewebstore.google.com/detail/chbjbiabkgocfbbfhednpbhfeipjcclk?utm_source=alternativeto&utm_medium=listing`
- **Screenshots:** `store/screenshots/screenshot-1.png` … `-5.png` (текущата версия)

## Slant

<https://www.slant.co/> → въпросите „What are the best ad blockers for Chrome?“ и „What are the best
privacy extensions?“ → Add an option. Slant иска плюсове и минуси — давай ги честно:

- **Pros:** signed filter-data updates twice a day · YouTube video ads removed from the player data ·
  Reject on cookie banners · no account or telemetry · import from uBO/AdGuard/ABP · 70 languages
- **Cons:** Manifest V3 limits (no HTML filtering, no CNAME uncloaking) · not on Firefox AMO yet ·
  a young project with few reviews
- **Link:** `https://chromewebstore.google.com/detail/chbjbiabkgocfbbfhednpbhfeipjcclk?utm_source=slant&utm_medium=listing`
- Отбележи, че си разработчикът, в първия коментар.
