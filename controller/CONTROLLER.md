# Tanoth Multi-Account Controller (self-hosted)

Run several Tanoth accounts at once on **one machine you control** (your PC or a
VPS) — each in its own Chromium profile with the extension loaded, its own
settings and optional proxy — and watch them from a small local dashboard. You
run it yourself; logins stay in per-account profile folders on your box.

## Requirements
- Node.js 18+
- On a **headless VPS**: a virtual display (`xvfb`) — Chromium needs a display to
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
```bash
sudo apt-get install -y xvfb
xvfb-run -a node controller.mjs run
```
(Playwright headless="new" also loads extensions on most setups; xvfb is the
reliable fallback.)

## Per-account settings
`settingsFile` points at a JSON file with any subset of the bot's settings
(strategy, modules, webhooks, etc.). The controller merges it over the defaults
and forces `general.enabled` + `general.startOnLoad` so the account auto-starts.
Each account also gets its **own trial/licence** binding (the licence is
device-bound; see the main README — for many accounts on one box use a lifetime
key or the licence server).

## Proxies (recommended for many accounts)
Set `proxy` per account (`http://user:pass@host:port` or `socks5://…`). Running
many accounts from one IP raises ban risk; a proxy per account mitigates it.

## Security
- `accounts.json`, `profiles/` and `settings/*.json` are git-ignored — they stay
  on your machine.
- The dashboard binds to `127.0.0.1` only and requires the token; if you expose
  it, put it behind a tunnel/VPN, never the open internet.

## Honest caveats
- This automates a game; it can get accounts banned. Use proxies, sane delays
  (Humanize on) and modest account counts.
- ~150–400 MB RAM per Chromium, so size the VPS accordingly.
- Gameforge login/SSO and occasional "verify it's you" prompts are handled by the
  one-time manual `setup` (session reuse), not by storing passwords.
