# Външни умения — произход, лицензи и присъди

Всяко външно умение тук е **адаптирано копие**, не внесено наготово. Минало е два независими прегледа без
изпълнение на чужд код (партиди 2026-10-28 и 2026-10-31): първи — Кодаджията и Разбивача; втори, върху
адаптираните копия — Разбивача наново и Правния Разбирач. Правните умения от двете партиди ползват общ
„Наш профил“ и общи предпазители (генерирани от един източник). Всеки файл е сверен по sha256 с raw.githubusercontent.com при
закотвения commit. Пътят е описан в `tools/agents/CLAUDE.md` („Външно умение влиза само по този път“).

Всеки променен файл носи видима бележка за промяната в началото си (Apache-2.0 §4(b)); пълният текст на
лиценза е в `LICENSE.txt` до всяко умение.

## Вписани

| Умение | Източник @ commit | Лиценз · притежател | Агент |
|---|---|---|---|
| `frontend-design` | anthropics/skills (2026-09-24) | Apache-2.0 · Anthropic | Дизайнера |
| `dpa-review` | anthropics/claude-for-legal @ `4a6c651889c9` · `privacy-legal/skills/dpa-review` | Apache-2.0 · Copyright 2026 Anthropic PBC | Правния Разбирач |
| `dsar-response` | същото · `privacy-legal/skills/dsar-response` | Apache-2.0 · Anthropic PBC | Правния Разбирач |
| `pia-generation` | същото · `privacy-legal/skills/pia-generation` | Apache-2.0 · Anthropic PBC | Правния Разбирач |
| `aia-generation` | същото · `ai-governance-legal/skills/aia-generation` | Apache-2.0 · Anthropic PBC | Правния Разбирач |
| `vendor-ai-review` | същото · `ai-governance-legal/skills/vendor-ai-review` | Apache-2.0 · Anthropic PBC | Правния Разбирач |
| `marketing-claims-review` | същото · `product-legal/skills/marketing-claims-review` | Apache-2.0 · Anthropic PBC | Правния Разбирач |
| `use-case-triage` | същото · `privacy-legal/skills/use-case-triage` (31.10) | Apache-2.0 · Anthropic PBC | Правния Разбирач |
| `reg-gap-analysis` | същото · `privacy-legal/skills/reg-gap-analysis` (31.10) | Apache-2.0 · Anthropic PBC | Правния Разбирач |
| `ai-inventory` | същото · `ai-governance-legal/skills/ai-inventory` (31.10) | Apache-2.0 · Anthropic PBC | Правния Разбирач |
| `saas-msa-review` | същото · `commercial-legal/skills/saas-msa-review` (31.10) | Apache-2.0 · Anthropic PBC | Правния Разбирач |
| `nda-review` | същото · `commercial-legal/skills/nda-review` (31.10) | Apache-2.0 · Anthropic PBC | Правния Разбирач |
| `vendor-agreement-review` | същото · `commercial-legal/skills/vendor-agreement-review` (31.10) | Apache-2.0 · Anthropic PBC | Правния Разбирач |
| `stakeholder-summary` | същото · `commercial-legal/skills/stakeholder-summary` (31.10) | Apache-2.0 · Anthropic PBC | Правния Разбирач |
| `oss-review` | същото · `ip-legal/skills/oss-review` (31.10) | Apache-2.0 · Anthropic PBC | Правния Разбирач |
| `ip-clause-review` | същото · `ip-legal/skills/ip-clause-review` (31.10) | Apache-2.0 · Anthropic PBC | Правния Разбирач |
| `humanizer` | blader/humanizer @ `0ef9fe5bc357` | MIT · Siqi Chen; откъсите от Wikipedia — CC BY-SA 4.0 (виж по-долу) | Летописеца, Социалджията |
| `test-driven-development` | obra/superpowers @ `2ce8aa15d05b` | MIT · Jesse Vincent | Изпитателя |
| `seo-geo` | AgriciDaniel/claude-seo @ `6be93f45064f` | MIT · agricidaniel | SEO |
| `seo-hreflang` | същото | MIT · agricidaniel | SEO |
| `pricing` | coreyhaines31/marketingskills @ `0cd9b3a0ef4c` | MIT · Corey Haines | Продавача |

**Какво сменихме навсякъде:** описание на български; „Наши предпазители“ най-отгоре (те печелят пред
останалия текст и оцеляват при компактиране); нищо не се изпълнява, инсталира или записва извън
scratchpad-а; подпис, изпращане и публикуване са на човек. В правните умения конфигурационният
`CLAUDE.md` на оригинала е заменен с раздел „Наш профил“ само за четене, с ЕС/БГ юрисдикция по
подразбиране. Подробният списък е в бележката в началото на всеки файл.

**humanizer и CC BY-SA.** Няколко примера „Before“ в §12–§18 са цитирани (някои съкратени) от
„Wikipedia:Signs of AI writing“ © Wikipedia contributors. Тези откъси, със съкращенията, са под
CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/), не под MIT; атрибуцията е в раздел Source.

## Прегледани и невписани

| Кандидат | Присъда | Защо |
|---|---|---|
| heygen-com/hyperframes | отхвърлен | Продукт от ~9 400 файла, CLI с телеметрия, инсталиране през `npx`; промо клиповете са замразени по решение на собственика. |
| PleasePrompto/notebooklm-skill | отхвърлен | Автоматизира браузър с маскиране (patchright) и пази постоянен Google профил с бисквитки. |
| JuliusBrussee/caveman | отхвърлен | Телеметрия, включена по подразбиране; инсталиране с `curl \| bash`/`npx`; куки, MCP и двоични файлове. Стилът caveman вече е наш. |
| garrytan/gstack | отхвърлен | Кука на UserPromptSubmit праща заявките към външен CLI; телеметрия; ~4 300 файла. |
| openai/codex-plugin-cc | отхвърлен | Праща кода към Codex CLI на OpenAI — против правилото ни Claude само в ЕС. |
| alirezarezvani/claude-skills | отхвърлен | ~14 000 файла и 2 036 умения, Python куки на SessionStart/UserPromptSubmit, `.mcp.json`, zip архиви — не може да се провери. |
| coreyhaines31/marketingskills · `social` | отхвърлен | Агентът насрочва публикации сам; чете LinkedIn/X с влязла сесия (недоверен поток + действащ браузър); масово събиране на профили. |
| coreyhaines31/marketingskills · `analytics` | отхвърлен | Meta Pixel без проверка за съгласие (ePrivacy чл. 5(3)); покупки и `transaction_id` към трети страни. |
| anthropics/skills · `webapp-testing` | отхвърлен | `with_server.py`: увисва при пълен буфер, фалшиво „готов“ при зает порт, оставя процеси сираци и подава низ на `shell=True` (минаваше покрай нашия `guard-dangerous`); казва на агента да пуска скрипта, без да го чете. |
| anthropics/financial-services-plugins | чист, невписан | Нямаме агент или продукт за финансов анализ. |
| coleam00/second-brain-starter | чист, невписан | Лична система за бележки — без съответствие в нашите продукти. |
| antfu/skills | чист, невписан | Умения за стека на antfu (Vue, Nuxt, Pinia, UnoCSS, VitePress); продуктите ни са на Next.js/React/Express, а Vitest и pnpm вече се покриват от Изпитателя и `quality-gate`. |
| rampstackco/claude-skills | чист, невписан | 321 умения, които се застъпват с маркетинговите; добра хигиена, но без нужда. |
