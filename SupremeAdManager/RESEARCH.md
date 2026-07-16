# Проучване: автоматизирана платена реклама (Google Ads · YouTube · Meta) — 2026-07

Синтез от паралелно проучване на 4 агента (Google Ads API, Meta Marketing API,
performance-стратегия от Социалджията, право на ЕС от Правния Разбирач). Всяко твърдение
с източник; „непотвърдено“ = маркирано. Опреснявай на ~3 месеца (API версиите се движат).

---

## 1. Google Ads API (вкл. YouTube)

### Версии и достъп

- **Актуална версия: v24** (22.04.2026); major живее ~1 година (v21 sunset авг. 2026). Каданс: тримесечен major. → строй на v23/v24. [release-notes](https://developers.google.com/google-ads/api/docs/release-notes) · [sunset-dates](https://developers.google.com/google-ads/api/docs/sunset-dates)
- **Протокол**: gRPC preferred, **REST поддържан** (`https://googleads.googleapis.com/v24/customers/{CID}/...`). Headers: `Authorization: Bearer`, `developer-token`, `login-customer-id` (при MCC). Логвай `request-id`. [call-structure](https://developers.google.com/google-ads/api/docs/concepts/call-structure)
- **Node.js**: официална библиотека няма; community `google-ads-api` (Opteo) изостава ~1 версия → **директен REST** е най-чист за нас.
- **Developer token**: само от production MCC → API Center. Нива: Test (15k ops/ден, само test акаунти) → Explorer (2 880 prod ops/ден) → **Basic** (15k, ~5 раб. дни) → Standard (неограничен, RMF изисквания). [access-levels](https://developers.google.com/google-ads/api/docs/api-policy/access-levels)
- **OAuth2**: scope `https://www.googleapis.com/auth/adwords`, web flow с `access_type=offline` (refresh token за server jobs).
- **Test accounts**: отделна йерархия, до 50, не сервират/не харчат, без метрики. Работят с token преди одобрение. [test-accounts](https://developers.google.com/google-ads/api/docs/best-practices/test-accounts)

### Структура и създаване

- Йерархия: Customer → **CampaignBudget (отделен ресурс!)** → Campaign → AdGroup → Ads/Criteria. Суми в **micros** (×1e6).
- Създаване: budget → campaign (`advertising_channel_type`, bidding поле, `network_settings`) → ad groups. Best practice: **всичко в един atomic `GoogleAdsService.Mutate` с временни негативни ID** (-1, -2…). [create-campaigns](https://developers.google.com/google-ads/api/docs/campaigns/create-campaigns) · [mutating best-practices](https://developers.google.com/google-ads/api/docs/mutating/best-practices)
- **Официална препоръка: създавай PAUSED**, активирай след готовност.
- Ново поле: `contains_eu_political_advertising` — **задължителна декларация** (EU регламент за политическа реклама).

### YouTube — критичното ограничение

- **Класически VIDEO кампании са READ-ONLY през API** (нито create, нито update) — само отчети. [video/overview](https://developers.google.com/google-ads/api/docs/video/overview)
- Работещ път: **Demand Gen** (`DEMAND_GEN`) — сервира в YouTube in-stream/in-feed/**Shorts**, Discover, Gmail; ad типове `DemandGenVideoResponsiveAdInfo` (videos + headlines + long_headlines + descriptions + business_name + logos), Carousel, MultiAsset. [demand-gen](https://developers.google.com/google-ads/api/docs/demand-gen/create-campaign) Също PMax (AssetGroup с видео).
- Видео активът е `YoutubeVideoAsset` (`youtube_video_id`) — видеото трябва да е в YouTube. **Ново (v23.1)**: `YouTubeVideoUploadService` — качване направо през API (resumable; PENDING→UPLOADED→PROCESSED). [upload-videos](https://developers.google.com/google-ads/api/docs/assets/upload-videos)
- Demand Gen: бюджетът е **non-shared**; минимум $5/ден enforce от 01.04.2026 (непотвърдено от първоизточник — сверявай).

### Bidding

- Standard (на кампанията): `manual_cpc/cpm/cpv`, `target_impression_share`; Portfolio: `TARGET_CPA`, `TARGET_ROAS`, `MAXIMIZE_CONVERSIONS`, `MAXIMIZE_CONVERSION_VALUE`, `TARGET_SPEND`. PMax: само Maximize Conversions/Value (+опц. target). tCPA = стабилен обем/фиксирана цена; tROAS = e-commerce; Maximize = старт/малко данни. [bidding](https://developers.google.com/google-ads/api/docs/campaigns/bidding/assign-strategies)

### Автоматизация (строиш я сам — API няма auto-rules)

- Отчети: **GAQL** през `SearchStream` (production) / `Search`. 1 заявка = 1 operation.
- Conversion upload: `UploadClickConversions` (gclid/gbraid/wbraid, до 2 000/заявка, `partial_failure: true`). Enhanced conversions: `user_identifiers` (SHA-256 след нормализация), изисква приети customer data terms.
- Keywords: `KeywordPlanIdeaService.GenerateKeywordIdeas` (~1 QPS; не работи на Explorer ниво).
- Лимити: Basic 15k ops/ден; mutate ≤10k операции/заявка; retry с exponential backoff (5s→10s→20s) за TRANSIENT/INTERNAL; дневна квота не се retry-ва.
- **EEA consent**: обект `Consent { ad_user_data, ad_personalization }` (GRANTED/DENIED) във всеки conversion/Customer Match upload — иначе губиш атрибуция/аудитории. [consent](https://support.google.com/google-ads/answer/14310715)

---

## 2. Meta Marketing API (Facebook · Instagram · Threads · WhatsApp)

### Версии и достъп

- **Graph API v25.0** (18.02.2026) актуална; Marketing API версия живее ~1 г. (гаранция „поне 90 дни“). npm SDK (`facebook-nodejs-business-sdk`) изостава (24.0.1) → **директни Graph заявки**. [changelog](https://developers.facebook.com/docs/graph-api/changelog)
- Достъп: Meta App (business use case) → App Review за `ads_management`, `ads_read`, `business_management` (+`pages_manage_ads` за page-ads). **Marketing API Access Tier** (от 05.2026): Limited (default, dev-only, тежък rate limit) / **Full** (App Review; 500+ успешни calls/15 дни, <15% error). [authorization](https://developers.facebook.com/docs/marketing-api/overview/authorization)
- **System Users** (Business Manager): admin SU създава regular SU, scoped към активи; токени 60 дни (препоръка) или never-expire. За чужди клиенти: Tech Provider verification + Facebook Login for Business (BISU токени). [system-users](https://developers.facebook.com/docs/marketing-api/system-users/overview)

### Структура

- `act_<id>` → Campaign → AdSet → Ad; AdCreative е отделен обект. [campaign-structure](https://developers.facebook.com/docs/marketing-api/campaign-structure)
- **ODAX objectives** (единствени за create от v17): `OUTCOME_AWARENESS/TRAFFIC/ENGAGEMENT/LEADS/APP_PROMOTION/SALES`.
- Campaign задължителни: `name`, `objective`, **`special_ad_categories`** (7 стойности: NONE, EMPLOYMENT, HOUSING, CREDIT, ISSUES_ELECTIONS_POLITICS, ONLINE_GAMBLING_AND_GAMING, FINANCIAL_PRODUCTS_SERVICES).
- AdSet: `campaign_id`, `billing_event`, `optimization_goal`, `targeting` (+ `daily_budget`/`lifetime_budget` освен при CBO). `promoted_object` при OFFSITE_CONVERSIONS (`pixel_id` + `custom_event_type`) — **immutable**.
- **Бюджети в minor units** (стотинки) — но account `spend_cap` е в стандартна деноминация (внимание!). Минимуми: `GET /act_<id>/minimum_budgets`. `status` НЕ е PAUSED по подразбиране — **подавай изрично `PAUSED`** (официална препоръка).

### Placements (вкл. Threads и WhatsApp)

- `publisher_platforms`: `facebook`, `instagram`, **`threads`**, `messenger`, `audience_network`. [placement-targeting](https://developers.facebook.com/docs/marketing-api/audiences/reference/placement-targeting)
- **Threads**: `threads_positions: [threads_stream]`; изисква `instagram` в platforms (и IG `stream`). Реклами глобални от 26.01.2026 (~400M MAU).
- **Click-to-WhatsApp (CTWA)**: objectives ENGAGEMENT/SALES/TRAFFIC/LEADS; adset `destination_type: WHATSAPP` + Page със свързан WhatsApp номер; creative `call_to_action { type: WHATSAPP_MESSAGE, value.app_destination: WHATSAPP }`, `link: https://api.whatsapp.com/send`. [click-to-whatsapp](https://developers.facebook.com/docs/marketing-api/ad-creative/messaging-ads/click-to-whatsapp/)
- **WhatsApp Status ads**: пуснати 2025 (само Updates tab, без чат данни); Marketing API поддръжка — непотвърдена.
- **Advantage+**: единна структура (v25 deprecate-ва `smart_promotion_type`); Advantage+ audience = `targeting_automation { advantage_audience: 1 }` (**задължително изрично 0/1 при create от v23**); Advantage+ placements = пропусни `publisher_platforms`. [advantage-campaigns](https://developers.facebook.com/docs/marketing-api/advantage-campaigns/)

### Креативи

- `object_story_spec { page_id, instagram_user_id (НЕ instagram_actor_id — мъртво от 09.2025), link_data | video_data }`; media: `POST /act_<id>/adimages` (base64/multipart → hash), `/advideos` (chunked; poll `status.video_status` до `ready`).
- `asset_feed_spec` (flexible): ≤10 images, ≤5 bodies, ≤5 titles (Dynamic Creative, `is_dynamic_creative=true`, 1 ad/adset). Advantage+ enhancements: `degrees_of_freedom_spec.creative_features_spec` — индивидуални OPT_IN/OPT_OUT (bundle `standard_enhancements` мъртъв от v22).

### Insights и лимити

- `GET /<obj>/insights`: `spend, impressions, reach, frequency, clicks, ctr, cpc, cpm, actions, action_values, purchase_roas`; `date_preset`/`time_range`; breakdowns (age, gender, country, publisher_platform, platform_position…); async (`report_run_id`) за големи обеми. Атрибуция default `7d_click + 1d_view` (view прозорците орязани 01.2026). [insights](https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights/)
- Rate limits (BUC, header `X-Business-Use-Case-Usage`): ads_management standard = **300 + 40×активни реклами**/час; insights = 600 + 400×активни. Грешки 4/17/613/80004/80000 → стоп + изчакай `estimated_time_to_regain_access`. [rate-limiting](https://developers.facebook.com/docs/graph-api/overview/rate-limiting)

### Conversions API (CAPI)

- `POST /<PIXEL_ID>/events`; `user_data` SHA-256 за em/ph/fn/ln…; за website: `client_user_agent + action_source + event_source_url` задължителни. **Дедуп** с browser pixel: `event_name + event_id`, 48ч прозорец. LDU е само за US щати — **не е ЕС механизъм**. [capi](https://developers.facebook.com/docs/marketing-api/conversions-api) · [dedup](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events)

---

## 3. Performance стратегия (какво печели, 2026)

- **Креативът носи 70-80% от performance** (AppsFlyer) — не бюджетът. UGC-style бие polished (~+48% CTR, −26% CPA в Advantage+).
- **Hook 0-3s** решава; YouTube skippable: решението е в първите 5s (skip rate ~65%), бранд преди skip бутона = +40% view-through.
- **Asset обеми**: Meta Advantage+ иска 8-15 наистина различни креатива (+3-5 нови/седмица); Google PMax asset group: 15 headlines (≤30 зн.), 5 long headlines/descriptions (≤90), ≥15 images (1.91:1, 1:1, 4:5), 5 logos, до 15 videos. [pmax asset-requirements](https://developers.google.com/google-ads/api/performance-max/asset-requirements)
- **Текстови лимити Meta** (видими): primary text ~125 зн. преди „Виж повече“ (макс 500), headline ~40 видими (макс 255), description 25.
- **Learning phase (Meta)**: ~50 optimization events/седмица на adset; мин. дневен бюджет = (target CPA × 50) / 7. Значими edits (бюджет >20%, targeting, event) рестартират learning → **консолидация**: 2-3 broad adsets по креативен ъгъл, не по аудитория.
- **Google**: PMax + Search в тандем (Search = intent, PMax = incremental); всяка PMax ≥30 конверсии/месец; 3-7 тематични asset groups.
- **Скалиране**: +20% на 2-3 дни (повече рестартира learning). ABO за тест, CBO за скалиране.
- **Creative fatigue**: frequency предупреждение 2.5, ротирай при >3-3.5; CTR −20-30% под baseline = ротация сега; decay ~10 дни.
- **A/B**: тествай в ред hook/креатив ≫ формат ≫ аудитория ≫ placement; native tools (Meta Experiments / Google experiments); една променлива; мин. данни: 100+ клика (CTR), 20+ конверсии (CPA), $500+ (ROAS).
- **Авто-правила, които си струват**: pause при CPA > 1.5-3× target (мин. $100 spend, извън learning); scale +20% при ROAS > target 3+ дни; fatigue ротация; dayparting. **Внимание**: Meta губи 20-30% конверсии (iOS 14.5+) → без CAPI+dedup авто-правилата убиват печеливши кампании.
- **Микробюджет (€5-20/ден)**: не гони студени конверсии (learning е недостижим); органиката пълни funnel-а (video viewers/engagers/site visitors) → платеното само **ретаргетира** (3-5× по-евтини конверсии). Синергия: Социалджията (органика) → Рекламчика (retargeting).

---

## 4. Право на ЕС (задължително за приложението)

- **Роли**: ние сме обработващ (чл. 28 DPA с клиенти) + съвместен администратор с платформата (C-210/16, C-40/17). Персонализирана реклама = **съгласие** (C-252/21 Meta v. Bundeskartellamt).
- **Consent Mode v2** (задължителен от март 2024 за EEA): `ad_storage`, `analytics_storage`, `ad_user_data`, `ad_personalization`. Meta: consent сигнали → иначе Less Personalized Ads.
- **ePrivacy**: пиксел/SDK = достъп до устройство → съгласие ПРЕДИ изстрелване; **server-side CAPI НЕ заобикаля съгласието** (единен consent gate за client + server; OLG Dresden 02.2026 — обезщетения).
- **Custom Audiences от имейли**: разкриване към трето лице → съгласие + запис на декларацията; **хеширане ≠ анонимизация** (псевдонимизация, GDPR важи изцяло).
- **DSA**: чл. 26(3) — без таргетиране по чл. 9 данни; чл. 28(2) — без профилиране на <18; чл. 26(1) — разкриваеми параметри; чл. 39 — всичко пуснато става публично в ad repository на VLOP. Meta: `dsa_payor` + `dsa_beneficiary` задължителни за ЕС от 16.08.2023.
- **AI Act чл. 50** (в сила 02.08.2026): AI-генерирани креативи → машинно-четима маркировка (C2PA); deepfake → видим етикет. Глоби до €15M / 3%.
- **БГ**: ЗЕТ чл. 5 (разпознаваемост на рекламата), чл. 6 (opt-in за непоискани съобщения); ЗЗП (без заблуждаващи практики). Надзор: КЗЛД, КЗП, КЗК.
- **DPIA** практически задължителна за мащабно рекламно профилиране (WP248: 2+ критерия).

_Пълният правен доклад с всички източници — в одитния доклад на Правния Разбирач (виж
паметта на агентите). Не е правен съвет._

---

## 5. Как проучването е вградено в кода

| Находка                                             | Къде живее                              |
| --------------------------------------------------- | --------------------------------------- |
| PAUSED при създаване (и двете платформи)            | `connectors/*.js` publishCampaign       |
| VIDEO read-only → Demand Gen                        | `googleAds.js channelType()`            |
| Бюджет = отделен ресурс, micros                     | `googleAds.js publishCampaign`          |
| `special_ad_categories` (7 стойности)               | `guard.js` + `metaAds.js`               |
| `threads` изисква `instagram`                       | `metaAds.js publisherPlatforms()`       |
| CTWA (`WHATSAPP_MESSAGE`, api.whatsapp.com/send)    | `metaAds.js`                            |
| `dsa_payor`/`dsa_beneficiary` на adset              | `metaAds.js`                            |
| `targeting_automation.advantage_audience` изрично   | `metaAds.js`                            |
| Consent gate за EEA                                 | `guard.js checkCampaign()`              |
| DSA <18 блокада                                     | `guard.js`                              |
| AI Act разкриване                                   | `guard.js` + кампанийната форма         |
| Auto-rule прагове (CPA 2×, ROAS 3д, freq 3.5, ±20%) | `rules.js RECOMMENDED_RULES`            |
| Rate limit кодове 17/613/80004 retryable            | `metaAds.js call()`                     |
| Дневен спирачен праг (платформите харчат до 2×)     | препоръчано правило в `routes/index.js` |

---

## 6. OSS prior art (GitHub, проверено 2026-07-12) — какво заимствахме

Дизайнът ни (PAUSED-first, dry-run, одит, твърди тавани) съвпада 1:1 с най-добре приетите
нови инструменти ([meta-ads-cli](https://github.com/attainmentlabs/meta-ads-cli): PAUSED
by default, `--dry-run`, env бюджетен таван, JSONL одит; [meta-ads-kit](https://github.com/TheMattBerman/meta-ads-kit),
273★: monitor → detect → предложение → човешко одобрение). Заимствано в `rules.js`:

- **CTR-спад спрямо себе си** (fatigue): `ctr_drop_pct` ≥25% спрямо предишния прозорец → аларма (meta-ads-kit праг −20%).
- **„Кървяща“ кампания**: CTR < 1% при наличен разход → пауза преди CPA изобщо да съществува.
- **Pacing аларма**: разход днес > 1.15× бюджета → ранно предупреждение (ads-monitor ±15%),
  преди твърдата 1.5× спирачка.

Референции за следващи стъпки (в `_proposals/v2.0.md`):

- [Opteo/google-ads-api](https://github.com/Opteo/google-ads-api) (335★, 231k сваляния/седмица): lifecycle hooks (`onMutationStart/Error/End`) + атомарни мутации с временни ID.
- [google/ads-api-report-fetcher (gaarf)](https://github.com/google/ads-api-report-fetcher): GAQL заявки като отделни файлове с макроси.
- [google-marketing-solutions/ads-monitor](https://github.com/google-marketing-solutions/ads-monitor) + [ads-policy-monitor](https://github.com/google-marketing-solutions/ads-policy-monitor): аномалии по „същия ден от седмицата“ + следене на disapprovals/policy статуси — най-честият тих фал.
- Meta **native automated rules** (`adrules_library`) като backstop при паднал наш scheduler (обхват на метриките — непотвърден).
- [stape-io/unique-event-id-variable](https://github.com/stape-io/unique-event-id-variable): каноничният pixel↔CAPI dedup pattern (едно `event_id`, генерирано веднъж).
- [fivetran/dbt_ad_reporting](https://github.com/fivetran/dbt_ad_reporting): schema-еталон за нормализиране на метрики между платформи.
- Официален [googleads/google-ads-mcp](https://github.com/googleads/google-ads-mcp) (731★) — агентът може да чете акаунти директно през MCP.

## 7. Интелигентен слой (проверено 2026-07-16) — вградено в `intel.js` / `optimizer.js` / `insights.js`

Второ GitHub проучване (оптимизационни алгоритми + креативен/insights слой). Всичко
по-долу е **имплементирано от нулата по идеите/формулите** — код не е копиран (част от
източниците са GPL: само идеи, никога код).

| Какво                                                                                                                                         | Източник (лиценз)                                                                                                                                             | Къде при нас                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Robust z-score аномалии: z = 0.6745·(x−med)/MAD, праг 3.5 (Iglewicz–Hoaglin), базлайн „същият ден от седмицата“, под за обем                  | [ads-monitor](https://github.com/google-marketing-solutions/ads-monitor) (Apache-2.0) + класическата статистика                                               | `intel.js detectAnomalies` → одит `anomaly` (дедупликиран)                        |
| Месечен pacing: target_to_date = B·elapsed/total, аларма при ±15%, самокоригиращ дневен таргет                                                | LinkedIn KDD'14 „Budget Pacing for Targeted Online Advertisements“ + ads-monitor праг                                                                         | `intel.js monthlyPacing` (env `GUARD_MONTHLY_BUDGET`) → одит `pacing_alert`       |
| Свръхдоставка: платформите харчат легално до 2× дневния бюджет в отделен ден                                                                  | Google/Meta документация за overdelivery                                                                                                                      | `intel.js overdeliveryDays`                                                       |
| EWMA прогноза (α=0.3) + адитивна сезонност по ден от седмицата                                                                                | Holt-Winters семейството (обществено достояние)                                                                                                               | `intel.js forecastSpend`                                                          |
| Thompson sampling (Beta-Bernoulli) за бюджетна алокация: informative prior от акаунтния CVR (~20 псевдо-клика), препоръки-only, клампове ±20% | Академичната литература + OSS bandit имплементации (идеи)                                                                                                     | `optimizer.js recommendBudgets`; прилагане само от човек през `checkBudgetChange` |
| Унифициран петорен метрик-стандарт: spend/impressions/clicks/conversions/conversion_value                                                     | [dbt_ad_reporting](https://github.com/fivetran/dbt_ad_reporting) (Apache-2.0)                                                                                 | `insights.js weeklyDigest` + `/digest`                                            |
| Седмичен дайджест: PoP срещу същите дни от седмицата + „какво се промени“ от одитната следа                                                   | [meta-ads-kit](https://github.com/TheMattBerman/meta-ads-kit) (брифинг патърн), [NotFair](https://github.com/nowork-studio/NotFair) (change attribution идея) | `insights.js weeklyDigest`                                                        |
| Гама/Бета семплиране: Marsaglia–Tsang (2000) + mulberry32 PRNG (инжектируем за тестове)                                                       | Публикуваният алгоритъм; mulberry32 е public domain                                                                                                           | `optimizer.js`                                                                    |

Отложено за v2.0 (`_proposals/v2.0.md`): пер-креативна умора (иска ad-level метрики,
каквито не съхраняваме) и „асистент за рекламни текстове“ по двустъпковия
[copycat](https://github.com/google-marketing-solutions/copycat) (Apache-2.0) патърн
Style Guide → few-shot (Gemini ключ като опционален env, както в mastilko/linketto).
