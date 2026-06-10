# Changelog

## 3.4.2

- Fix: YouTube page became unclickable while the video played. YouTube's
  anti-adblock dialog was hidden but its full-page backdrop stayed, swallowing
  clicks and locking scroll. The backdrop is now removed and page interaction /
  scrolling restored (CSS + JS), scoped to the enforcement dialog only.

## 3.4.1

- Fix: after a YouTube ad, the shared video element is restored to the user's
  real mute state and playback speed (it could stay muted or stuck at 16x).
- Performance: throttle the cosmetic, cookie, anti-adblock and Meta observers,
  coalescing DOM mutations so busy pages (YouTube, feeds) stay smooth.
- Guard the content script against starting twice on repeated toggles, and
  re-hide immediately when protection is turned back on.
- Cache the sync flag instead of reading storage on every change.

## 3.4.0

- Recolored the whole UI and icon to match the carbonstealth.eu brand palette:
  near-black background (#060608), cream text (#f5f5f0), cyan accent (#00e5ff /
  #00b8d4) and green "protected" state (#00ff88); paused state uses #ff3366.
- New cyan shield icon and store graphics.

## 3.3.0

- Cross-device sync: optionally keep settings, allowlist and filters in sync
  across every Chrome you're signed into (chrome.storage.sync).
- Pause for 30 minutes from the popup, with automatic resume (chrome.alarms).
- Cookie banners: the dismisser now runs inside consent iframes and handles
  Sourcepoint (Mediaset and other EU media sites), including the Italian
  "Continua senza accettare" / "Accetta" buttons. Fixes the persistent banner
  on sportmediaset.mediaset.it.

## 3.2.0

- New "My filters" editor (uBlock/AdBlock-style): write your own rules — block
  a domain, hide an element everywhere (`##.selector`) or only on one site
  (`site.com##.selector`). Comments with `!`.
- Right-click "Block an element here" context menu, like uBlock/AdBlock.
- Domain block rules from My filters are applied as dynamic rules; cosmetic
  lines are applied by the content script, with core video/CDN domains
  protected from accidental blocking.

## 3.1.2

- Redesigned popup: crisp inline SVG icons (no emoji), real product logo, a
  clearer protected/paused hero state, refined metrics and a tidy footer with
  the support link.

## 3.1.1

- Cookie/consent banner dismissal now searches open shadow DOM (where many
  modern consent managers live), covers many more frameworks (Osano, Iubenda,
  Termly, Cookie-Script, Quantcast FC, CookieYes, …) and removes leftover
  dimming overlays/scroll locks.

## 3.1.0

- New "YouTube ad blocking" toggle in settings. When off, the extension does
  not touch YouTube at all (no network rules, no player script, no auto-skip) —
  useful if a network/region ever has trouble playing video.
- YouTube handling now also respects the per-site allowlist: allowlist
  youtube.com to disable all YouTube interference for your account.
- The YouTube player script is injected on demand by a loader, so the toggle
  and allowlist fully control whether it runs.
- Built-in filter rules only — no remote fetches and no remotely hosted code.

## 3.0.3

- YouTube ad removal now prunes the ad fields in place from the parsed player
  response (JSON.parse / Response.json) instead of rebuilding the network
  response. The video stream and its signature are never touched, which avoids
  any chance of a corrupted/forbidden playback request.

## 3.0.2

- Fix: the global on/off toggle now fully stops all blocking. The previous
  runtime filter import left dynamic rules active even when protection was off,
  which could keep a site (e.g. YouTube) broken until the extension was removed.
- Removed the runtime EasyList/EasyPrivacy network import. Blocking now relies
  on the bundled curated rules plus per-page cosmetic filtering and YouTube
  response sanitising — the stable approach used by MV3 blockers. Dropped the
  `alarms` permission and any leftover imported rules are cleaned up on load.
- UI: clearer "time saved" formatting for small values; footer shows the
  bundled filter count.

## 3.0.1

- Fix: YouTube videos could fail to start because the player waits on
  doubleclick's ad_status.js / pagead id before initialising. These are now
  allowed to load (ads are still removed from the player response), instead of
  being blocked at the network layer.
- Stop blocking log_event / csi_204 (logging & timing, not ads).
- Imported filter lists can never block core video/CDN domains (googlevideo,
  ytimg, gstatic, …).

## 3.0.0

- Block sponsored posts on Facebook & Instagram (toggleable).
- Accurate saved-data/time stats based on per-resource-type counting.
- Settings backup: export and import as JSON.
- Production-safe blocked counter (works outside developer mode).
- Carbon Stealth theme with light/dark switch.
- Free to use, with an optional donation link.

## 2.2.0

- Daily auto-update of EasyList + EasyPrivacy filters (manual update too).
- "Data saved" and "time saved" counters.
- Light / dark theming.

## 2.1.0

- Per-site allowlist and a full settings page.
- Cookie / consent banner auto-dismiss.
- Anti-adblock bypass.
- Element picker for hiding anything manually.

## 2.0.0

- YouTube video ad removal (pre-roll / mid-roll) plus auto-skip fallback.
- Expanded network blocklist.

## 1.0.0

- Initial release: network-level ad blocking and cosmetic filtering.
