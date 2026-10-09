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

## Alerts and pacing

- **Two independent channels.** Chrome desktop pop-ups follow *Desktop
  notifications*; Telegram/Discord webhooks follow their own settings. Turn the
  desktop toggle off and everything still goes to Discord.
- **Every alert says who and where:** character (+ level), server (e.g. `s1-us`),
  what the bot is doing right now, and the guild. Discord alerts are embeds
  coloured by level (success / warning / error / info).
- **What is sent:** start, stop, level-up and licence problems by default.
  Optional: *Webhook on every action* (one message per action, with the module's
  own result line - Discord rate-limits a webhook to roughly 30 messages a
  minute, so pair it with a fixed interval) and *Periodic status every N min*.
  The per-action and periodic reports never raise a Chrome pop-up.
- **Pacing.** By default the delay between actions is humanized (min/max). Set
  *Fixed interval between actions* (seconds, `0` = auto) to program it; the
  panel's "Next action in" counts down to the earliest moment the next action can
  happen, never earlier than the game's own busy timer.
- **Reconnect.** If the session drops and auto-login reloads the page, a bot that
  was running starts again once you are back in.
- **Timers, not polling.** While the hero is busy (adventure, work, mission,
  cave) or a module waits on a cooldown or energy regen, the bot sleeps until
  that exact moment and acts right after it ends (about 0.25 s with humanize
  off, a short 0.3-1.2 s human-like beat with it on; a fixed interval, if set,
  is respected). With nothing to wait for it only re-checks every 30 s.

## Several heroes

Every hero (server + name) has his **own saved settings**. The first time a
hero is seen he starts from the defaults; from then on the panel, the popup and
the options page change only that hero. Several heroes can run at once, each in
his own tab. Settings always open on the hero who is logged in:
the panel's and the popup's Settings button open that hero's own page (an
already open page for him is brought to the front instead of a copy), and
opening Settings from `chrome://extensions` picks the hero of the game tab used
last. Under *Settings for* you can switch to another hero or to *Default*
(what a new hero starts with). An open settings page follows changes made in
the game (module chips) until you start editing it. With several hero tabs
open (none in front) the popup lets you choose which one to control; Start /
Pause / Stop from the popup show in that tab's panel at once, and a hidden
panel's corner button lights up while the bot runs.

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
bound to the browser it's activated in; a real one-machine lock across
computers needs the licence server, see below). New installs get a 3-day trial
with everything unlocked; after that, Start needs a key. The popup, options page
and panel paywall all have pay buttons (they open the Revolut link; you enter
the amount) and an Activate field for the key.

Issuing keys (seller side). Keys are **ECDSA P-256** signatures: you sign with
a private key that only you hold; the extension and the licence server carry
only the public key (`LICENSE_PUBLIC_KEY` in `src/shared/payment.js`), so a key
can be checked offline but cannot be minted from the extension's code.

```
# once: create a key pair OUTSIDE the repo, paste the printed public key into
# LICENSE_PUBLIC_KEY (and set your own REVOLUT_PAYMENT_URL)
node tools/genkey.mjs --new-keypair ~/.tanoth-license

export LICENSE_PRIVATE_KEY_FILE=~/.tanoth-license/tanoth-license-private.pem
node tools/genkey.mjs 31          # monthly
node tools/genkey.mjs lifetime    # lifetime
```

Back the private key up: lose it and you cannot issue keys that the shipped
extension accepts; leak it and anyone can. Rotating it invalidates every key
issued so far. Offline, a lifetime key is bound to the browser it was activated
in; for a one-machine lock across computers run the licence server (`server/`)
and set `LICENSE_SERVER_URL`.

## Build for the Web Store

```
bash tools/package.sh
```

Produces `dist/tanoth-master-bot-<version>.zip` with only the extension files
(manifest, icons, _locales, popup, options, stats, src). It leaves out
`controller/`, `server/`, `tools/` (including the key generator) and screenshots.
The zip only ever contains the public key.

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
