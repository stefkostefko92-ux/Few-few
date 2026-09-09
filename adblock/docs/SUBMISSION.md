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
bash tools/package.sh      # → dist/supreme-adblock-5.0.0.zip
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
`python3 store/screenshots/build.py` (renders the real popup with demo numbers
via headless Chromium; see that script's header).

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

> Note on network requests: the extension fetches a public `filters.json`
> (block rules, CSS selectors and allowlisted scriptlet directives) about twice
> a day. It sends **no user data** and executes **no remote code** — this is
> filter data, the same model established ad blockers use. The only other
> request is a user-initiated one: if the user pastes a filter-list URL into
> *Import filter list*, that URL is fetched as text when added and then about
> once a day until removed. Neither counts as data collection. Settings are
> stored locally; if the user enables *Sync across devices*, the browser mirrors
> settings to the user's own browser account via `storage.sync` (disclosed in
> the privacy policy).

## 5. Permission justifications (paste each)

- **declarativeNetRequest** — block ad/tracker network requests using bundled
  filter rules.
- **declarativeNetRequestFeedback** — `declarativeNetRequest.getMatchedRules()`
  for the active tab only, to render the per-tab blocked count in the popup and
  on the toolbar badge. No URL is stored, logged or transmitted; the aggregate
  is discarded when the popup closes.
- **storage** — save the user's settings and counters locally.
- **alarms** — schedule the filter-list updates and the temporary-pause timer.
- **contextMenus** — the right-click "Block an element here" entry.
- **scripting** — register one locally-bundled MAIN-world script
  (`scriptlets/main.js`) that neutralises anti-adblock detectors (uBlock-style
  `##+js` scriptlets). The directive map is baked at build time; optional
  per-site directive DATA (host + name + arguments, never code) may also arrive
  via our Ed25519-signed filters.json and is re-validated against the same
  allowlist. No code is fetched or `eval`-ed at runtime, no personal data is
  read, nothing is sent.
- **host permissions `<all_urls>`** — a universal ad blocker must filter and
  cosmetically clean ads on every site the user visits; all processing is local.

> **Reviewer note (MAIN-world scriptlets).** The extension registers **one**
> content script in the MAIN world: `scriptlets/main.js`, which ships in this
> package and is plain, unminified, commented JavaScript. It neutralises
> anti-adblock detectors — the same mechanism established ad blockers use for
> `##+js(...)`.
> `main.js` contains (a) a fixed set of **18 named routines** — `set-constant`,
> `abort-on-property-read/write`, `abort-current-script`, `abort-on-stack-trace`,
> `no-setTimeout-if`, `no-setInterval-if`, `addEventListener-defuser`,
> `json-prune`, `no-fetch-if`, `no-window-open-if`, `remove-attr`, `remove-class`,
> `href-sanitizer`, `remove-node-text`, `nowebrtc`, `set-cookie`, `remove-cookie`
> — and (b) a static table mapping hostnames to routine names plus arguments.
> Arguments are restricted by grammar (property names, CSS selectors, text
> needles; `set-constant` values come from a closed dictionary).
> Our `filters.json` update is a **configuration file, not code**: it may add
> rows to that table — hostname, routine name, arguments. It cannot add, name or
> define a routine; anything not on the 18-name allowlist is discarded, twice
> (service worker and again inside `main.js`). The file is Ed25519-signed and
> version-monotonic, and the user can switch the update off in Settings.
> There is no `eval`, no `Function()`, no `<script src>`, and no code path that
> executes a string received over the network.
> `content_security_policy.extension_pages` is `script-src 'self'`.
>
> **Remote rules (dynamic DNR).** The bundled rulesets in `rules/` are static
> and fully reviewable. In addition, the service worker may add **dynamic block
> rules** derived from the same signed **data** file: a list of ad/tracker
> **domain strings** only. Each entry is regex-validated, capped, and turned
> into a DNR rule by code that ships in the package. Ad networks rotate domains
> daily; without this the extension goes stale between releases. No rule JSON,
> no code and no selector logic is executed from the network.

## 6. Dashboard steps

The listing is **already live** (`chromewebstore.google.com/detail/chbjbiabkgocfbbfhednpbhfeipjcclk`),
so this is an **update of the existing item**, not a new one:

1. Open the item → **Package → Upload new package** → `dist/supreme-adblock-5.0.0.zip`.
2. Refresh the listing (§3: description + the new feature bullets), replace the
   5 screenshots + promo tiles (§2).
3. Re-check the **Privacy practices** tab (§4) and paste the permission
   justifications (§5) — `tabs` was removed in 5.0.0, so delete its entry.
4. **Publisher identity:** the product, manifest and privacy policy say
   *Carbon Stealth*; the listing must show the same publisher name (Account →
   publisher display name) and the verified `carbonstealth.eu` site, otherwise
   it reads as impersonation. Account-level action, one time.
5. **Submit for review**.

## 7. Pre-flight checklist

- [ ] `manifest.json` and `package.json` versions match (5.0.0)
- [ ] `npm test` (tests/) and `node tools/build_scriptlets.mjs --check` are green
- [ ] Zip loads via `chrome://extensions → Load unpacked` with **no** console errors
- [ ] Popup, settings, allowlist, picker, theme, pause, sync all work
- [ ] A normal site loads correctly; ads are blocked
- [ ] `https://adblock.carbonstealth.eu/privacy` and `/filters.json` return 200
- [ ] "Update now" in settings succeeds (or fails gracefully if not yet hosted)

Review usually takes a few days. To ship an update: bump the version in
`manifest.json` + `package.json`, rebuild, upload. Day-to-day fixes (new ad
networks, YouTube DOM changes) go into `filters.json` — no re-review needed.
