# Социални мрежи — промо клиповете

Сценарият и съветите за платформите са на Социалджията (2026-10-09). Реализацията е в
`tools/promo/` (`film-social.html` за вертикалния клип, `film.html` за хоризонталния).

## Файлове (в `dist/`, не се комитват)

| Файл | Формат | За какво |
|---|---|---|
| `supreme-adblock-promo-<версия>-social.mp4` | 1080×1920 (9:16), 21 s, loop, −14 LUFS | Instagram Reels, TikTok, YouTube Shorts, Facebook Reels |
| `supreme-adblock-promo-<версия>-social-4x5.mp4` | 1080×1350 (4:5) | Facebook / Instagram feed (изрез от вертикалния) |
| `supreme-adblock-promo-<версия>-social-cover.png` | 1080×1920 | Корица: мигът на удара + „This ad just died.“ |
| `supreme-adblock-promo-<версия>.mp4` | 1920×1080 (16:9), 43 s | YouTube, сайтът, X, LinkedIn |
| `supreme-adblock-promo-<версия>-store.mp4` | 1920×1080, 35 s | **Само** за Chrome Web Store |

```bash
PW_ROOT=$(npm root -g) PYTHONPATH=<numpy> FFMPEG=$(command -v ffmpeg) node tools/promo/render.mjs --cut social
PW_ROOT=$(npm root -g) PYTHONPATH=<numpy> FFMPEG=$(command -v ffmpeg) node tools/promo/render.mjs              # 16:9
# преглед, без видео: --only-frames --every 6 (всеки 6-и кадър в dist/promo/frames-social/)
```

## Правила

- **„Free“ и генеричният рекламен плейър са само в социалния клип.** В медиите за Chrome Web Store
  не се ползват никога (там е `--cut store`; `tests/store.test.mjs` пази това).
- **„130 of 132“ не влиза във вертикалния клип**, защото надписът с източника на телефон е нечетлив.
  Ползва се само с източник и дата на екрана (хоризонталният клип; отделен пост за X или LinkedIn).
- **Без „best“, „#1“, „fastest“.**
- **Безопасна зона за текста:** x 120–880, y 290–1470; под y 840 нищо важно вдясно от x 780
  (колоната с бутоните). Числата са от рекламни шаблони, а не официални за органични постове.
  Преди първото публикуване провери с чернова в самото приложение.
- **Мълниите** са на ≥ 2 s една от друга (WCAG 2.3.1), гейт в `tests/store.test.mjs`.
- **Етикет за AI не е нужен**: анимация от код, без синтетично лице или глас. В описанието може
  да пише „animation“. Правилата се сменят, затова провери при публикуване.
- **Линкът** е в bio, в закачен коментар или в първия reply. В клипа пише „Search the name.“,
  защото URL в клипа не се кликва.
- **Качване:** нативно във всяка платформа (без watermark на друга). Draft-first: човек одобрява и насрочва.

## Caption-и и хаштагове (EN)

**TikTok**
> Ad blocker for Chrome that catches ads no list knows yet. No account, no telemetry. Free. Supreme AdBlock by Carbon Stealth.

`#adblock #chrome #privacy #browser #techtok`. Линк в bio.

**Instagram Reels**
> Ads stopped at the source. Supreme AdBlock for Chrome, Edge and Brave: no account, no telemetry, free.

`#adblocker #privacy #chromeextension #browsersecurity`. В закачения коментар: „Send this to someone who hates ads.“

**YouTube Shorts.** Заглавие `Ad blocker that catches what lists miss`, описанието като в TikTok.
`#shorts #adblock #chrome #privacy`.

**Facebook** (същият Reel; за feed — 4:5)
> Free ad blocker for Chrome, Edge and Brave. No account, no telemetry.

Без външен линк в самия пост.

**X.** Вертикалният или хоризонталният MP4. Линкът е в първия reply. В първите 30 min отговаряй на
коментарите. `#adblock #privacy`. Тук може и измереното сравнение (хоризонталният клип, с източник и дата).

**LinkedIn** (4:5 или 9:16)
> How a lightning strike became our product demo: Supreme AdBlock by Carbon Stealth.

Линкът е в първия коментар.

**YouTube (дълъг формат).** Хоризонталният клип (43 s).
