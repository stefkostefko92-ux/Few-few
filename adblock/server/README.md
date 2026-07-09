# Live filter updates

The extension fetches `filters.json` from
`https://carbonstealth.eu/adblock/filters.json` every 12 hours (and on install).
This lets you fix things — new ad networks, or YouTube renaming its DOM — without
a Chrome Web Store re-review.

**Only data is fetched, never code.** The file is a strict JSON of strings that
the bundled logic interprets. Nothing in it is executed. This keeps the
extension MV3 / Web Store compliant (remote *code* is banned, remote *data* is
not — the same model uBlock/AdGuard use for filter lists).

## Hosting

Serve this file at `https://carbonstealth.eu/adblock/filters.json` with
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
    "adFields": [ "adSlotsMetadata" ]      // extra ad fields to strip from the
  }                                        // player response
}
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
