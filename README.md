# Tanoth Master Bot

An automation companion (Chrome extension, Manifest V3) for the browser RPG
**[Tanoth](https://gameforge.com/play/tanoth)**. It automates the game's core
daily loop using Tanoth's **real XML-RPC protocol**, wrapped in a polished UI
with scheduling, statistics and six languages.

> ⚠️ **Use at your own risk.** Automating a game may violate Gameforge's Terms
> of Service and can lead to account penalties. Provided for educational
> purposes; you are responsible for how you use it.

## Subscription

The bot is paid: **€4 / month**, paid via **Revolut**.

- Every new install includes a **3-day free trial** — full functionality, no key.
- After the trial, **Start** is locked until a license key is activated.
- Pay with the in-app **Pay with Revolut** button (popup, options page, or the
  in-game panel's paywall), then paste the license key you receive into the
  **Activate** field.
- A live badge shows trial/subscription days remaining; the bot stops
  automatically if the subscription lapses.

### For the seller (issuing keys)

Keys are signed offline. Set your own values in `src/shared/payment.js`
(`REVOLUT_PAYMENT_URL`, `LICENSE_SECRET`) and mint one key per paid month:

```bash
node tools/genkey.mjs 31      # 31-day key, prints e.g. TZ1.<payload>.<sig>
```

> The signing secret ships inside the extension, so offline verification is a
> deterrent, not unbreakable DRM. For strong enforcement, move key validation
> to a server and have the client call it (the `ACTIVATE_LICENSE` handler in
> `src/background/service-worker.js` is the single place to swap in a fetch).

### Look & feel

The UI uses a **carbon-stealth palette** — matte carbon-black surfaces,
graphite borders and a single restrained emerald accent — across the in-game
panel, popup and options page.

---

## What it does (and why it works)

Unlike a guessed-at scraper, this talks to the game the same way the game's own
client does. The protocol was verified against the open-source
[`adpego/BoTanoth`](https://github.com/adpego/BoTanoth) client:

- **Gateway:** the game client at `<server>/main/client` posts to
  `<server>/xmlrpc`.
- **Transport:** HTTP `POST`, `Content-Type: text/xml`, an XML-RPC
  `<methodCall>` body; responses are XML parsed with `DOMParser`.
- **Auth:** every call's first parameter is `window.flashvars.sessionID`, the
  session token the page already holds.

### Automation modules

| Module | Method(s) used | What it does |
| --- | --- | --- |
| **Adventures** | `GetAdventures`, `StartAdventure`, `MiniUpdate` | Runs adventures by strategy (most gold, most XP, shortest, longest) within a difficulty cap; resolves finished runs; optional bloodstone use with a reserve; backs off when the daily allowance is spent. |
| **Dungeon** | `GetDungeon`, `StartDungeon` | Runs the daily dungeon while `free_tries_today` remain, then backs off until reset. |
| **Map events** | `StartIllusionCave`, `StartDragon` | Cycles the Cave of Illusions and Dragon event on a cooldown. |
| **Arena / PvP** | `Fight` | Farms configured opponent name(s) up to a daily cap with a cooldown. |
| **Work** | `GetWorkData`, `StartWork` | Idle-time filler: paid work shifts (capped to the server max), yielding to adventures. |
| **Evocation Circle** | `EvocationCircle_getCircle`, `EvocationCircle_buyNode` | Spends gold upgrading the circle along the game-correct optimal node path, keeping a gold reserve. |
| **Training** | `GetUserAttributes`, `RaiseAttribute` | Raises STR/DEX/CON/INT — a chosen attribute or "mix" (always the cheapest) — honouring a reserve and optional spend cap. |
| **Auto-sell** | `GetEquipment`, `SellItem` | **Conservative & opt-in.** Only sells items whose rarity it can positively read as below the threshold; never sells equipped/unclassified items. Off by default. |
| **Auto-login** | — | Detects a dropped session and reloads to reconnect, with a capped retry count. |

All method names and signatures were extracted from the game's own client
(`/webroot/game/TanothHtml5.js`, e.g. `callMethod("StartDungeon",[],cb)`), so
the calls match exactly. A single in-game task runs at a time (tracked via
`MiniUpdate`'s `time`/`type`), so the task modules (adventures, dungeon, map,
work) cooperate through one busy timer; PvP and auto-sell are instant and
interleave during waits.

### Around the modules

- **Priority scheduler** — one action in flight at a time with **humanized
  delays** and optional active-hours window + random breaks. While an adventure
  is running, training/circle keep spending gold and the panel shows a live
  **countdown** to the next action.
- **In-game overlay panel** — draggable/collapsible, with start/stop/pause, a
  live activity log, session statistics, per-module quick toggles and the
  subscription badge/paywall.
- **Toolbar popup** — compact remote control + live status.
- **Schema-driven options page** for every setting.
- **Statistics** persisted across reloads (adventures, circle nodes, gold/XP,
  errors, runtime).
- **6 languages** — English, Spanish, Polish, Turkish, Portuguese, Bulgarian
  (automatic English fallback for any untranslated string).

---

## Installation (unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. **Load unpacked** → select this folder.
4. Open and log into your Tanoth world (`https://sX-en.tanoth.gameforge.com/…`).
   The panel appears on the right; the footer shows **“Protocol ready”** once
   the session is detected. Click **Start**.

---

## Scope & honesty

This release deliberately ships only what is **verified to work** end to end:
adventures, the evocation circle, attribute training and auto-reconnect — which
is exactly the core daily grind the proven open-source bot performs.

Features such as arena duels, dungeon, Cave of Illusions, work shifts and
auto-sell exist in the closed-source store bots, but their exact XML-RPC method
names aren’t publicly documented and shipping guessed names would silently
fail. To make adding them safe, the bot **observes the game’s own XML-RPC
traffic** and records every method name it sees (`Bridge.findMethod`); once a
method is confirmed, wiring up a new module is a few lines in `src/core/api.js`
plus a module file. Open the console while playing to see discovered methods.

---

## How the pieces fit

```
manifest.json
icons/                          generated PNG icons
_locales/<lang>/messages.json   en, es, pl, tr, pt, bg
popup/                          toolbar popup
options/                        schema-driven settings page
tools/genkey.mjs                license key generator (seller side)
src/
  shared/
    defaults.js                 settings schema + merge/migrate (ES module)
    payment.js                  price, trial, Revolut URL, signing secret
  background/service-worker.js  install, messaging, notifications, heartbeat,
                                trial + license verification (HMAC-SHA256)
  content/
    inject.js                   page-world XML-RPC client (reads flashvars,
                                builds <methodCall>, POSTs, sniffs methods)
    content-script.js           orchestrator (boots everything)
  core/
    namespace.js i18n.js logger.js storage.js state.js stats.js
    license.js                  content-side subscription gate
    bridge.js                   page<->content messaging + callXmlRpc
    api.js                      semantic Tanoth API + XML response parsing
    scheduler.js                cooperative priority loop (license-gated start)
  ui/ panel.js panel.css        in-game overlay (carbon-stealth theme)
  modules/
    adventures.js circle.js training.js autologin.js
```

### Request flow

1. `inject.js` (page world) reads `flashvars.sessionID`, derives the `/xmlrpc`
   gateway, and exposes `callXmlRpc(method, params)` — prepending the session
   id, building the XML, and POSTing with the page's own cookies.
2. `bridge.js` (content world) relays calls over `window.postMessage`.
3. `api.js` exposes typed operations (`getAdventures`, `startAdventure`,
   `raiseAttribute`, `getCircle`, `buyCircleNode`, …) and parses the XML-RPC
   responses into the shared `State`.
4. `scheduler.js` asks each enabled module, in priority order, for one action
   per cycle, then waits a humanized delay.

> Method names live in one place (`src/core/api.js`); if a server revision
> renames one, that's the only edit needed.

---

## Development notes

- Content scripts are plain (non-module) and share a single `window.TanothBot`
  namespace, loaded in the order declared in the manifest.
- The service worker, popup and options page are ES modules sharing
  `src/shared/defaults.js`.
- Icons are generated with `node` (no native deps).
- No build step, no dependencies — load the folder as-is.

**Credit:** the XML-RPC protocol details and the evocation-circle node ordering
were learned from the open-source [`adpego/BoTanoth`](https://github.com/adpego/BoTanoth)
(MIT-spirited community bot).
