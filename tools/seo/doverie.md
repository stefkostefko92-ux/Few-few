# Доверие и авторитет на нашите сайтове — плейбук (24.11.2026)

Собственик: **SEO агентът** (видимост, схема, страници за доверие, външни профили). Правните граници (отзиви, значки,
импресум, медицински твърдения): **Правният Разбирач**. Проучване на двамата на 24.11.2026 с първоизточници (виж
„Източници“); базовата линия е от `node tools/seo/trust-check.mjs`. Не е правен съвет.

## 1. Какво значи „доверие“ — без митове

- **Trust е най-важният елемент на E-E-A-T** (Search Quality Rater Guidelines, 11.09.2025, стр. 27). Репутацията се съди
  по **независими източници** (новини, форуми, професионални общности, `[марка -site:марка]`), не по това, което сайтът
  казва за себе си (стр. 22–23). Сайт с лични или финансови данни **без** информация кой отговаря и без контакт е
  „Lowest“ (стр. 35–36).
- **E-E-A-T не е ранкинг фактор** (Google: „E-E-A-T itself isn't a specific ranking factor“); оценителите не местят
  страници („No single rating can directly impact…“, стр. 6). Затова не обещаваме класиране от bio или markup.
- Работи **проверимата идентичност** (кой, как се свързваш, регистрирано дружество) плюс **трети страни, които говорят за
  нас**. Първото е изцяло в наши ръце и е най-бързо; второто иска време.
- **AI отговорите:** Google няма специална markup за AI, `llms.txt` се игнорира, „неавтентични споменавания“ не помагат.
  Споменаванията в трети източници корелират с AI видимостта (Ahrefs, 12.2025; YouTube ~0,74), но това е корелация.

## 2. Базова линия — `trust-check` на 24.11.2026

Твърд провал (✘) = вреди на доверието или нарушава правило; бележка (!) = липсващ сигнал.

| Сайт | ✘ Твърди | ! Бележки |
|---|---|---|
| carbonstealth.eu | — | security.txt (Expires е 13 месеца напред) |
| zabobovdol.carbonstealth.eu (YMYL) | — | sameAs, ЕИК/ДДС |
| supremebot.carbonstealth.eu | Контакт | За нас, Правна инф. |
| adblock.carbonstealth.eu | Контакт | Правна инф. |
| korpora.carbonstealth.eu | Контакт | лого, За нас, security.txt |
| piuma.carbonstealth.eu | Контакт | sameAs, ЕИК/ДДС, За нас, security.txt |
| nexus.carbonstealth.eu | Контакт, Поверителност | sameAs, лого, За нас, Правна инф., security.txt, видим контакт |
| gaming.carbonstealth.eu | Контакт | @id, контакт в схемата, ЕИК/ДДС, HSTS, security.txt |
| mastilko-bg.com | — | лого, За нас, security.txt, видим контакт |
| vizitka-bg.com | — | sameAs, За нас, security.txt, видим контакт |
| eternaltouch.it | — | ЕИК/ДДС |
| evanita-bg.com | Поверителност | Правна инф. |
| ospedalitrasparenti.it (YMYL) | контакт в схемата, Контакт | ЕИК/ДДС, HSTS, security.txt |
| panevascensori.it | — | sameAs, За нас, Правна инф. |
| www.scuolabulgaramilano.it | няма организация в схемата, Поверителност | Правна инф., HSTS, security.txt |

**Извън обхвата (собственик, 24.11.2026):** medqr, minyor и kebab — няма деплой засега, не се проверяват
(`skip` в `tools/seo/sites.mjs`; `trust-check` и `live-check` ги пропускат, изричен домейн пак ги проверява).

Наблюдения:
- „Контакт“ е твърд провал в 7 сайта, „Поверителност“ в 3 — в повечето случаи страниците съществуват, но не са
  свързани от началната страница (провери footer-а).
- **Поправка 24.11.2026:** четири от „Контакт“ провалите бяха фалшиви — adblock, korpora, piuma и gaming имат `mailto:` от
  началната, а `trust-check` търсеше само думата „контакт“ (поправено, регресия в теста). Остават supremebot и nexus
  (едностранични приложения — връзките се рисуват в браузъра), ospedalitrasparenti е поправен в main (PR #471, чака деплой).

## 3. План

### Първите 14 дни (собствените пропуски — бързо и изцяло в наши ръце)

| # | Какво | Къде | Ефект · Усилие |
|---|---|---|---|
| 1 | **Контакт + Поверителност свързани от началната** на всеки сайт с ✘ | supremebot, nexus (контакт); nexus, evanita, scuolabulgara (поверителност) | ↑ · ниско |
| 2 | **Един субект за Carbon Stealth VCC:** устойчив `@id`, `legalName`, `vatID` (BG208725180), `logo`, контакт, `sameAs` само към реални профили; продуктите — `parentOrganization` към хъба | `@/lib/seo` на всеки продукт | ↑ · средно |
| 3 | **YMYL:** отговорно лице, пълен контакт, методология, дати, източници, корекции (ospedalitrasparenti — контакт и в схемата) | ospedalitrasparenti, zabobovdol | ↑ · средно |
| 4 | **Google Business Profile + Bing Places** само при реален обслужван адрес (не виртуален офис), еднакъв NAP | evanitasport, eternaltouch, panev, scuolabulgara | ↑ · ниско |
| 5 | **`security.txt`** (Contact + Expires под година, RFC 9116) и HSTS ≥ 6 месеца | 8 сайта без security.txt, 1 с Expires над година; 3 без HSTS | хигиена · ниско |
| 6 | **Базова линия на измерването:** брандови заявки в GSC, Bing Webmaster Tools „AI Performance“ (цитирания в Copilot), ръчен тест с 20 въпроса към ChatGPT/Perplexity/Claude/AI Mode | `tools/seo/gsc.mjs` | измерване · ниско |
| 7 | **Твърдение за конкурент** с дата и архивна връзка или махане | `SupremeDiscordBot/frontend/src/data/growthContent.js:63` | правен риск · ниско |

### 30–90 дни (трети страни — авторитет)

- **Данни, които другите цитират:** ospedalitrasparenti — методология, CSV/JSON за теглене, лиценз, контакт за журналисти;
  прессъобщения към независими редакции (без платени връзки).
- **Местни регистри, камари, браншови асоциации** в BG и IT (безплатни и по същество; конкретните — свери на живо).
- **Професионални общности и партньори** — най-силното доказателство за YMYL (QRG стр. 22).
- **Отворен код и малки инструменти** с честни връзки към продукта (без линк като условие в лиценза).
- **YouTube и общности** (Reddit, форуми) с открито авторство — без подставени профили.
- **Wikidata само за дружеството** и само при независими източници; Wikipedia — не.

### Не правим

Купени или разменени връзки, PBN, масови директории, линк като условие в лиценза; измислени, „примерни“, купени или
стимулирани без разкриване отзиви; значки и „одобрено/сертифицирано от“ без да е вярно; „E-E-A-T bio“ без реален човек;
масови AI страници; `llms.txt` като мярка за Google.

## 4. Правни граници (Правният Разбирач, 24.11.2026)

| Сигнал | Правим | Не правим / само ако |
|---|---|---|
| **Отзиви** (в сила от 28.05.2022) | Реални отзиви + кратко как се проверяват („събрани от Google, не ги проверяваме“); и отрицателните | Не: измислени, „примерни“, купени, от служители като клиенти. „Проверен клиент“ само при реална проверка. Стимул само ако не насочва към положителна оценка и е обявен (AGCM, 19.10.2026). Основание: Дир. 2005/29 изм. с 2019/2161 (чл. 7(6), Прил. I т. 23б–23в); BG ЗЗП чл. 68ж т. 26–27; IT Codice del consumo чл. 22(5-bis), 23(1)(bb-ter, bb-quater)|
| **Препоръки с име и снимка** | С писмено, оттегляемо съгласие (GDPR чл. 6(1)(а), 7; в IT и чл. 96 L. 633/1941) | Здравни данни — изрично съгласие по чл. 9(2)(а); деца — родителско съгласие под 14 г. |
| **Значки, „№1“, сравнения** | Значки, които наистина имаме; „хостинг в ЕС“, ДДС във VIES | Не: значка за доверие/качество без разрешение (всякаква), „одобрено от X“ без да е; етикет за устойчивост без схема (от 27.09.2026). „№1“ само с актуално доказателство; сравнение само по проверими характеристики (Дир. 2006/114 чл. 4) |
| **Идентичност** | Импресум: име и форма, адрес, имейл, ЕИК и регистър, ДДС (BG ЗЕТ чл. 4; IT D.Lgs. 70/2003 чл. 7 + REA); DSA точки за контакт и правила за модериране за FiveM/директории | Не: фалшиви или примерни идентификатори |
| **ospedalitrasparenti** | Истина + обществен интерес + умерен тон; „indicatore, non prova“ до оценката; видима връзка за поправка | — |
| **AI** | Чатботът казва, че е AI (AI Act чл. 50(1)); „Как ползваме AI“ като сигнал за доверие | AI текст по обществен въпрос без реален човешки преглед → етикет (чл. 50(4)) |

## 5. Измерване

| Показател | Как | Честота |
|---|---|---|
| Сигнали на сайта | `node tools/seo/trust-check.mjs --json` (✘ → 0) | при всеки деплой |
| Брандови заявки | `tools/seo/gsc.mjs` (заявки с „carbon stealth“ и името на продукта) | седмично |
| Цитирания в Copilot | Bing Webmaster Tools → AI Performance | месечно |
| Нови референтни домейни | GSC „Links“, Bing Webmaster Tools | месечно |
| Споменавания без линк | `"марка" -site:марка` (методът на QRG), Alerts | месечно |
| AI цитиране (тренд) | фиксирани 20 въпроса към ChatGPT, Perplexity, Claude, AI Mode — дали и кои URL | месечно |

## Източници

- Google: [Search Quality Rater Guidelines 11.09.2025](https://services.google.com/fh/files/misc/hsw-sqrg.pdf) ·
  [helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) ·
  [spam policies](https://developers.google.com/search/docs/essentials/spam-policies) ·
  [review snippets](https://developers.google.com/search/docs/appearance/structured-data/review-snippet) ·
  [Organization](https://developers.google.com/search/docs/appearance/structured-data/organization) ·
  [AI features](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) ·
  [Knowledge panel](https://support.google.com/knowledgepanel/answer/9163198) ·
  [Business Profile](https://support.google.com/business/answer/3038177)
- [Bing AI Performance](https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview) ·
  [RFC 9116](https://www.rfc-editor.org/rfc/rfc9116) · [Wikidata notability](https://www.wikidata.org/wiki/Wikidata:Notability) ·
  [Ahrefs, AI brand visibility](https://ahrefs.com/blog/ai-brand-visibility-correlations/)
- Право: [Дир. 2005/29 Прил. I](https://www.legislation.gov.uk/eudr/2005/29/annex/I) ·
  [Дир. 2019/2161 чл. 3](https://www.legislation.gov.uk/eudr/2019/2161/article/3) ·
  [Дир. 2006/114 чл. 4](https://www.legislation.gov.uk/eudr/2006/114/article/4) ·
  [ЗЗП (kik-info)](https://kik-info.com/normativna-baza/zakoni/zzp/) ·
  [Codice del consumo чл. 22](https://www.brocardi.it/codice-del-consumo/parte-ii/titolo-iii/capo-ii/sezione-i/art22.html), [чл. 23](https://www.brocardi.it/codice-del-consumo/parte-ii/titolo-iii/capo-ii/sezione-i/art23.html) ·
  [AI Act чл. 50 FAQ](https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act)
- Непроверено (за сверка): точният номер на члена в ЗЗП за информацията как се проверяват отзивите; санкцията по ЗЗП;
  конкретните BG/IT регистри и камари.
