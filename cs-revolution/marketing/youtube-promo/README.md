# Промо клип за YouTube — Carbon Stealth VCC

Черновата (animatic) на 75-секундния клип, изцяло на английски: 1920×1080, 30 fps, H.264. Сценарият кадър по
кадър, текстът на гласа и бележките за качване са в документа „Carbon Stealth VCC — сценарий
за рекламен клип в YouTube“ (Claude Docs). Тук е само машината, която прави клипа.

| Файл | Какво прави |
| --- | --- |
| `composition.html` | Целият клип като една страница: `render(t)` нарежда кадъра за време `t` (без CSS анимации — рендерът е детерминистичен). Цветове и шрифтове от сайта (`public/fonts`, `public/brand`). |
| `sites.json` | Продуктите с жив сайт — само за заснемането; в клипа няма линкове към тях. |
| `capture.mjs` + `stitch.py` | Живите кадри: всяка страница на компютър (1440) и телефон (390 @2x), скролирана като от човек. |
| `render.mjs` | Кадрите → `out/frames/*.jpg` → `out/carbonstealth-promo-en.mp4` + `.srt` (ffmpeg). |

```bash
cd cs-revolution/marketing/youtube-promo
node capture.mjs shots sites.json > cap.log && python3 stitch.py cap.log   # живите кадри → shots/
node render.mjs --step 45                                                  # бърз преглед: всеки 45-и кадър
node render.mjs                                                            # целият клип с надписи
node render.mjs --subs 0                                                   # без надписите на гласа
```

Нужни: Node 20+, Playwright с Chromium (`PLAYWRIGHT_MODULE`, `CHROMIUM` при нестандартен път),
ffmpeg, Python 3. `shots/` и `out/` не влизат в репото.

Правила: само реални факти за продуктите; Lift Pilot няма публичен сайт — показва се като чертеж
с печат „В разработка“; значката „Verified Publisher“ цитира текста на Google от Chrome Web Store.
Музика и глас не са в черновата — добавят се при монтажа (виж документа).
