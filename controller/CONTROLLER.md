# Tanoth Multi-Account Controller (self-hosted)

Run several Tanoth accounts at once on one machine you control (your PC or a
VPS). Each account gets its own Chromium profile with the extension loaded, its
own settings and an optional proxy, and there's a small local dashboard to watch
them. Logins stay in per-account profile folders on your box.

## Requirements
- Node.js 18+
- On a **headless VPS**: a virtual display (`xvfb`) - Chromium needs a display to
  load extensions.

## Install
```bash
cd controller
npm install            # also downloads Chromium via Playwright
cp accounts.example.json accounts.json
cp settings/main.example.json settings/main.json   # optional per-account config
```
Edit `accounts.json` (one entry per account) and, optionally, a settings file per
account (any subset of the extension's settings; the rest use defaults).

## First-time login (per account)
Sessions are reused from each account's `profileDir`, so you only log in once:
```bash
node controller.mjs setup main      # opens a window; log in, reach the game, press Enter
```
On a headless VPS, either run `setup` over VNC, or do `setup` on your desktop and
copy the resulting `controller/profiles/<id>` folder to the VPS.

## Run
```bash
node controller.mjs run             # launches all enabled accounts + dashboard
node controller.mjs run --dry-run   # validate config & flow without launching browsers
node controller.mjs list
```
Open the dashboard at `http://127.0.0.1:8899?token=<your token>` to see status
(uptime, adventures, encounters, gold, errors) and Start/Stop each account.

### Headless VPS (xvfb)
Chromium only loads extensions with a real display, so the controller runs
**headful by default**. On a headless VPS, give it a virtual display:
```bash
sudo apt-get install -y xvfb
npx playwright install --with-deps chromium    # browser + system libs
xvfb-run -a node controller.mjs run
```
Do NOT use `--headless` (headless Chromium does not reliably load the
extension - the bot won't run).

## Per-account settings
`settingsFile` points at a JSON file with any subset of the bot's settings
(strategy, modules, webhooks, etc.). The controller merges it over the defaults
and forces `general.enabled` + `general.startOnLoad` so the account auto-starts.
Each account also gets its **own trial/licence** binding (the licence is
device-bound; see the main README - for many accounts on one box use a lifetime
key or the licence server).

## Proxies (recommended for many accounts)
Set `proxy` per account (`http://user:pass@host:port` or `socks5://...`). Running
many accounts from one IP raises ban risk; a proxy per account mitigates it.

## Security
- `accounts.json`, `profiles/` and `settings/*.json` are git-ignored - they stay
  on your machine.
- The dashboard binds to `127.0.0.1` only and requires the token; if you expose
  it, put it behind a tunnel/VPN, never the open internet.

## Notes
- This automates a game and can get accounts banned. Use proxies, keep Humanize
  on, and don't run too many accounts.
- Budget ~150-400 MB RAM per Chromium when sizing the VPS.
- Gameforge login/SSO and the occasional "verify it's you" prompt are handled by
  the one-time `setup` (the session is reused), so passwords are never stored.
