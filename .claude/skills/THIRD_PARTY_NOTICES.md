# Външни умения — произход, лицензи и присъди

Всяко външно умение тук е **адаптирано копие**, не внесено наготово. Минало е два независими прегледа без
изпълнение на чужд код (партиди 2026-10-28 и 2026-10-31): първи — Кодаджията и Разбивача; втори, върху
адаптираните копия — Разбивача наново и Правния Разбирач. Партида 2026-11-08 (последните три реда и
karpathy-guidelines) е минала и двата прегледа (втори: Разбивача + Правния Разбирач, 2026-11-08). Партида 2026-11-14 (рийл „30 Claude плъгина“: четирите реда до `archify-diagrams`) — същите два прегледа на 2026-11-14. Партида 2026-11-23 (рийл „Codex plugins + skills“: последните два реда) — същите два прегледа на 2026-11-23. Правните умения от двете партиди ползват общ
„Наш профил“ и общи предпазители (генерирани от един източник). Всеки файл е сверен по sha256 с raw.githubusercontent.com при
закотвения commit. Пътят е описан в `tools/agents/CLAUDE.md` („Външно умение влиза само по този път“).

Всеки променен файл носи видима бележка за промяната в началото си (при Apache-2.0 — изискване на §4(b)); пълният
текст на лиценза е в `LICENSE.txt` или `LICENSE` до всяко умение.

## Вписани

| Умение | Източник @ commit | Лиценз · притежател | Агент |
|---|---|---|---|
| `frontend-design` | anthropics/skills (2026-09-24; commit не е записан — за проверка) | Apache-2.0 · Anthropic | Дизайнера |
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
| `receiving-code-review` | obra/superpowers @ `22f0b463e7a5` · `skills/receiving-code-review` (08.11) | MIT · Jesse Vincent | Изпитателя |
| `discernment-nudge` | anthropics/skills @ `2c5958ecac7c` · `skills/discernment-nudge` (08.11) | Apache-2.0 · Copyright 2026 Anthropic, PBC | AI-джията (само ръчно) |
| `improve-codebase-architecture` | mattpocock/skills @ `4ae2317ddb22` · `skills/engineering/improve-codebase-architecture` (+ `HTML-REPORT.md` → `references/REPORT.md`) + `codebase-design` като `references/` (08.11) | MIT · Matt Pocock | Качествения (само ръчно) |
| karpathy-guidelines → **доктрина, не умение** | multica-ai/andrej-karpathy-skills @ `2c606141936f` · `skills/karpathy-guidelines/SKILL.md` (08.11). README сочи `forrestchang/andrej-karpathy-skills` — вероятно предишно име или притежател на същото хранилище (непотвърдено: GitHub 403/504 на 2026-11-08) | MIT (по SKILL.md:4 и README.md:169-171); носител на правата не е посочен | всички агенти през `PROCEDURE.md` |
| `ponytail-review` (+ режим одит в `references/audit.md`) | DietrichGebert/ponytail @ `96608e078b2d` · `skills/ponytail-review` + `skills/ponytail-audit` (14.11) | MIT · DietrichGebert | Качествения |
| `observability-and-instrumentation` (+ `references/observability-checklist.md`) | addyosmani/agent-skills @ `39b723ceebf8` · `skills/observability-and-instrumentation` + `references/observability-checklist.md` (14.11) | MIT · Addy Osmani | Наблюдателят |
| `deprecation-and-migration` | addyosmani/agent-skills @ `39b723ceebf8` · `skills/deprecation-and-migration` (14.11) | MIT · Addy Osmani | Качествения |
| `ui-ux-pro-max` (каталог + локална търсачка) | nextlevelbuilder/ui-ux-pro-max-skill @ `6ae86f61f520` · `.claude/skills/ui-ux-pro-max/` без тестовете и `validate_data.py` (14.11); данни: метаданни на иконки от `@phosphor-icons/core` 2.1.1 (MIT, по-долу), метаданни от google/fonts и Google Fonts API (без файлове на шрифтове) | MIT · Next Level Builder | Дизайнера |
| `archify-diagrams` | tt-a1i/archify @ `e37848822238` · цялата папка `archify/` (14.11; 187 от 191 сверени файла вградени, каналите за обновления и марки по мрежа махнати — виж бележката на файла и по-долу) | Apache-2.0 · Copyright (c) 2026 tt-a1i (Archify) + (c) 2025 Cocoon AI | Летописецът |
| `model-na-zaplahite` | openai/skills @ `49f948faa925` · `skills/.curated/security-threat-model` (без `agents/openai.yaml`) (23.11) | Apache-2.0 · хранилище на OpenAI; носител не е посочен (`LICENSE.txt:189` е шаблонът), NOTICE в източника няма | Стражата |
| `igrovo-studio` | openai/plugins @ `981b02c0c440` · `plugins/game-studio` — 9 умения слети в едно + 16 справочника; без `scripts/`, `assets/`, `.codex-plugin/`, `agents/openai.yaml` (23.11) | MIT — обявен само в `.codex-plugin/plugin.json` (`"license": "MIT"`, автор OpenAI; sha256 `edd750d7ab6d…`); LICENSE файл в източника няма — нашият `LICENSE` е стандартният текст, произходът е в `NOTICE` | Дизайнера (плейтест — Изпитателя) |

