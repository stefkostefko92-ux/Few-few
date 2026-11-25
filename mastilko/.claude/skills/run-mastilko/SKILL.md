---
name: run-mastilko
description: Пуска mastilko (Next.js 16, Turbopack) локално за проверка на промяна по работещото приложение — редакторите на етикети/визитки/CV на порт 3000, без база и без тайни. Ползвай при „пусни mastilko“, „провери редактора в браузър“, „скрийншот на /etiketi“, преди да обявиш UI промяна за готова.
---

# Пускане на mastilko за проверка (проверено 2026-10-31, Node 22, Next 16.3.5)

Няма база и няма seed; потребителското съдържание е в localStorage. Без ключове всичко работи, освен AI (`/api/ai` → 503) и админ входа.

## 1. Инсталиране и старт (от `mastilko/`)

```bash
npm ci
GEMINI_MODEL=gemini-flash-latest nohup npm run dev > <scratchpad>/mastilko.log 2>&1 &
```

Env от `.env.example`: само `GEMINI_MODEL=gemini-flash-latest`. `GEMINI_API_KEY` и `SESSION_SECRET` остават празни (тайни, не се измислят). Не копирай `.env`.

## 2. Готовност

Лог: `✓ Ready in …ms`, `Local: http://localhost:3000`. Първата заявка към всяка страница компилира (бавна), после е бърза.

## 3. Проверка

Проверени кодове: `/` 200 · `/etiketi` 200 · `/vizitki` 200 · `/cv` 200 · `/api/banners` 200 · `/admin` 307 (към вход, без сесия) · `/api/ai` с GET 405.

Редактор с Playwright: `goto /etiketi` → `getByRole('textbox').first().fill('…')` → текстът се появява в `.print-area` (24 етикета на А4 лист). При 390 px — без хоризонтален скрол.

## 4. Спиране

`pkill -f "[n]ext dev"; pkill -f "[n]ext-server"` — скобите са задължителни (иначе pkill убива и собствената обвивка). Провери: `curl localhost:3000/` → connection refused.

## Капани

- **`next dev` пише в `mastilko/CLAUDE.md`**: добавя блок `<!-- BEGIN:nextjs-agent-rules -->…<!-- END:nextjs-agent-rules -->` (виждаш го в `git diff`). След спиране махни точно този блок (или не го комитвай по грешка с несвързана промяна).
- Предупреждение при старт: файлът `middleware` е остарял в полза на `proxy` — очаквано, не е грешка.
- В dev конзолата има 2 очаквани „грешки“ (не са регресия): `eval() is not supported` (CSP от `next.config.mjs` без `unsafe-eval`, само в dev) и hydration mismatch на `<html className>` (шрифтови класове). За чиста конзола проверявай срещу `npm run build && npm start` (не е пускано в тази рецепта).
- `waitUntil: 'networkidle'` не ползвай; чакай по състояние (`getByRole`, `.print-area`).
- Админ панелът иска `SESSION_SECRET` и `data/admins.json` — тук не е пускан.
- Качествената порта е отделна: `npm run lint && npm run typecheck && npm test`.
