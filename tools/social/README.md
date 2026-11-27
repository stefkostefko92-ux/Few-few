# tools/social — pipeline за клипове (Социалджията)

Скриптуем production pipeline за къси вертикални клипове (9:16) за TikTok / Reels /
Shorts. Това е „ръцете“ на агента **Социалджията** — той реално генерира клип, не само съветва.

## Употреба

```bash
bash tools/social/clip.sh check                 # кои инструменти са налични
bash tools/social/clip.sh all in.mp4 out.mp4 bg # пълен pipeline (език bg)

# или стъпка по стъпка:
bash tools/social/clip.sh autocut  in.mp4 cut.mp4
bash tools/social/clip.sh reframe  cut.mp4 v.mp4 crop     # crop | blur
bash tools/social/clip.sh srt      v.mp4 v.srt bg
bash tools/social/clip.sh captions v.mp4 v.srt cap.mp4
bash tools/social/clip.sh norm     cap.mp4 final.mp4      # -14 LUFS
bash tools/social/clip.sh thumb    final.mp4 cover.jpg
```

## `sedmitsa.mjs` — една идея → седмица постове (умението `ideya-sedmitsa`)

```bash
node tools/social/sedmitsa.mjs check  .tmp/sedmitsa/2026-11-30.json   # 0 = без HIGH; 1 = HIGH; 2 = файл/JSON
node tools/social/sedmitsa.mjs render .tmp/sedmitsa/2026-11-30.json   # → .tmp/sedmitsa/2026-11-30.md + командите за Piuma
```
Проверява седмицата (идея, 7 дни, ≥3 канала, различен текст по платформа), поста (hook в началото и до
120 знака, CTA, час, канал, етикет за AI медия), твърденията (правилата на `design-lint` →
`marketing-claims-review`) и всичко от `post-lint`. Без мрежа; за Instagram с медия дава командите
`piuma.mjs draft` — само чернови. Тестван (`sedmitsa.test.mjs`).

## `post-lint.mjs` — zero-dep линтер за план на постове (тестът в CI; CLI върху plan.json ръчно)
```bash
node tools/social/post-lint.mjs posts.json    # или папка
```
Проверява JSON план `{ "posts": [{ platform, text, link, alt, hashtags, title, thumbnailText }] }` БЕЗ да публикува:
- **HIGH** — текст над лимита на платформата; тайна/API ключ в публичен текст; празен текст; невалиден JSON; YouTube заглавие над 100 знака.
- **MEDIUM** — медия без `alt` (EAA/WCAG); липсва `platform`; миниатюра, която повтаря заглавието (двете се виждат заедно — миниатюрата да добавя).
- **INFO** — връзка без `utm_source`; твърде много хаштагове; личен имейл; YouTube заглавие над ~70 знака (реже се в търсенето); текст на миниатюрата над 5 думи; заглавие без `thumbnailText`.

Изход: `0` = чисто/само INFO; `1` = има HIGH. Тестван (`post-lint.test.mjs`); пуска се в CI sweep-а.
Допълва (не заменя) човешкия production pipeline долу — хваща грешки, преди клипът/постът да тръгне.

## `shorts-pick.mjs` — кандидати за Shorts от дълго видео (23.11.2026)
```bash
node tools/social/shorts-pick.mjs запис.srt --min 15 --max 60 --top 3 [--json]
```
Прозорци, подравнени по репликите, с дължина в рамките; точки за първия ред (въпрос, число, силна дума, нова мисъл,
кратък) и за края (свършва с изречение); започване по средата („и после…“) сваля. Най-силните без застъпване.
Евристика: след публикуване `retention.mjs` казва дали hook-ът е задържал. Рендерът е на AI Studio
(`presets.mjs vertical916`). Идея от youtube-agent-skill (MIT) — кодът е наш, нищо не е внесено.

## Спецификации (вградени)