**Какво сменихме навсякъде:** описание на български; „Наши предпазители“ най-отгоре (те печелят пред
останалия текст и оцеляват при компактиране); нищо не се изпълнява, инсталира или записва извън
scratchpad-а; подпис, изпращане и публикуване са на човек. В правните умения конфигурационният
`CLAUDE.md` на оригинала е заменен с раздел „Наш профил“ само за четене, с ЕС/БГ юрисдикция по
подразбиране. Подробният списък е в бележката в началото на всеки файл.

**karpathy-guidelines — преразказ, не копие.** Четирите правила (питай, не гадай · най-простото решение ·
хирургични промени · критерий и проверка) са преразказани със свои думи в `.claude/agents/_memory/PROCEDURE.md`
(фази 1 и 3 на Цикъла, red line (9), Договорът за завършване) и стигат до всеки агент през `agent-doctrine`.
Поправки спрямо оригинала: „невъзможен случай“ се доказва, валидацията на границата и fail-closed са
задължителни; цикълът спира на блокер (хистерезис). Отделна папка в `.claude/skills/` няма — нов булет в
префикса струва ~4k т на вълна, а изведеният таван на `flow-cost` имаше запас 12 т, затова правилата са
вплетени в съществуващите редове: префиксът е 4816 → 4821 т, нетно +5 т (запас 7 т; мерено с
`flow-cost --check` след втория преглед). Оригиналът носи само „license: MIT“ без файл с носителя на авторското право. Дословен цитат
няма; няколко кратки правила са преведени близо до оригинала (`PROCEDURE.md` фази 1 и 3, red line (9) ↔
`SKILL.md:27-28,40-49`), затова пълната MIT бележка е тук, като застраховка:

> MIT License — Copyright (c) the authors of andrej-karpathy-skills (носител не е посочен @ `2c606141936f`).
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
> documentation files (the "Software"), to deal in the Software without restriction, including without limitation
> the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
> to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above
> copyright notice and this permission notice shall be included in all copies or substantial portions of the
> Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
> LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
> SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
> OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
> DEALINGS IN THE SOFTWARE.

**ui-ux-pro-max и Phosphor.** `data/phosphor-icons-upstream.json` и `data/icons.csv` съдържат метаданни (имена,
категории, тагове, без SVG геометрия) от `@phosphor-icons/core` 2.1.1; пълният подбор е съществена част, затова
бележката на Phosphor пътува с каталога. Самите шрифтове не са в каталога: при самостоятелно хостване на избран
шрифт лицензът му (OFL / Apache-2.0 / UFL) стои до файловете.

