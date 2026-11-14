# 🛡️ Supreme AdBlock

A private ad blocker for Chrome, Edge and Brave (Manifest V3): **YouTube video ads**
(pre-roll / mid-roll), banners, pop-ups, native "recommended" ads, **Facebook,
Instagram & Threads sponsored posts**, trackers, cookie prompts and anti-adblock walls.

Free for everyone. No account, no telemetry, no data collection, everything
stays on your device.

**Install:** [Chrome Web Store](https://chromewebstore.google.com/detail/chbjbiabkgocfbbfhednpbhfeipjcclk?utm_source=github&utm_medium=readme)
(Chrome, Edge, Brave) · site and support: <https://adblock.carbonstealth.eu>

## Features

- **Network-level blocking** (`declarativeNetRequest`) with **EasyList and
  EasyPrivacy built in**, plus the uBlock Origin filters and 31 regional lists
  (60,000+ compiled rules) and a curated in-house set. Requests are stopped
  before they load, so pages are lighter.
- **YouTube video ads**, removed at the source: a MAIN-world script
  (registered by the service worker) takes the ad entries (`adPlacements`,
  `playerAds`, `adSlots`) out of the player response as text, before the page
  parses it, and the feed/search responses lose their ad renderers. No request
  flags by default (one on a watch page is a signal YouTube reads). A fallback
  mutes and presses YouTube's own Skip for anything that slips through; if
  YouTube refuses anyway, the extension steps aside there for six hours.
- **Meta sponsored posts**, hides "Sponsored" posts in the Facebook, Instagram
  and Threads feeds (toggleable), from the label a screen reader announces: in
  ~70 languages, through `aria-labelledby`, SVG `<use>` and shuffled letters.
- **Global Privacy Control**, sends `Sec-GPC: 1` and sets
  `navigator.globalPrivacyControl` on every site (on by default, not on allowed
  sites).
- **Cosmetic filtering**, EasyList's cosmetic rules ship in the package
  (generic ones as native CSS, domain-specific ones applied per site) on top of
  the built-in selectors, including lazily injected ads (via
  `MutationObserver`).
- **Procedural selectors** (uBlock-style): `:has-text()`, `:matches-css()`,
  `:upward()`, `:xpath()`, `:min-text-length()` and the `:remove()` action work
  in "My filters" and in the live filter update.
- **Tracking-parameter removal**, strips `utm_*`, `fbclid`, `gclid` and other
  click identifiers from the links you open (toggleable).
- **Malware protection** (on by default), a known malware site (URLhaus by
  abuse.ch) opens a warning page instead (`blocked/blocked.html`: “Go back” or
  “Continue anyway”, checked in the service worker), and what pages load from
  such sites is blocked.
- **Cookie / consent banners**, auto-dismisses them, preferring "Reject".
- **Anti-adblock bypass**, removes "disable your adblocker" walls and restores
  page scrolling.
- **Element picker**, click any element to hide it permanently on that site;
  the popup's ↶ N takes the last one back at once, no reload.
- **Connections on this page**, the popup lists the other sites a page loaded
  something from (Resource Timing, read when you open the box) and blocks one on
  that site only (a dynamic rule with `initiatorDomains`, priority 5000).
- **Import from another ad blocker**, the allowed sites and own filters of a
  uBlock Origin, AdGuard or Adblock Plus backup (`lib/foreign.js`, checked
  again in the service worker; a rule it cannot apply is left out, never
  widened).
- **Keyboard shortcuts**, Alt+Shift+U (blocking on this site), Alt+Shift+Q
  (pause), the picker unassigned; change them at `chrome://extensions/shortcuts`.
- **Per-site allowlist**, allow ads on sites you want to support.
- **Curated built-in filters**, EasyList + EasyPrivacy + in-house rules
  bundled with the extension, plus a **signed** (Ed25519), data-only filter
  update about twice a day (on by default, can be switched off). No remote
  code, ever.
- **Live stats**, ads blocked, data saved and time saved.
- **Carbon Stealth theme**, matte carbon dark theme with a light option.

## Install (developer mode)

1. Open `chrome://extensions/`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.

## Project layout

```
manifest.json            Manifest V3 config
background.js            Service worker, rules, allowlist, filters, stats
theme.js                Applies the Carbon Stealth / light theme
content.js / .css       Cosmetic ad hiding (all sites)
meta.js                 Facebook / Instagram sponsored-post hiding
cookies.js / .css       Cookie / consent banner dismissal
antiadblock.js / .css   Anti-adblock bypass
picker.js / .css        Element picker
youtube_main.js         MAIN-world: removes ads from the YouTube player API
youtube_skip.js         Auto-skip / fast-forward video ads
youtube.css             Hides YouTube's in-page ad surfaces
rules/                  declarativeNetRequest rule sets + bundled cosmetic data
cosmetic_generic.css    EasyList generic cosmetic rules (gated, native CSS)
popup/                  Toolbar popup UI
options/                Settings page
icons/                  Extension icons
_locales/               Localised name & description
tools/                  Rule/icon generators and the packaging script
```

## How YouTube blocking works

YouTube serves ads from the **same servers** as the video, so domain blocking
can't be used (it would break playback). The layers:

1. **Response sanitising** (`youtube_main.js`, MAIN world, registered by the
   service worker): the ad fields (`adPlacements`, `adSlots`, `playerAds`) are
   taken out of the player response **as text, before the page parses it**, and
   ad renderers are pruned from `/browse`, `/search` and `/next`, so neither the
   player nor the feed ever sees an ad. Every wrapped function stringifies like
   the native one.
2. **No request flags by default.** `isInlinePlaybackNoAd` on a watch page is a
   server-side signal; the signed `filters.json` can turn flags on, with a plain
   retry if YouTube answers "unplayable".
3. **Endpoint blocking** (`rules/youtube_rules.json`) drops `/pagead/`,
   `/api/stats/ads`, mid-roll and ad-break requests. The video stream
   (`googlevideo.com`) and the playback pings (`/ptracking`, `/api/stats/atr`) are
   never blocked: a player that stops reporting is what YouTube looks for.
4. **Fallback** (`youtube_skip.js`): mutes and presses YouTube's own Skip for
   anything that still starts (never speeds the video up). If YouTube refuses ad
   blockers anyway, the extension steps aside on YouTube for six hours.

The ad field names, renderers, request flags and an emergency kill-switch are
data in the signed `filters.json`, so YouTube-side changes are fixed the same day
without a store review. No code comes from the network.

## Building the store package

```
bash tools/package.sh     # writes dist/supreme-adblock-<version>.zip
node tools/build_filters.mjs      # refresh EasyList/EasyPrivacy/URLhaus rules
python3 tools/generate_rules.py   # regenerate rules/ad_rules.json
python3 tools/generate_icons.py   # regenerate icons/ + store art from store/brand/
```

## Notes

- The live blocked counter uses `getMatchedRules` (works in published builds)
  and the precise `onRuleMatchedDebug` path when running unpacked.
- "Data saved" counts the exact number of blocked requests per resource type
  and multiplies by realistic per-type sizes, a blocked request is never
  downloaded, so its true byte size can't be measured (uBlock/AdGuard estimate
  the same way).
- Blocking rules ship inside the extension. Additionally, a small `filters.json`
  is fetched about twice a day (data only: block domains, CSS selectors, YouTube
  field names) and must carry a valid Ed25519 signature (Chrome 137+), so the
  extension keeps working as sites change without a Web Store re-review. No code is ever fetched or executed
  remotely. See `server/README.md`.
- Bundled third-party filter lists: EasyList & EasyPrivacy (GPLv3 / CC BY-SA
  3.0) and the URLhaus malware list by abuse.ch (CC0). See
  [docs/LICENSES.md](docs/LICENSES.md).

## Privacy & license

Your browsing data never leaves your device; there is no account, analytics or
telemetry. The only automatic network request is the data-only filter update,
about twice a day (see [PRIVACY.md](PRIVACY.md)). Released under the
[MIT License](LICENSE).

Made by [Carbon Stealth](https://carbonstealth.eu). Donations (optional):
<https://revolut.me/vycanismajoris>.
