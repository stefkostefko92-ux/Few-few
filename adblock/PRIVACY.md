# Privacy Policy, Supreme AdBlock

_Last updated: 25 September 2026 · applies to the Supreme AdBlock browser extension and to adblock.carbonstealth.eu_

<!-- Keep in sync with server/privacy.html (the Privacy Policy URL in the Chrome Web Store). -->

**In short:** your browsing data never leaves your device. The extension has no
account, no analytics and no telemetry. The only automatic network request to us is a
filter update about twice a day; like any download it reaches our server with
your IP address, and we do not log it. Lists you choose to add (a subscription,
or a regional list from its author) are also refreshed from their own address.

## Who is responsible

Carbon Stealth VCC, UIC (ЕИК) 208725180, 3 Samuil St., 2670 Bobov Dol,
Bulgaria — info@carbonstealth.eu. We are the controller for the data described
in this policy.

## What the extension keeps on your device

Kept in your browser's local extension storage; never sent to us. If you turn on
**Sync across devices** (off by default), your browser copies the items marked
*(sync)* to your own browser account via `storage.sync` — the browser vendor's
servers, under your account, not ours. Turn sync off and they stay local only.

- Your allowlisted sites *(sync)*
- Feature toggles and theme (cookie banners, anti-adblock, Meta posts, YouTube, …) *(sync)*
- Which filter lists and Focus-mode items you turned on or off *(sync)*
- Your own filter rules, including filter lists you subscribed to by URL, and the list of those URLs *(sync)*
- Sites where you switched off element hiding *(sync)*
- Whether protection is on, off or paused — per device, never synced
- Elements you hid with the picker
- Counters of how many requests were blocked (and the estimated data and time saved), and how many cookie banners were rejected for you — numbers only, no list of sites
- A short log (last 50 entries) of sites where Smart Detection hid an ad-sized frame, shown in Settings so you can see why
- The latest downloaded filter data, and the regional lists you downloaded from their authors (see below)

The popup's "Blocked on this page" view is built on the spot from which of our
filter lists matched in that tab; it is not stored and never sent anywhere. You
can clear everything from the extension's Settings, or by removing the
extension.

## Network requests the extension makes

1. **Filter updates (automatic, about twice a day).** The extension downloads
   `filters.json` and its signature `filters.json.sig` from
   adblock.carbonstealth.eu so blocking keeps up with new ad networks. The
   request carries no identifier, no cookie and no browsing data. As with any
   download, our server necessarily sees your IP address and browser user agent
   to answer it; **these requests are not logged**. The file is data only —
   domain names, CSS selectors and scriptlet directives from a fixed allowlist —
   and no downloaded code is ever executed. You can turn auto-update off in
   Settings.
2. **Filter lists you add yourself (only if you do).** If you subscribe to a
   filter list by URL, the extension downloads it as plain text from the address
   you gave — once when you add it, then about once a day until you remove it.
   The site hosting the list sees an ordinary request from your browser (IP
   address and user agent), exactly as if you opened that URL yourself. We are
   not involved in that request.
3. **Regional lists from their authors (only if you turn one on).** Most filter
   lists are built into the extension, so turning them on downloads nothing. A
   few lists that we may not redistribute — the Bulgarian list (stanev.org), the
   Polish, Nordic and Serbo-Croatian lists (raw.githubusercontent.com) — are
   downloaded by your browser from their author's address when you turn one on,
   and then about once a day while it stays on. That server sees an ordinary
   request (IP address and user agent), as if you opened the list yourself. We
   are not involved in that request. Settings marks these lists "from its author".

There are no other requests: no analytics, no crash reports, no "phone home".

## Reporting a broken site

The "Site broken?" page first offers fixes that stay on your device. If you
choose to tell us, the extension sends nothing: it opens a message in **your own
email app**, and you see every word before you send it — the site name (the full
address only if you tick it), your description, the extension and browser
version, and which lists and features are on. What you send reaches
info@carbonstealth.eu with your email address; we use it only to fix the site
and answer you, and delete it within 12 months. Legal basis: our legitimate
interest in keeping the extension working, Art. 6(1)(f) GDPR.

## This website

adblock.carbonstealth.eu sets no cookies, uses no analytics and loads nothing
from third parties (no external fonts, scripts or trackers). The server does not
keep access logs for this site or for filter updates. Error logging is limited
to critical server errors; if such an entry ever includes an IP address, it is
kept only as long as needed to fix the problem and then deleted.

## Legal basis, recipients and transfers

We process IP addresses only transiently, to deliver filter updates and this
website securely — our legitimate interest under **Art. 6(1)(f) GDPR**. We do
not profile you, combine this data with anything else, sell it or share it. The
only recipient is our hosting provider in the European Union, acting on our
behalf. We do not transfer personal data outside the EU/EEA. If you turn on a list
hosted on raw.githubusercontent.com (GitHub, Inc., USA), your browser contacts
that server directly, as it would for any web page — we are not a party to that
request, and GitHub processes it under its own privacy statement. If you enable sync,
your browser vendor processes your synced settings under its own terms, at your
choice.

## Donations

Donations are optional and handled by Revolut (revolut.me), which acts as an
independent controller under its own privacy policy. When you donate we receive
what Revolut shows the recipient — typically your name, the amount and any note
you add — and keep it only as long as accounting law requires (Art. 6(1)(c)
GDPR).

## Your rights

You have the right to access, rectification, erasure, restriction of
processing, objection (Art. 21 GDPR) and data portability. Because we keep no
logs of filter updates, we normally hold nothing that could identify you; to look
into a specific request we would need your IP address and the approximate time
(Art. 11 GDPR). Write to info@carbonstealth.eu — we reply within one month.

You can also complain to the Bulgarian Commission for Personal Data Protection
(КЗЛД, www.cpdp.bg) or to the data protection authority where you live.

## Extension permissions

- `declarativeNetRequest` — block ad and tracker requests using filter rules.
- `declarativeNetRequestFeedback` — read which of our own rules matched in the
  active tab (`getMatchedRules`) to show the blocked count and which lists
  matched; no URL is read, stored or sent.
- `storage` — keep your settings and counters on your device.
- `alarms` — schedule filter updates and the pause timer.
- `contextMenus` — the right-click "Block an element here" entry.
- `scripting` — register the scripts that ship in the package and neutralise
  anti-adblock detectors, and insert the element-hiding style sheets of the
  filter lists you turned on; nothing is fetched or executed from the network,
  no personal data is read and nothing is sent.
- host access (`<all_urls>`) — block ads and apply cosmetic filtering on the
  pages you visit; page content is processed on your device and never sent
  anywhere.

## Changes

If this policy changes, the new version is published at
https://adblock.carbonstealth.eu/privacy with a new date. Material changes are
also noted in the extension's changelog.

Supreme AdBlock, by Carbon Stealth VCC. Released under the MIT License.
