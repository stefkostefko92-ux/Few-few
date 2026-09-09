# Privacy Policy, Supreme AdBlock

_Last updated: September 2026_

Supreme AdBlock is built to protect your privacy, not to collect data.

## What we collect

**Nothing.** The extension has no analytics, no telemetry and no accounts. We
do not see which sites you visit, and nothing is ever sent to us. The only
times data can leave your device are the ones *you* trigger, listed below.

## What is stored locally

The following is kept in your browser's local storage. It is never sent to us.
If you turn on **Sync across devices** (off by default), Chrome mirrors the items
marked *(sync)* to your own Google account via `chrome.storage.sync` — Google's
servers, under your account, not ours; turn sync off and they stay local only:

- Whether protection is on or off *(sync)*
- Your allowlisted sites *(sync)*
- Feature toggles (cookie banners, anti-adblock, Meta posts, theme, …) *(sync)*
- Your custom filter rules, including any filter list you imported *(sync)*
- Elements you hid manually with the picker
- A local counter of how many ads were blocked
- A short local log (last 50 entries) of the sites where Smart Detection blocked
  an ad-sized frame — shown in the settings so you can see *why*; never sent anywhere
- The latest downloaded filter data (see below)

You can clear all of it at any time from the extension's settings, or by
removing the extension.

## Network requests we make

Two kinds, and neither carries any information about you:

1. **Filter updates (automatic, about once a day).** The extension downloads a
   small filter file (`filters.json`, plus its detached signature
   `filters.json.sig`) from adblock.carbonstealth.eu so blocking stays current as
   ad networks and sites change. This request contains **no information about
   you** — no identifiers, no browsing data, nothing. It is a plain GET of a
   public file, and the file is treated purely as data (block rules, CSS
   selectors and scriptlet directives whose names and arguments come from a fixed
   allowlist); no downloaded code is ever executed. You can turn auto-update off
   in the settings; the extension still works with its bundled rules.
2. **Filter list import (only when you ask for it).** If you paste a URL into
   *Import filter list* in the settings, the extension downloads that list once,
   as plain text, from the address you gave. The site hosting the list sees an
   ordinary request from your browser (your IP address and browser user agent),
   exactly as if you had opened that URL yourself. We are not involved in that
   request and nothing else is sent.

## Permissions

- `declarativeNetRequest`, block ad/tracker network requests via rules.
- `declarativeNetRequestFeedback`, read which of our own rules matched in the
  current tab (`getMatchedRules`) to show the per-tab blocked count on the badge;
  no URLs are stored or sent.
- `storage`, save your settings locally.
- `tabs`, show the per-tab blocked count and the current site in the popup.
- `alarms`, schedule the daily filter update and the temporary-pause timer.
- `contextMenus`, the right-click "Block an element here" entry.
- `scripting`, inject a small, locally-bundled ad-neutralising script into the
  page; it runs from the package, fetches and executes no remote code, reads no
  personal data and sends nothing anywhere.
- host access (`<all_urls>`), apply blocking and cosmetic filtering on the
  pages you visit. Page content is processed locally and never sent anywhere.

## Contact

Questions? Reach us at https://carbonstealth.eu
