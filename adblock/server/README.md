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
configured in `background.js` (`SIG_PUBKEY_B64`), verifies the signature before
applying an update. A bad signature is rejected and the last good config stays.
While no key is configured the update works unsigned, exactly as before.

One-time key setup (the private key lives ONLY on the server, never in git):

```bash
openssl genpkey -algorithm ed25519 -out /etc/caddy/adblock-signing.key
chmod 600 /etc/caddy/adblock-signing.key
# raw 32-byte public key, base64 — paste into SIG_PUBKEY_B64 in background.js
openssl pkey -in /etc/caddy/adblock-signing.key -pubout -outform DER | tail -c 32 | base64
```

Sign after every edit of filters.json (the deploy script does this
automatically when the key file exists):

```bash
openssl pkeyutl -sign -inkey /etc/caddy/adblock-signing.key -rawin \
  -in /var/www/adblock/filters.json | base64 -w0 > /var/www/adblock/filters.json.sig
```

The signature policy is automatic: once `SIG_PUBKEY_B64` is set (it is), any
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