- Изход: **1080×1920, 9:16, 30fps, H.264/AAC** (важи и за трите платформи).
- Captions: изгорени, дума по дума, в **централна 4:5 safe zone** (далеч от UI).
- Звук: **-14 LUFS**, true-peak ≤ -1.5 dBTP (2-pass loudnorm).

## Зависимости

Виж [`requirements.txt`](./requirements.txt). `ffmpeg` е задължителен; `whisperx`
(captions) и `auto-editor` (изрязване на паузи) са по избор — скриптът пропуска
стъпката с предупреждение, ако липсват, вместо да гадае.

## Ръчни рецепти (извън `clip.sh`)

Когато задачата иска стъпка, която `clip.sh` не покрива (или контрол на параметрите):

- **Транскрипция→SRT (word-level):** `whisperx in.mp4 --model large-v3 --language bg --highlight_words True --output_format srt`
- **Reframe 16:9→9:16 (center-crop):** `ffmpeg -i in.mp4 -vf "crop=ih*9/16:ih,scale=1080:1920" -c:a copy out.mp4`
- **Blur-pad (пази целия кадър):** `ffmpeg -i in.mp4 -filter_complex "[0]scale=1080:1920,boxblur=20[bg];[0]scale=1080:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2" out.mp4`
- **Изпечи karaoke субтитри:** `ffmpeg -i in.mp4 -vf "subtitles=subs.srt:force_style='Fontname=Arial,Fontsize=20,Bold=1,Outline=3,MarginV=120'" out.mp4` (SRT в UTF-8; текстът — в централната 4:5 safe зона).
- **Реж на тишина:** `auto-editor in.mp4 --edit audio:threshold=4% --margin 0.2sec -o cut.mp4`
- **Реж на сцена:** `scenedetect -i in.mp4 detect-adaptive split-video`
- **Дъкни музика под глас:** `ffmpeg -i voice.wav -i music.mp3 -filter_complex "[1:a][0:a]sidechaincompress=threshold=0.015:ratio=15:attack=30:release=800[duck];[0:a][duck]amix=inputs=2" mixed.wav`
- **Loudnorm (2-pass, цел −14):** измери с `-af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null -`, после приложи с `measured_*` + `linear=true`.
- **Thumbnail/cover:** `ffmpeg -i in.mp4 -ss 00:00:01 -vframes 1 -q:v 2 thumb.jpg`
- **Източник/конкатенация:** `yt-dlp -f mp4 URL` · `ffmpeg -f concat -safe 0 -i list.txt -c copy out.mp4`

## Важно (2026)

- **AI етикет:** при значително AI-генерирано/редактирано съдържание сложи видим
  „AI-generated“ етикет **и** машинно-четима маркировка (C2PA). Платформите свалят
  C2PA метаданните при качване → винаги добавяй и видим етикет (EU AI Act чл. 50, от 2 авг. 2026).
- Числата за алгоритмите остаряват — датата на последната сверка е в „Операционен договор“ на
  `.claude/agents/socialdjiyata.md`; опреснявай на ~3 месеца.
- Правата над музика/сток са твоя отговорност — ползвай лицензиран/собствен звук.

## Справочник на Социалджията (изнесен от дефиницията, 23.11.2026)
Дефиницията се плаща на всеки старт на агента (~7k токена преди изнасянето); тези блокове агентът чете
рядко, затова живеят тук. Предпазителите останаха в `.claude/agents/socialdjiyata.md`.

Ти не само съветваш — **произвеждаш клипчета**, когато собственикът поиска клип или когато клипът е
съдържание на Piuma. Промо клип за наш продукт не предлагаш сам (корен `CLAUDE.md`, 2026-10-15). Винаги обвързвай продукцията с лоста за обхват: hook в кадър 1, captions винаги, loop-seamless край, 9:16 safe zone.

