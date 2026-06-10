# Tanoth Master Bot

Chrome extension (Manifest V3) that automates the daily grind in the browser RPG
[Tanoth](https://gameforge.com/play/tanoth). It talks to the game over its own
XML-RPC API and adds a scheduler, an in-game control panel, statistics and a few
languages.

Automating a game can break Gameforge's Terms of Service and get accounts
banned. Use it on accounts you don't mind losing.

## What it does

Runs the repeatable daily content on a loop:

- Adventures (gold / xp / shortest / longest / smart)
- Dungeon (normal and Shadow), Mission quest
- Map encounters (Liberation), Cave of Illusions, Dragon
- Arena duels, Work shifts
- Evocation Circle and attribute training (gold sinks)
- Optional guild gold donation, auto-sell, auto-login

Plus a draggable panel inside the game, a toolbar popup, a full settings page, a
stats page and Telegram/Discord alerts. See `FEATURES.md` for the full map of
which game actions are covered and which are left out on purpose.

## Install (unpacked)

1. `chrome://extensions` -> enable Developer mode -> Load unpacked -> pick this
   folder.
2. Log into a Tanoth world. The panel shows up on the right; the footer says
   "Protocol ready" once the session is detected. Hit Start.

## How it works

The gateway URL and session aren't hard-coded. `src/content/inject.js` runs in
the page, reads `window.flashvars.sessionID`, and posts XML-RPC `<methodCall>`s
to `<world>/xmlrpc` with the page's own cookies. `src/core/api.js` wraps that
with typed calls and parses the responses into a shared state object. The
scheduler (`src/core/scheduler.js`) asks each enabled module for one action per
cycle, in priority order, then waits a humanized delay (or spams, if humanize is
off). Method names live in `api.js`, so a server revision that renames one is a
one-line change.

## Subscription

Paid via Revolut, two plans: €4/month (31-day key) or €20 lifetime (one-off,
locks to the first machine it's activated on). New installs get a 3-day trial
with everything unlocked; after that, Start needs a key. The popup, options page
and panel paywall all have pay buttons (they open the Revolut link; you enter
the amount) and an Activate field for the key.

Issuing keys (seller side): set your own `REVOLUT_PAYMENT_URL` and
`LICENSE_SECRET` in `src/shared/payment.js`, then:

```
node tools/genkey.mjs 31        # monthly
node tools/genkey.mjs 365000    # lifetime
```

Offline keys are signed with `LICENSE_SECRET`. Because that secret ships in the
extension, offline checks are a deterrent, not real DRM. For cross-machine
enforcement run the license server (`server/`) and set `LICENSE_SERVER_URL`.

## Build for the Web Store

```
bash tools/package.sh
```

Produces `dist/tanoth-master-bot-<version>.zip` with only the extension files
(manifest, icons, _locales, popup, options, stats, src). It leaves out
`controller/`, `server/`, `tools/` (including the key generator) and screenshots.
Change `LICENSE_SECRET` before publishing.

## Tests

`npm install` then `npm test` (also runs in CI):

- `tools/selftest.mjs` - presets, notification payloads, smart scoring, settings
  merge, license signing, license-server device binding.
- `tools/engine-test.mjs` - the scheduler and modules in Node with a fake clock:
  licence gate, adventure loop, humanize, breaks, manual pause, pvp cooldown,
  dungeon, mission, shadow, guild.
- `tools/api-test.mjs` - `api.js` against crafted XML-RPC responses (linkedom):
  field parsing, attribute costs, circle/map parsing, fault handling.
- `tools/ext-test.mjs` (`npm run test:ext`) - loads the unpacked extension in
  headed Chromium (Playwright + xvfb) and checks the service worker, every page
  and the content-script panel boot without errors.

The live in-game data flow needs a real account, so it isn't covered by the
automated tests.

## Layout

```
manifest.json, icons/, _locales/      extension shell
popup/ options/ stats/                UI pages
src/shared/                           settings schema, payment, presets, notify, smart
src/background/service-worker.js      install, messaging, licensing, webhooks
src/content/                          inject.js (page) + content-script.js (boot)
src/core/                             bridge, api, scheduler, state, storage, ...
src/ui/                               in-game panel
src/modules/                          one file per activity
controller/                           self-hosted multi-account runner (Playwright)
server/                               optional license server (Docker/systemd)
tools/                                tests, key generator, packaging
```

The multi-account controller (`controller/CONTROLLER.md`) runs several accounts
on one machine, each in its own browser profile. The license server
(`server/DEPLOY.md`) enforces the one-machine lifetime lock across computers.
