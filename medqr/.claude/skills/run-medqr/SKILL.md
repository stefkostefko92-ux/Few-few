---
name: run-medqr
description: Пуска medqr локално за проверка на промяна по работещото приложение (не само по тестовете) — Express + EJS + SQLite, порт 3000, health /healthz, демо профил със спешен изглед /e/<token>. Ползвай при „пусни medqr“, „провери промяната в браузър“, „направи скрийншот на спешния изглед“, преди да обявиш UI/маршрутна промяна за готова.
---

# Пускане на medqr за проверка (проверено 2026-10-31, Node 22, `.nvmrc`=22)

Стек: Node ESM, Express, EJS, better-sqlite3. Няма build стъпка, няма seed.

## 1. Инсталиране и старт (от `medqr/`)

```bash
npm ci
export ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")  # еднократен, локален; не е тайна от репото
export PORT=3000
export PUBLIC_BASE_URL=http://localhost:3000
export DB_PATH=<scratchpad>/medqr.sqlite     # извън репото; иначе data/medqr.sqlite
unset NODE_ENV                                # НЕ production (иначе HTTPS пренасочване и Secure бисквитки)
nohup npm start > <scratchpad>/medqr.log 2>&1 &
```

Env са по `.env.example`: `PORT`, `PUBLIC_BASE_URL`, `ENCRYPTION_KEY`, `DB_PATH`. `NODE_ENV=production` от `.env.example` НЕ се ползва локално. Никакъв реален `.env`, никакви SMTP данни — без `SMTP_HOST` писмата само се логват.

## 2. Готовност

Лог: `MedQR слуша на http://0.0.0.0:3000`; `curl -sS -o /dev/null -w "%{http_code}" localhost:3000/healthz` → 200 (има и `/health`).

## 3. Вътрешна страница: демо профил (няма seed)

Спешният изглед иска профил, създава се през UI с ПРИМЕРНИ данни (никога реални медицински):
Playwright: `/register` (полета `full_name`, `email`, `password` >=10 знака, чекбокс `consent`) → пренасочва към `/dashboard` → `/profile/edit` (`blood_type`, `allergies`, `emergency_contact_name`) → запис води към `/dashboard?saved=1`.
Токенът за спешния адрес е в колоната `profiles.emergency_token` (не е криптиран); чете се с `better-sqlite3` само за четене от `DB_PATH`.

Проверени кодове: `/` 200 · `/healthz` 200 · `/login` 200 · `/e/<token>` 200 (показва „СПЕШНА МЕДИЦИНСКА ИНФОРМАЦИЯ“, кръвна група, алергии, контакт) · `/e/nevaliden` 404 · `/sos` без вход 302.
Конзолата на Playwright при този поток: нула грешки, нула 4xx/5xx.

## 4. Спиране

`pkill -f "[n]ode src/server.js"` — скобата в `[n]` е задължителна: без нея pkill убива и собствената обвивка (изход 144). Провери: `curl localhost:3000/healthz` → connection refused. DB файлът е в scratchpad-а, репото остава чисто.

## Капани

- Без `ENCRYPTION_KEY` извън production се ползва дев ключ с предупреждение; задай го, за да е предвидимо.
- Нов `DB_PATH` на всеки ран = свежа БД; повторна регистрация със същия имейл дава 409.
- `/sos` и `/dashboard` изискват вход (302 към `/login`).
- `npm run test:webauthn` не е част от рецептата: пакетът `playwright` не е в devDependencies (глобален е в средата).
- `npm ci` е бърз; `npm audit` предупрежденията са очаквани и не са блокер за старта.
