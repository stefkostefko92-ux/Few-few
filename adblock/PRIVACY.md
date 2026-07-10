# Privacy Policy, The Best Ads Block

_Last updated: June 2026_

The Best Ads Block is built to protect your privacy, not to collect data.

## What we collect

**Nothing.** The extension has no analytics, no telemetry and no accounts. We
do not see which sites you visit, and no browsing data ever leaves your device.

## What is stored locally

The following is kept only in your browser's local storage and never
transmitted to us or anyone else:

- Whether protection is on or off
- Your allowlisted sites
- Feature toggles (cookie banners, anti-adblock, Meta posts, theme)
- Elements you hid manually with the picker
- A local counter of how many ads were blocked

You can clear all of it at any time from the extension's settings, or by
removing the extension.

## Network requests we make

One, and only for filter updates. About once a day the extension downloads a
small filter file (`filters.json`) from adblock.carbonstealth.eu so blocking stays
current as ad networks and sites change. This request contains **no information
about you** — no identifiers, no browsing data, nothing. It is a plain GET of a
public file, and the file is treated purely as data (block rules and CSS
selectors); no downloaded code is ever executed. You can turn auto-update off in
the settings; the extension still works with its bundled rules.

## Permissions

- `declarativeNetRequest`, block ad/tracker network requests via rules.
- `storage`, save your settings locally.
- `tabs`, show the per-tab blocked count and the current site in the popup.
- `alarms`, schedule the daily filter update and the temporary-pause timer.
- `contextMenus`, the right-click "Block an element here" entry.
- host access (`<all_urls>`), apply blocking and cosmetic filtering on the
  pages you visit. Page content is processed locally and never sent anywhere.

## Contact

Questions? Reach us at https://carbonstealth.eu
