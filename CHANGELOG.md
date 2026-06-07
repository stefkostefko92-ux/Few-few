# Changelog

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