> MIT License — Copyright (c) 2023 Phosphor Icons.
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
> documentation files (the "Software"), to deal in the Software without restriction, including without limitation
> the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
> to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above
> copyright notice and this permission notice shall be included in all copies or substantial portions of the
> Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
> LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
> SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
> OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
> DEALINGS IN THE SOFTWARE.

**archify-diagrams и вградените му компоненти.** Умението носи собствените си `LICENSE` (Apache-2.0),
`NOTICE`, `LICENSE-MIT` (историческите MIT грантове до commit `25cf3708`) и `THIRD_PARTY_NOTICES.md` —
те пътуват с папката и остават меродавни. Вградени трети страни: **Pele** (`explainer/vendor/pele/`,
MIT · © 2026 kepano); **JetBrains Mono** (`assets/JetBrainsMono-OFL.txt`, SIL OFL 1.1 · © 2020 JetBrains
Mono Project Authors) — вграден като subset през Google Fonts в изведените артефакти; **марки** в
`renderers/shared/generated-brand-marks.mjs` — повечето от Simple Icons 16.28.0 (CC0-1.0 за сбора, но не
за всяка икона), а отделни носят свои условия: **Vue.js** (CC-BY-NC-SA-4.0 — некомерсиално и share-alike),
**Rust** и **Jenkins** (CC-BY-SA-3.0/4.0 — share-alike), **Angular** (CC-BY-4.0), **OpenAI** (само по
бранд-насоките). Пълната таблица по марка е в `THIRD_PARTY_NOTICES.md` на умението. Марките са опционална
авторска идентичност в диаграмата, не заместват типа/цвета/връзките на възела, и внасянето им по мрежа е
изключено в нашия вариант (само вградените пресети по име).

**humanizer и CC BY-SA.** Няколко примера „Before“ в §12–§18 са цитирани (някои съкратени) от
„Wikipedia:Signs of AI writing“ © Wikipedia contributors. Тези откъси, със съкращенията, са под
CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/), не под MIT; атрибуцията е в раздел Source.

## Прегледани и невписани

| Кандидат | Присъда | Защо |
|---|---|---|
| multica-ai/andrej-karpathy-skills · `README.md` | не влиза | Инструктира `curl … >> CLAUDE.md` от `main` (постоянен канал в инструкциите на агента, rug-pull) и `/plugin marketplace add forrestchang/…` — притежател, различен от закотвения `multica-ai`. Взети са само 4-те правила от `SKILL.md`, преразказани. |
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
| DietrichGebert/ponytail · `skills/ponytail` + куките | не влиза | Режим „за цялата сесия“ и куки за много агенти; правилата му вече са в `PROCEDURE.md` (Karpathy, red line 9). Взети са само прегледът и одитът. |
| thedotmack/claude-mem · headroomlabs-ai/headroom · Panniantong/Agent-Reach · mvanhorn/last30days-skill · pbakaus/impeccable | отхвърлени (триаж по README, 14.11) | Телеметрия по подразбиране и облачна синхронизация; прокси пред целия трафик към Claude (против „Claude само в ЕС“); копиране на влезлия логин в Chrome; X с бисквитки и scraping; телеметрия, двоичен файл и Claude с изключен sandbox. |
| affaan-m/everything-claude-code · Egonex-AI/Understand-Anything · Graphify-Labs/graphify · hugohe3/ppt-master · calesthio/OpenMontage · santifer/career-ops | отхвърлени или отложени (триаж по README, 14.11) | Непроверим обем (71 агента, 314 умения) и diff към OpenAI; скъп петагентен конвейер; graphify — отложен, избира LLM доставчик по наличния ключ (вкл. извън ЕС), без измерена нужда; външни доставчици за картинки; AGPL и замразените промо клипове; scraping на кариерни страници. |
| bmad-code-org/BMAD-METHOD · gsd-build/get-shit-done · ayghri/i-have-adhd · leonxlnx/taste-skill | дублират наше (триаж, 14.11) | Процедурата, екипите и веригата план → спецификация → тест; GSD е архивиран (26.06.2026); стилът е нашият терсен; `frontend-design`. |