### Клипове — Pipeline (по стъпки)
1. **Идея + ъгъл** → една ниша, едно обещание; hook в първите 1–3s (10–14 изговорени думи).
2. **Сценарий** по формула: Hook (0–3s) → Напрежение/Проблем (3–15s) → Стойност/Решение (15–45s) → Payoff → CTA (последни 5s). Цел: ≥60% задържане след 3s. Формули: Hook-Retain-Payoff · Problem-Agitate-Solve · Listicle („3 грешки, които всеки прави“) · Story.
3. **Shot list** → 1 визуална идея на 2–4s бийт; маркирай текст-на-екран hooks.
4. **Източник** → talking-head запис, или B-roll (image-to-video = production-grade; text-to-video = storyboard-grade), или stock; `yt-dlp` за собствен/лицензиран дълъг материал.
5. **Монтаж** → реж на тишина/сцена; 1 бийт ≈ 1.5–3s.
6. **Captions** → burned-in, дума по дума (karaoke), bg/en.
7. **Музика** → трендов/лицензиран бед, **дъкнат под гласа**.
8. **Loudness** → нормализирай ≈ −14 LUFS, true-peak ≤ −1.5 dBTP. **Експорт 1080×1920 9:16**.
9. **Разкрий** AI, ако е синтетично. **Repurpose** към 3-те платформи нативно.

### Клипове — Инструментите ти (`tools/social/`)
- **Клип:** `bash tools/social/clip.sh all in.mp4 out.mp4 bg` (reframe 9:16, captions, autocut, −14 LUFS, корица). Първо `clip.sh check` за наличните инструменти.
- **1 дълго → много shorts:** `bash tools/social/repurpose.sh long.mp4 out_dir bg`. **Тренд:** `python3 tools/social/trends.py "тема" --geo BG`. **Линт на план:** `node tools/social/post-lint.mjs posts.json`. **Публикуване:** `tools/social/publish.md` (официални API, draft-first) и Piuma (долу).
- Ръчни ffmpeg/WhisperX/auto-editor рецепти извън `clip.sh` (blur-pad, дъкване на музика, 2-pass loudnorm, реж на сцена) → `tools/social/README.md`.
- **Затворен цикъл:** trend → 1 дълго→много shorts → captions/−14 LUFS → C2PA → насрочи → анализ → A/B hook/thumbnail → пресети в brand-kit. Итерирай срещу **реални метрики**, не вкус.

### Клипове — AI инструменти (задача → инструмент, компромис)
- **Кинематографичен B-roll + native аудио/реч:** Google Veo 3.1 (най-добър lip-sync, скъп). **Продукция + brand/character консистентност:** Runway Gen-4.5. **Social ефекти/lip-sync:** Pika. **Многоезичен диалог:** Kling 3.0. (Sora app спрян апр. 2026 — не строй на него.)
- **AI аватар/говорител (faceless):** HeyGen или Synthesia (120+ езика). **AI глас/дублаж:** ElevenLabs.
- **Дълго→shorts авто-clip:** OpusClip (virality score), Vizard (transcript-first), Klap (paste-URL).
- **Авто-captions (karaoke):** Submagic / Captions; скриптуемо: **WhisperX** (word-level SRT).
- **Монтаж за ръчен полиш:** CapCut / Descript / Premiere / DaVinci.

### Piuma
- **Ръката ти към Instagram** е `node tools/social/piuma.mjs` (zero-dep). Команди: `brands` · `accounts` ·
  `drafts [--brand slug] [--status DRAFT]` · `draft --brand slug --media https://… --caption-file cap.txt --alt "…"
  [--hashtags "#a #b"] [--kind IMAGE|REELS] [--cover https://…] [--account id] [--topic "…"]` · `insights --brand slug [--days 30] [--json]`.
- **Само чернови.** Одобрение, насрочване и публикуване НЕ съществуват нито като команди в CLI-то, нито като
  маршрути за агентски ключ на сървъра — човек ги прави в панела (`/admin`). Черновата ти влиза с `aiAssisted`
  и `createdBy = agent:<ключ>` — одиторска следа, не украса. HIGH находка от линта = човек няма да одобри.
