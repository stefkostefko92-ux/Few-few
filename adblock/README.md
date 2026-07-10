# 🛡️ Supreme AdBlock

A fast, private Chrome extension (Manifest V3) that blocks **every kind of ad**
everywhere, **YouTube video ads** (pre-roll / mid-roll), banners, pop-ups,
native "recommended" ads, **Facebook & Instagram sponsored posts**, trackers,
cookie prompts and anti-adblock walls.

Free for everyone. No account, no telemetry, no data collection, everything
stays on your device.

## Features

- **Network-level blocking** (`declarativeNetRequest`) with **EasyList and
  EasyPrivacy built in** (~12,600 compiled rules covering tens of thousands of
  source filters via merged domain rules) plus a curated in-house set. Requests
  are stopped before they load, so pages are lighter and faster.
- **YouTube video ads**, three MAIN-world lines of defence: the player
  request carries ad-suppressing flags (`isInlinePlaybackNoAd`, which also
  avoids YouTube's "fake buffering" delay), the player response loses its ad
  payloads (`adPlacements`, `playerAds`, `adSlots`, `adConfig`) and the
  feed/search responses lose their ad renderers, so promoted results never
  render. An auto-skip fallback handles anything that slips through.
- **Meta sponsored posts**, hides "Sponsored" posts in the Facebook and
  Instagram feeds (toggleable).
- **Cosmetic filtering**, EasyList's cosmetic rules ship in the package
  (generic ones as native CSS, domain-specific ones applied per site) on top of
  the built-in selectors, including lazily injected ads (via
  `MutationObserver`).
- **Procedural selectors** (uBlock-style): `:has-text()`, `:matches-css()`,
  `:upward()`, `:xpath()`, `:min-text-length()` and the `:remove()` action work
  in "My filters" and in the live filter update.
- **Tracking-parameter removal**, strips `utm_*`, `fbclid`, `gclid` and other
  click identifiers from the links you open (toggleable).
- **Malware protection**, optionally blocks known malware domains (URLhaus by
  abuse.ch).
- **Cookie / consent banners**, auto-dismisses them, preferring "Reject".
- **Anti-adblock bypass**, removes "disable your adblocker" walls and restores
  page scrolling.
- **Element picker**, click any element to hide it permanently on that site.
- **Per-site allowlist**, allow ads on sites you want to support.
- **Curated built-in filters**, EasyList + EasyPrivacy + in-house rules
  bundled with the extension, plus an optional daily **signed** (Ed25519)
  data-only filter update. No remote code, ever.
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
can't be used (it would break playback). Three layers handle it:

1. **Request flags** (`youtube_main.js`, MAIN world): the `/youtubei/v1/player`
   request body gets `isInlinePlaybackNoAd: true`, so YouTube skips ad delivery
   at the source, together with the server-side "fake buffering" backoff it
   applies when ads are blocked client-side.
2. **Response sanitising** (same script) clears the ad fields from the player
   response and prunes ad renderers from `/browse`, `/search` and `/next`, so
   neither the player nor the feed ever sees an ad.
3. **Endpoint blocking** (`rules/youtube_rules.json`) drops `/pagead/`,
   `/ptracking`, `/api/stats/ads` etc., without breaking the video stream.
4. **Auto-skip** (`youtube_skip.js`) fast-forwards or skips anything that still
   starts.

Every list above is remotely tunable through the signed data-only
`filters.json` (extra ad fields, renderers, request flags, an emergency
kill-switch), so YouTube-side changes are fixed server-side the same day, no
re-review needed.

## Building the store package

```
bash tools/package.sh     # writes dist/supreme-adblock-<version>.zip
node tools/build_filters.mjs      # refresh EasyList/EasyPrivacy/URLhaus rules
python3 tools/generate_rules.py   # regenerate rules/ad_rules.json
python3 tools/generate_icons.py   # regenerate icons/
```

## Notes

- The live blocked counter uses `getMatchedRules` (works in published builds)
  and the precise `onRuleMatchedDebug` path when running unpacked.
- "Data saved" counts the exact number of blocked requests per resource type
  and multiplies by realistic per-type sizes, a blocked request is never
  downloaded, so its true byte size can't be measured (uBlock/AdGuard estimate
  the same way).
- Blocking rules ship inside the extension. Additionally, a small `filters.json`
  is fetched daily (data only: block domains + CSS selectors), verified against
  an Ed25519 signature when configured, so the extension keeps working as sites
  change without a Web Store re-review. No code is ever fetched or executed
  remotely. See `server/README.md`.
- Bundled third-party filter lists: EasyList & EasyPrivacy (GPLv3 / CC BY-SA
  3.0) and the URLhaus malware list by abuse.ch (CC0). See
  [docs/LICENSES.md](docs/LICENSES.md).

## Privacy & license

We collect nothing about you; no browsing data ever leaves your device. The
only network request is the daily data-only filter update (see
[PRIVACY.md](PRIVACY.md)). Released under the [MIT License](LICENSE).

Made by [Carbon Stealth](https://carbonstealth.eu). Donations (optional):
<https://revolut.me/vycanismajoris>.
