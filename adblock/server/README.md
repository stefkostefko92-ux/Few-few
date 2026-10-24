# Live filter updates

The extension fetches `filters.json` from
`https://adblock.carbonstealth.eu/filters.json` every 12 hours (and on install).
This lets you fix things — new ad networks, or YouTube renaming its DOM — without
a Chrome Web Store re-review.

**Only data is fetched, never code.** The file is a strict JSON of strings that
the bundled logic interprets. Nothing in it is executed. This keeps the
extension MV3 / Web Store compliant (remote *code* is banned, remote *data* is
not — the same model uBlock/AdGuard use for filter lists).

## Hosting

Serve this file at `https://adblock.carbonstealth.eu/filters.json` with
`Content-Type: application/json` and permissive CORS is not needed (the fetch
comes from the extension service worker, which has host access). Bump `version`
on every change so you can tell installs are current.

## Signing key rotation

The extension embeds a LIST of Ed25519 public keys (`SIG_PUBKEYS_B64` in
`background.js`) and accepts a signature from any of them. To rotate without a
flag day: (1) ship a release with `[current, next]`; (2) once that release has
rolled out, switch the server key (`/etc/caddy/adblock-signing.key`) to `next`
and re-sign; (3) drop `current` in a later release. Never put a private key in
the repo.

Step (1) in practice — on the server, once:

```bash
sudo bash /opt/few-few/current/adblock/tools/signing_key_next.sh   # → /etc/caddy/adblock-signing.next.key (600)
```

It prints only the public key; that line goes into `SIG_PUBKEYS_B64` as the second
element (public, safe to paste anywhere). The server keeps signing with the
current key. Copy BOTH private key files to two offline places (not this server,
not git, not a chat) — losing the signing key without a second one shipped means
no filter update reaches Chrome 137+ until a new release is reviewed.

Step (2), after the release with both keys has reached the users (check the
store's version stats):

```bash
sudo sh -c 'cd /etc/caddy && mv adblock-signing.key adblock-signing.old.key && mv adblock-signing.next.key adblock-signing.key'
sudo REF=main PROJECTS="adblock" bash /opt/few-few/current/deploy/fetch-deploy.sh   # re-signs filters.json
```

`tests/background.test.mjs` pins the key the server signs with today
(`SERVER_KEY_NOW`): change it in the same release that drops the old key.

`/sources/<sha256>.txt.gz` holds the exact text of every bundled filter list, as compiled into a
release (THIRD_PARTY_NOTICES.txt links each one; `docs/LICENSES.md` explains why). The deploy copies
`server/sources/` without deleting older files, so earlier releases keep their sources online.

The site (`robots.txt`) is deliberately open to every crawler, search engines and
AI answer engines alike: one `User-agent: *` group, with only `filters.json` and
its signature and `/sources/` disallowed (data, not pages). A named group would replace that one
for its bot, which is how the filter file once leaked into an index.

## Schema

```jsonc
{
  "version": 3,                 // integer, bump on every change
  "updated": "2026-07-10",      // free-text, informational
  "blockDomains": [             // extra ad/tracker domains -> dynamic block rules
    "newadnetwork.com"          // bare domain; core video/CDN domains are ignored
  ],
  "cosmetic": [                 // extra CSS selectors hidden on all sites
    ".sneaky-ad-slot"
  ],
  "youtube": {
    "hide":  [ "ytd-new-ad-renderer" ],   // extra YT ad UI to hide
    "skip":  [ ".ytp-new-skip-button" ],  // extra skip buttons to click
    "enforcement": [                       // selectors that mean "adblock detected,
      "ytd-enforcement-message-view-model" // playback refused" -> triggers the
    ],                                     // reload-and-play fallback
    "adFields": [ "adSlotsMetadata" ],     // extra ad fields to strip from the
                                           // player response
    "adRenderers": [ "newAdRenderer" ],    // extra ad renderer keys pruned from
                                           // browse/search/next (feed ads)
    "requestFlags": [                      // extra dot-paths set to true in the
      "playbackContext.contentPlaybackContext.someNewFlag"
    ],                                     // player REQUEST body
    "disableRequestFlags": false           // emergency stop: true disables ALL
  }                                        // request flags (incl. the built-in
}                                          // isInlinePlaybackNoAd) server-side
```

Everything is capped and validated by the extension (`sanitizeConfig` in
`background.js`): only string arrays are accepted, domains are normalised and
core domains (googlevideo, ytimg, gstatic, …) can never be blocked.

## When YouTube breaks playback (black screen)

That is YouTube's server-side anti-adblock refusing to play while it detects ad
removal (usually a flagged, signed-in account). The extension already reloads
once with ad removal off so the clip plays. If YouTube **renames** the
enforcement dialog so we stop detecting it, add the new element name to
`youtube.enforcement` here and every install starts detecting it again.

## Signing (Ed25519)

The extension also fetches `filters.json.sig` and, when a public key is
configured in `background.js` (`SIG_PUBKEYS_B64`), verifies the signature before
applying an update. A bad signature is rejected and the last good config stays.
While no key is configured the update works unsigned, exactly as before.

One-time key setup (the private key lives ONLY on the server, never in git):

```bash
openssl genpkey -algorithm ed25519 -out /etc/caddy/adblock-signing.key
chmod 600 /etc/caddy/adblock-signing.key
# raw 32-byte public key, base64 — paste into SIG_PUBKEYS_B64 in background.js
openssl pkey -in /etc/caddy/adblock-signing.key -pubout -outform DER | tail -c 32 | base64
```

Sign after every edit of filters.json (the deploy script does this
automatically when the key file exists):

```bash
openssl pkeyutl -sign -inkey /etc/caddy/adblock-signing.key -rawin \
  -in /var/www/adblock/filters.json | base64 -w0 > /var/www/adblock/filters.json.sig
```

The signature policy is automatic: once `SIG_PUBKEYS_B64` has a key (it does), any
browser that supports Ed25519 in WebCrypto (Chrome 137+) **requires** a valid
`.sig` — a missing or bad signature is rejected and the last good config stays.
Older browsers accept best-effort so live updates keep working. Because of this,
always keep `filters.json.sig` deployed next to `filters.json` (the deploy signs
it automatically when the key file exists).

## SEO / GEO / AEO

The landing page ships full discoverability metadata, served from this folder:

- `robots.txt` + `sitemap.xml` — crawl directives and URL index.
- `llms.txt` — a plain-text brief for AI / answer engines (GEO).
- `og.png` (1200x630) — Open Graph / Twitter card image.
- Inline JSON-LD in `index.html` — SoftwareApplication, Organization, WebSite
  and FAQPage structured data (rich results + AEO).
- `indexnow_key.txt` — the IndexNow key. On deploy, `autodeploy.sh` materialises
  `<key>.txt` in the web root and POSTs the URL list to api.indexnow.org, which
  notifies Bing, Yandex, Seznam and Naver automatically. Manual re-ping:
  `bash tools/indexnow.sh`.

Google has no instant-submit API; it discovers changes via the sitemap. For the
fastest Google indexing, add the property in Google Search Console once and
submit the sitemap URL (`https://adblock.carbonstealth.eu/sitemap.xml`).
