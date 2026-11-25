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

## Българският клип (53 s, YouTube 16:9 + Facebook 4:5)

`composition-bg.html` + `music-bg.py` + `sites-bg.json`: изцяло на български, 140 BPM — всеки удар в
картината пада на удар в музиката (мрежата на тактовете е една и съща в двата файла). Музиката е
синтезирана от нулата (без семпли), рендерът я изравнява до −14 LUFS. Без проблясъци над 1 на такт.

```bash
CAPTURE_LANG='bg-BG,bg;q=0.9,en;q=0.7' node capture.mjs shots sites-bg.json > cap.log && python3 stitch.py cap.log
python3 music-bg.py out/music-bg.wav                       # нужен numpy
node render.mjs --comp composition-bg.html --w 1920 --h 1080 --name carbonstealth-promo-bg-16x9 --audio out/music-bg.wav
node render.mjs --comp composition-bg.html --w 1080 --h 1350 --name carbonstealth-promo-bg-4x5  --audio out/music-bg.wav
```

**С песен от Suno** (2:39, 140 BPM) вместо синтезираната: `suno-assemble.py` сглобява 30 такта от песента —
откъси, закотвени на точния момент, в който влиза всеки удар (Suno леко ускорява между частите, затова
всеки откъс се мери поотделно), и пише ударите на готовия микс в `suno-sync.json` за тресенето на камерата.
Песента не е в репото (права по плана на Suno).

```bash
ffmpeg -i song.mp3 -ac 2 -ar 48000 song48.wav
python3 suno-assemble.py song48.wav out/music-suno.wav suno-sync.json
node render.mjs --comp composition-bg.html --sync suno-sync.json --w 1920 --h 1080 --name suno-16x9 --audio out/music-suno.wav
```

Chrome Web Store страницата срива headless браузъра — сцената „Established Publisher“ показва
секцията от нашия сайт adblock.carbonstealth.eu, която го казва.

Правила: само реални факти за продуктите; Lift Pilot е в бета (liftpilot.carbonstealth.eu, само на италиански) — живият сайт с печат „Beta“;
значката „Verified Publisher“ цитира текста на Google от Chrome Web Store.
Музика и глас не са в черновата — добавят се при монтажа (виж документа).