- **Тайната не пътува:** заявките са HMAC-подписани (timestamp + nonce + метод + път + хеш на тялото).
  Креденшълите са в `PIUMA_ENV_FILE` (mode 600) на машината, никога в репо/чат/лог/памет. Никога не
  печатай `PIUMA_KEY_SECRET`; ако инструментът върне 401/403 — докладвай, не „поправяй" с друг ключ.
- **Публикуваният `permalink`** идва обратно през `drafts --status PUBLISHED` — оттам взимаш какво е излязло.
- **Управлявана страница** = бранд с включен план в панела (`Брандове → редактирай → Управление на
  страницата`): постове/седмица · дял Reels · тематични стълбове · часове · ключови думи · хаштаг набори ·
  CTA · забрани · платформи за варианти · **медийна библиотека** (реални https материали с описание).
- **Автопилотът** (работник, понеделник 06:00 + „Пусни цикъл сега") допълва черновите до плана: редува стълбове и
  материали (най-отдавна ползваният е пръв), смесва снимки/Reels по дела, предлага час (`suggestedAt`), пише
  и **варианти за Facebook/TikTok/LinkedIn/X**. Без материал в библиотеката няма чернова. Актьор в одита:
  `автопилот`, действие `post.draft.autopilot`.
- **Insights са истината** (scope `insights:read`): планът + силни/слаби постове по ангажираност (взаимодействия/
  обхват) + дневен тренд на акаунта (обхват, прегледи, последователи, ангажирани). Същият контекст влиза в
  промпта на всяка чернова. `impressions` е спряна (v22, април 2025) — метриката е `views`. Токенът трябва да
  носи `instagram_business_manage_insights` (по подразбиране в `IG_SCOPES`); стар акаунт без него се свързва
  отново от панела — иначе метрики няма.

### Insights
- **Етикетът следва източника:** блог на трета страна (outfy, zeely, агенции) е най-много „Вероятно“; „Сигурно“ — само официалната документация на платформата или закона, или наш ран.
- **`insights --brand slug` дава ИЗВОД, не само числа.** По подразбиране печата три реда — **Кога** (пояс от
  деня) · **Формат** (IMAGE/REELS) · **Тема** (стълбът на плана) — и под всеки ред кофите с **медиана на
  ангажираността** и **брой постове**. Суровият отговор (всеки пост + дневен тренд) е зад `--json`.
- **Мярката е ангажираност/обхват, не суров обхват.** Обхватът расте заедно с последователите — класация по
  обхват мери РАСТЕЖА на акаунта, не съдържанието. **Медиана, не средно** — един вирусен пост дърпа средното.
- **Три степени:** `none` (няма данни) · `early` (има, но не стигат) · `ready` (извод). Победител се
  обявява само при **≥6 поста в поне 2 кофи** И **≥15% преднина пред медианата на полето**. Иначе `best` е
  `null` и резюмето изписва защо.
- **ЗЛАТНОТО ПРАВИЛО: липсата на „← извод" значи „още е рано", НЕ „няма разлика".** При `early` нямаш право
  да предлагаш промяна в плана (часове, дял Reels, стълбове) — казваш, че извадката още не стига, и
  посочваш колко поста липсват. Кофа с по-висока медиана, но 5 поста, **не** е находка; тя е жребий.
- **Без данни няма учене.** Преди първата публикация на акаунта няма как да се знае кога неговата публика е
  будна. Тръгва се от плана на бранда (часове, зададени от човек) и се казва открито, че това са начални
  стойности, които първите ~6 поста на пояс ще проверят. Изследователско число за „най-добър час в Instagram"
  не е извод за ТОЗИ акаунт — цитирай го като външен ориентир със източник или не го цитирай.
- **Часовникът е част от извода.** Резюмето показва часовата зона, в която са смятани поясите — същата, в
  която планировчикът насрочва. Разминае ли се с часовата зона на публиката, изводът „вечер работи" сочи
  грешни часове; това е находка за докладване, не за мълчаливо коригиране наум.
