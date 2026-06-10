# 🛡️ The Best Ads Block

A fast, private Chrome extension (Manifest V3) that blocks **every kind of ad**
everywhere, **YouTube video ads** (pre-roll / mid-roll), banners, pop-ups,
native "recommended" ads, **Facebook & Instagram sponsored posts**, trackers,
cookie prompts and anti-adblock walls.

Free for everyone. No account, no telemetry, no data collection, everything
stays on your device.

## Features

- **Network-level blocking** (`declarativeNetRequest`), 237+ bundled rules
  covering hundreds of ad, tracker and pop-under networks. Requests are stopped
  before they load, so pages are lighter and faster.
- **YouTube video ads**, a MAIN-world script strips the ad payloads
  (`adPlacements`, `playerAds`, `adSlots`, `adConfig`) from the player API, so
  pre-roll and mid-roll ads never play. An auto-skip fallback handles anything
  that slips through.
- **Meta sponsored posts**, hides "Sponsored" posts in the Facebook and
  Instagram feeds (toggleable).
- **Cosmetic filtering**, hides ad containers that survive network blocking,
  including lazily injected ones (via `MutationObserver`).
- **Cookie / consent banners**, auto-dismisses them, preferring "Reject".
- **Anti-adblock bypass**, removes "disable your adblocker" walls and restores
  page scrolling.
- **Element picker**, click any element to hide it permanently on that site.
- **Per-site allowlist**, allow ads on sites you want to support.
- **Curated built-in filters**, a maintained rule set bundled with the
  extension; no remote code or network fetches.
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
rules/                  declarativeNetRequest rule sets
popup/                  Toolbar popup UI
options/                Settings page
icons/                  Extension icons
_locales/               Localised name & description
tools/                  Rule/icon generators and the packaging script
```

## How YouTube blocking works

YouTube serves ads from the **same servers** as the video, so domain blocking
can't be used (it would break playback). Three layers handle it:

1. **Response sanitising** (`youtube_main.js`, MAIN world) clears the ad fields
   from `/youtubei/v1/player` and `/next`, so the player never sees an ad.
2. **Endpoint blocking** (`rules/youtube_rules.json`) drops `/pagead/`,
   `/ptracking`, `/api/stats/ads` etc., without touching `/player`.
3. **Auto-skip** (`youtube_skip.js`) fast-forwards or skips anything that still
   starts.

## Building the store package

```
bash tools/package.sh     # writes dist/the-best-ads-block-<version>.zip
python3 tools/generate_rules.py   # regenerate rules/
python3 tools/generate_icons.py   # regenerate icons/
```

## Notes

- The live blocked counter uses `getMatchedRules` (works in published builds)
  and the precise `onRuleMatchedDebug` path when running unpacked.
- "Data saved" counts the exact number of blocked requests per resource type
  and multiplies by realistic per-type sizes, a blocked request is never
  downloaded, so its true byte size can't be measured (uBlock/AdGuard estimate
  the same way).
- All blocking rules ship inside the extension as static `declarativeNetRequest`
  rulesets, there are no remote fetches and no remotely hosted code.

## Privacy & license

No data ever leaves your device, see [PRIVACY.md](PRIVACY.md). Released under
the [MIT License](LICENSE).

Made by [Carbon Stealth](https://carbonstealth.eu). Donations (optional):
<https://revolut.me/vycanismajoris>.
