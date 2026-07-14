# Памет на агента „AI-джията" (v0.1 — самообучение)

Трайно файлово знание между извикванията (Claude Code субагентите са stateless).
Цикълът е **наложен от hooks** (виж `_memory/PROTOCOL.md`): при старт `SubagentStart`
инжектира „Проверени поуки"; накрая `SubagentStop` добавя новия ```learn блок
(verified → тук; друго → Карантина); `tools/memory/curate.mjs` дедупира и пази от дрейф.
**Закон:** само проверено става факт; източник или нищо; противоречие → стоп (човек решава).

## Проверени поуки (verified)
- **2026-07-14:** Google фиксира версия като `gemini-2.5-flash` спира за НОВИ проекти → `404 NOT_FOUND` „This model … is no longer available to new users". Ползвай „-latest" алиас (`gemini-flash-latest`, `gemini-flash-lite-latest`), който винаги сочи актуалния безплатен Flash — по-издръжлив default от фиксирана версия. Тествай кой модел работи с реален curl към `…/models/<M>:generateContent` преди да заключиш. _("избор/жизнен цикъл на Gemini модел"; verified; "жив curl 404 за gemini-2.5-flash + gemini-flash-latest върна candidates; mastilko/src/app/api/ai/route.ts")_
- **2026-07-14:** Gemini 2.5+/3.x са „thinking" модели по подразбиране; thinking токените се броят срещу `maxOutputTokens` → видимият отговор излиза отрязан (1–2 реда) или празен. За кратки генерации изключи мисленето: `generationConfig.thinkingConfig.thinkingBudget: 0` и вдигни `maxOutputTokens` (напр. 600→1024). _("отрязан/празен Gemini отговор при мислещ модел"; verified; "mastilko/src/app/api/ai/route.ts:113-120 (thinkingBudget:0, maxOutputTokens:1024); жив тест — пълен текст след поправката")_
- **2026-07-14:** Gemini безплатен tier: някои фиксирани модели връщат `429 RESOURCE_EXHAUSTED "limit: 0"` за нови проекти (напр. `gemini-2.0-flash`), докато `-latest` алиасът работи. Условията на Gemini API предвиждат Paid tier за потребители от ЕИП — Google може да ограничи ключа. Не обещавай определен модел без жив тест на конкретния ключ. _("Gemini квота/tier за нови проекти и ЕИП"; verified; "жив curl: gemini-2.0-flash → 429 limit:0; gemini-flash-latest → OK")_
- **2026-07-14:** Формат на ключ: Google AI Studio Gemini API ключ започва с `AIza…` (~39 знака) и се праща в хедър `x-goog-api-key`. `AQ.…`/`ya29.` е OAuth/временен токен — различен механизъм (Bearer), не става за `x-goog-api-key` (макар да може да е валиден за друг път). Ако AI върне грешка, първо тествай самия ключ с curl. _("автентикация към Gemini / формат на ключ"; verified; "жив curl с x-goog-api-key; mastilko route.ts:109-112")_
- **2026-07-14:** `GEMINI_MODEL`/`GEMINI_API_KEY` се четат при ЗАЯВКА (runtime) от сървърния route, не при билд → смяна в `.env` + `systemctl restart`, без нов билд/деплой. Ключът е server-only (mode 600), клиентът никога не говори директно с Google; входът на потребителя се разкрива в поверителност (GDPR, DPF/SCC трансфер + „не въвеждай лични данни" до бутона). _("runtime env за AI route + сигурност/GDPR на ключа"; verified; "mastilko/src/app/api/ai/route.ts:80,103; mastilko/CLAUDE.md (правен контекст Gemini)")_
- **2026-07-14:** Наш сървърен route пред доставчика носи предпазителите: глобален лимит (напр. 120/мин) + per-IP (10/мин) за да пази безплатната квота, `AbortSignal.timeout` (25s), обработка по код (503 без ключ, 429 квота → приятелско съобщение, 502/504 иначе), Zod валидация на входа. Без ключ → 503 и сайтът работи без AI (изящна деградация). _("устойчив дизайн на AI proxy route"; verified; "mastilko/src/app/api/ai/route.ts:15-47,79-149 (прочетен)")_

## Карантина (непроверено — не се чете като факт)
_(празно)_
