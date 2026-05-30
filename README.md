# Tanoth Master Bot

A complete automation companion (Chrome extension, Manifest V3) for the
browser RPG **[Tanoth](https://gameforge.com/play/tanoth)**. It merges and
expands on the feature sets of the two popular community bots —
*Bot Tanoth Master 2.0* and *Tanothbot* — into a single, well-structured,
multilingual extension.

> ⚠️ **Use at your own risk.** Automating a game may violate Gameforge's Terms
> of Service and can lead to account penalties. This project is provided for
> educational purposes; you are responsible for how you use it.

---

## Features

Everything the two reference extensions do, in one place — plus more:

| Module | What it does |
| --- | --- |
| **Adventures** | Auto-runs adventures with selectable strategy (shortest, longest, max-XP/time, max-gold/time, safest), difficulty & win-chance gates, optional bloodstone spending with a reserve. |
| **Arena / Duels** | Picks opponents by strategy (weakest, lowest level, highest gold, random), protects guild members, enforces a relative level band, records win/loss stats. |
| **Training** | Raises a priority attribute with an affordable fallback, honouring a gold reserve and optional spend cap. |
| **Dungeon** | Runs the daily dungeon when available, gated on minimum health. |
| **Cave of Illusions** | Climbs floors automatically, optional bloodstone spending up to a target floor. |
| **Work / Jobs** | Sends the character on multi-hour paid shifts, picks best pay, yields when free adventures refill. |
| **Runes** | Auto-upgrades runes and sells duplicates / low-rarity ones. |
| **Auto-sell** | Clears inventory by rarity/type filters while protecting potions, gear upgrades and keepers. |
| **Auto-login** | Detects dropped sessions and reconnects, with a capped retry count. |
| **Scheduler** | Active-hours window plus human-like random breaks. |

Plus extension-wide niceties:

- **In-game overlay panel** — draggable, collapsible, with start/stop/pause,
  live activity log, session statistics and per-module quick toggles.
- **Popup remote** — compact control + status from the toolbar.
- **Full options page** — every setting, schema-driven.
- **Humanized timing** — randomised delays and occasional long pauses so the
  cadence isn't robotic.
- **Statistics** — adventures, duels, cave floors, dungeons, gold/XP earned,
  items sold, level-ups, errors — persisted across reloads.
- **Desktop notifications** — on level-up and when the bot stops.
- **6 languages** — English, Spanish, Polish, Turkish, Portuguese, Bulgarian
  (with automatic English fallback for any untranslated string).

---

## Installation (unpacked)

1. Open `chrome://extensions` in Chrome/Edge/Brave.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select this folder.
4. Open Tanoth (`https://sX-en.tanoth.gameforge.com/…`). The control panel
   appears on the right; the toolbar icon opens the popup.

---

## How it works

The bot never ships hard-coded API endpoints. Tanoth's gateway URL and request
format change between server revisions, so instead:

1. **`src/content/inject.js`** runs in the *page's* JavaScript context and hooks
   `fetch` / `XMLHttpRequest` to **observe** the game's real traffic. From those
   observations it learns the gateway URL, the request envelope (JSON / form /
   query string), the field that carries the action name, and the session
   token. It can then **replay** requests in the page context so they carry the
   exact cookies and origin the game uses.
2. **`src/core/bridge.js`** connects that page-world hook to the isolated
   content world via `window.postMessage`, exposing a promise-based
   `call(action, params)`.
3. **`src/core/api.js`** is the semantic layer: it maps logical operations
   (`startAdventure`, `duel`, …) to action names and defensively parses
   responses (coping with field-name variants like `gold`/`money`/`cash`) to
   keep a live `State` snapshot — even from traffic the game itself generates.
4. **`src/core/scheduler.js`** runs a cooperative loop: each cycle it asks every
   enabled module, in priority order, whether it has work; the first to return
   an action runs it, then a humanized delay passes. One action in flight at a
   time, just like a human.
5. Each **module** in `src/modules/` owns one game activity and registers a
   `tick()` with the scheduler.

> If Tanoth renames its actions, only the `ACTIONS` map in `src/core/api.js`
> needs adjusting — everything else adapts automatically.

---

## Project layout

```
manifest.json
icons/                       generated PNG icons
_locales/<lang>/messages.json  en, es, pl, tr, pt, bg
popup/                       toolbar popup (html/css/js)
options/                     full settings page (schema-driven)
src/
  shared/defaults.js         settings schema + merge/migrate (ES module)
  background/service-worker.js  install, messaging, notifications, heartbeat
  content/
    inject.js                page-world network hook + request replay
    content-script.js        orchestrator (boots everything)
  core/
    namespace.js i18n.js logger.js storage.js state.js stats.js
    bridge.js api.js scheduler.js
  ui/
    panel.js panel.css        in-game overlay
  modules/
    adventures.js combat.js training.js dungeon.js cave.js
    work.js runes.js autosell.js autologin.js
```

---

## Configuration

Open the options page (toolbar popup → *Settings*, or the panel's *Settings*
link). Settings are grouped by module; changes are saved to
`chrome.storage.local`, merged against the defaults, and pushed live to any open
game tab. The **Scheduler** group adds active-hours and break behaviour; the
**General** group holds the master switch, humanized-delay bounds, notification
toggles and the panel theme/position.

---

## Development notes

- Content scripts are plain (non-module) and share a single `window.TanothBot`
  namespace, loaded in the order declared in the manifest.
- The service worker, popup and options page are ES modules and share
  `src/shared/defaults.js`.
- Icons are generated with `node` (no native deps) — see the generator in the
  commit history if you want to tweak the artwork.
- No build step or external dependencies: load the folder as-is.
