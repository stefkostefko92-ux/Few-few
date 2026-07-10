# Chrome Web Store — complete submission pack

Everything needed to publish **Supreme AdBlock** is in this repo and this
file. Follow it top to bottom; nothing else to figure out.

## 0. One-time prerequisites

- A Chrome Web Store **developer account** (one-time $5 fee):
  <https://chrome.google.com/webstore/devconsole>
- The privacy-policy + filter subdomain live (see `../server/README.md`):
  - `https://adblock.carbonstealth.eu/privacy`  ← Privacy Policy URL
  - `https://adblock.carbonstealth.eu/filters.json` ← filter updates

## 1. The upload package

```bash
bash tools/package.sh      # → dist/supreme-adblock-3.9.0.zip
```

Runtime files only (manifest, scripts, styles, rules, icons, locales). Docs,
tools, store art, server files are excluded, and the script verifies every
manifest-referenced file is present.

## 2. Graphic assets (all in `store/`)

| Asset | Size | File | Required |
|-------|------|------|----------|
| Store icon | 128×128 | `store/store_icon_128.png` | ✅ |
| Screenshots (5) | 1280×800 | `store/screenshots/screenshot-1..5.png` | ✅ (min 1) |
| Small promo tile | 440×280 | `store/promo_small_440x280.png` | optional |
| Marquee | 1400×560 | `store/marquee_1400x560.png` | optional (featuring) |

Regenerate: `python3 tools/generate_icons.py` (icon + tiles),
`python3 store/screenshots/build.py` then re-render (see that script's header).

## 3. Listing fields (paste as-is)

- **Name:** `Supreme AdBlock`
- **Summary (132 max):**
  `Block ads everywhere, YouTube video ads, banners, pop-ups, trackers and cookie prompts. Free, fast and private.`
- **Category:** Productivity
- **Language:** English
- **Detailed description:** use the block in `docs/STORE_LISTING.md`.

## 4. Privacy tab (exact answers)

- **Single purpose:**
  `Block advertisements and trackers on the pages you visit.`
- **Privacy Policy URL:** `https://adblock.carbonstealth.eu/privacy`
- **Data collection:** select **does NOT collect** for every category
  (no personally identifiable info, no health, no financial, no location, no
  web history, no user activity, no personal communications).
- **Disclosures — tick all three:**
  - I do not sell or transfer user data to third parties (outside approved use)
  - I do not use or transfer user data for purposes unrelated to the item's
    single purpose
  - I do not use or transfer user data to determine creditworthiness / lending

> Note on the network request: the extension fetches a public `filters.json`
> (block rules + CSS selectors) daily. It sends **no user data** and executes
> **no remote code** — this is filter data, the same model uBlock/AdGuard use.
> It does not count as data collection.

## 5. Permission justifications (paste each)

- **declarativeNetRequest** — block ad/tracker network requests using bundled
  filter rules.
- **declarativeNetRequestFeedback** — count blocked requests per tab for the
  toolbar badge.
- **storage** — save the user's settings and counters locally.
- **tabs** — show the current site and per-tab blocked count in the popup.
- **alarms** — schedule the daily filter-list update and the temporary-pause
  timer.
- **contextMenus** — the right-click "Block an element here" entry.
- **host permissions `<all_urls>`** — a universal ad blocker must filter and
  cosmetically clean ads on every site the user visits; all processing is local.

## 6. Dashboard steps

1. **New item** → upload `dist/supreme-adblock-3.9.0.zip`.
2. Fill the listing (§3), upload the icon + 5 screenshots + promo tiles (§2).
3. Complete the **Privacy practices** tab (§4) and paste permission
   justifications (§5).
4. Set visibility (Public or Unlisted) → **Submit for review**.

## 7. Pre-flight checklist

- [ ] `manifest.json` and `package.json` versions match (3.9.0)
- [ ] Zip loads via `chrome://extensions → Load unpacked` with **no** console errors
- [ ] Popup, settings, allowlist, picker, theme, pause, sync all work
- [ ] A normal site loads correctly; ads are blocked
- [ ] `https://adblock.carbonstealth.eu/privacy` and `/filters.json` return 200
- [ ] "Update now" in settings succeeds (or fails gracefully if not yet hosted)

Review usually takes a few days. To ship an update: bump the version in
`manifest.json` + `package.json`, rebuild, upload. Day-to-day fixes (new ad
networks, YouTube DOM changes) go into `filters.json` — no re-review needed.
