# tools/video — видео студиото на AI Studio

Справочникът на агента **AI Studio** (`.claude/agents/ai-studio.md`). Целевата машина е компютърът на
собственика: **Windows + NVIDIA**. Всичко тук е без зависимости, само Node.

| Файл | За какво |
| --- | --- |
| `doctor.mjs` | Готово ли е студиото: версии, енкодери (NVENC, DNxHR, ProRes), loudnorm, GPU, Blender, Resolve. Само чете. |
| `presets.mjs` | Готови команди за FFmpeg: YouTube 4K60, мастер за Resolve, loudnorm на два прохода, PNG кадри → видео, 9:16. Масиви за `spawn`, никога shell. |

## 1. Инсталиране (Windows + NVIDIA)

PowerShell. id-тата са сверени в `microsoft/winget-pkgs` на 23.11.2026.

```powershell
winget install OpenJS.NodeJS.LTS
winget install Gyan.FFmpeg                 # пълната компилация: NVENC, DNxHR, ProRes, loudnorm
winget install BlenderFoundation.Blender
winget install Audacity.Audacity           # по избор — ръчна работа с гласа
winget search Python.Python                # после: winget install на най-новия Python.Python.3.x
```

- **DaVinci Resolve** (безплатната версия) се сваля ръчно от blackmagicdesign.com/products/davinciresolve.
  В winget не е намерен.
- **Драйвер на NVIDIA:** Studio Driver от nvidia.com. Без него няма NVENC (кодиране с картата) и OptiX (Blender).
- **Claude Code** (настолното приложение) и клонирано репо — агентът живее в `.claude/agents/`.

После отвори **нов** терминал (PATH се обновява) и пусни от корена на репото:

```powershell
node tools/video/doctor.mjs
```

✓ на всички задължителни = готово. Изход 1 = нещо липсва, а до реда пише какво да направиш.

## 2. Потокът

| Стъпка | Програма | Кой |
| --- | --- | --- |
| Hook, сценарий, дължина за платформата | — | Социалджията |
| Сцени с код (интерфейс, текст, графики) | нашата HTML линия или Remotion | AI Studio |
| 3D: лого, продукт, камера | Blender без интерфейс | AI Studio |
| Глас, музика, ниво −14 LUFS | FFmpeg (`presets.mjs loudnorm`); Audacity — ръчно | AI Studio / човек |
| Рендер и мастер | FFmpeg → DNxHR HQ | AI Studio |
| Финален монтаж, цвят | DaVinci Resolve | **човек** |
| Файл за YouTube + 9:16 | FFmpeg с NVENC (`youtube4k60`, `vertical916`) | AI Studio → Социалджията |

## 3. Сцени с код

**А) Нашата HTML линия** (по подразбиране; нула лицензи и нула телеметрия):
- композицията е една страница с `render(t)`, без CSS анимации, затова рендерът е детерминистичен;
- Playwright снима кадрите;
- `presets.mjs frames` ги сглобява.

Образци: `cs-revolution/marketing/youtube-promo/` (`composition.html`, `render.mjs`), `fakturist/promo/`,
`scuolabulgara/promo/`, `adblock/tools/promo/`, `rilievi/scripts/render/`.

**Б) Remotion** (видео с React) — позволен по решение на собственика от 23.11.2026:
- **Лиценз** (`remotion-dev/remotion` LICENSE.md + remotion.dev/docs/license/faq):
  - безплатен е за физически лица и за фирми с общо до 3 души;
  - броят се собственикът, сътрудниците и фрийлансърите по проекта, а при видео за клиент — и хората на клиента;
  - станем ли 4 или повече, преди следващия рендер трябва фирмен лиценз.
- **Телеметрия** (remotion.dev/docs/telemetry):
  - рендерът от командния ред (`npx remotion render`) праща събитие само ако е зададен `licenseKey`
    (и при `"free-license"`); без ключ — нищо;
  - рендерът в браузъра (`@remotion/web-renderer`) праща винаги, заедно с домейна и IP адреса.
  - Затова рендерираме **само от командния ред, без `licenseKey`**.
- **Версия.** Пинната: 4.0.546 на 23.11.2026 (свери с `npm view remotion version`). При вдигане към 5.0 лицензът
  се сменя — нова сверка. Новият проект го създава собственикът или агентът с изрично „да“.
- **Първият рендер** сваля Chrome Headless Shell (браузър за рендера).

## 4. Blender без интерфейс

```powershell
blender -b scene.blend -P blender/build.py -- --out out/blender/ --fps 60
```

```python
# blender/build.py — пуска се с -P; аргументите са след „--“
import bpy, sys
argv = sys.argv[sys.argv.index("--") + 1:]
out = argv[argv.index("--out") + 1]
fps = int(argv[argv.index("--fps") + 1])
scene = bpy.context.scene
scene.render.resolution_x, scene.render.resolution_y, scene.render.fps = 3840, 2160, fps
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "OPTIX"          # NVIDIA RTX; по-стари карти → "CUDA"
prefs.get_devices()
for d in prefs.devices: d.use = True
scene.cycles.device = "GPU"
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = out + "#####"
bpy.ops.render.render(animation=True)
```

PNG поредицата отива през `presets.mjs frames` или директно в Resolve.

## 5. Звук

```powershell
node tools/video/presets.mjs loudnorm --in audio/voice.wav --out audio/voice-14.wav --run
```

- Нормализирането е на два прохода: −14 LUFS, true peak −1,5 dBTP (решение 23.11.2026: AES TD1008 дава −1 dBTP като
  таван на входа на кодека, платформите прекодират до AAC, а true-peak метърът греши до ~0,6 dB; същото число е в
  `tools/social/clip.sh`). Проба на 23.11.2026: −14,1 LUFS.
- В Audacity е ръчната работа: махане на шум и рязане на паузи. Експорт в WAV 48 kHz / 24-bit.
- Музика и звукови ефекти — само собствени или лицензирани, лицензът стои до файла.
- **Предложени срезове** (`edl.mjs`, 23.11.2026; идея от youtube-agent-skill, кодът е наш): от транскрипта и
  тишините дава JSON със срезове — паузи ≥ 0,7 s (с 0,15 s отстъп), реплики само от „ъъъ/ммм/um“ и фалстартове.
  Само предлага; режеш в Resolve. Паразит вътре в реплика е подсказка, не срез.
  ```bash
  ffmpeg -i запис.wav -af silencedetect=noise=-35dB:d=0.5 -f null - 2> тишини.log
  node tools/video/edl.mjs --subs запис.srt --silence тишини.log > срезове.json
  ```

## 6. Към DaVinci Resolve и обратно

1. **Мастер към Resolve.** Мастерът е DNxHR HQ: 8-бита, а безплатният Resolve чете 8-битови формати до UHD при
   60 fps (blackmagicdesign.com).
   ```powershell
   node tools/video/presets.mjs master --in out/scene.mp4 --out out/master.mov --run
   ```
   ProRes 422 HQ е с `--codec prores_hq`. Дали безплатната версия на Windows го чете, не е потвърдено — пробвай
   първо 2-секунден файл.
2. **Настройки на проекта в Resolve.** Задай 3840×2160 и 60 fps, преди да създадеш таймлайн. Това е практика —
   провери в ръководството на Resolve.
3. **Експорт от Resolve.** Хардуерното H.264/H.265 е изброено в Studio; за безплатния — проба. Затова от
   безплатния Resolve изнеси DNxHR мастер, а файла за YouTube прави с NVENC тук:
   ```powershell
   node tools/video/presets.mjs youtube4k60 --in out/final-master.mov --out out/youtube.mp4 --run
   node tools/video/presets.mjs vertical916 --in out/youtube.mp4 --out out/short.mp4 --run
   ```

`youtube4k60` следва support.google.com/youtube/answer/1722171 (сверено 23.11.2026):
- контейнер MP4 с fast start;
- H.264 High, 2 B-кадъра, затворен GOP с дължина половината от кадрите в секунда;
- 4:2:0, BT.709, 60 Mbps (препоръката за 4K60 SDR е 53–68 Mbps);
- AAC 48 kHz, 384 kbps.

Без NVIDIA: `--encoder libx264` (бавно, но същият резултат).

`vertical916` е 1080×1920 при 30 fps и 12 Mbps — числата на Социалджията (60 fps при бързо движение:
`--fps 60`). Крайните настройки за всяка платформа са негови.

Още за Resolve:
- В Resolve 21.1 „Advanced scripting“ е само в Studio. Автоматизация през API-то на Resolve в безплатната
  версия не е опция — затова автоматизацията е във FFmpeg.
- Търговската употреба на безплатната версия не е потвърдена в лицензионното споразумение (то се вижда само в
  инсталатора). Прочети го при инсталирането и запази PDF или снимка с версията.

## 7. Проектът

Видеото живее в продукта, за който е, например `fakturist/promo/<име>/`:

```
scenes/    композиции (HTML или Remotion)        ← в git
blender/   .blend и build.py                      ← в git (.blend1 — не)
audio/     сценарий на гласа, лицензи на музиката ← в git; суровите WAV — не
out/       кадри, мастери, готови файлове         ← никога в git
.gitignore out/ · media/ · *.blend1 · frames/
```

## 8. Преди публикуване

- [ ] `ffprobe` проверка на готовия файл:
  ```powershell
  ffprobe -v error -show_entries stream=codec_name,profile,width,height,r_frame_rate,pix_fmt out/youtube.mp4
  ```
  Очаквано: `h264`, `High`, 3840×2160, `60/1`, `yuv420p`.
- [ ] **Права.** Музика, шрифтове, кадри и 3D модели са собствени или лицензирани.
  - До всеки файл стои запис за лиценза: източник (URL), автор, ниво, ID или сертификат, дата, акаунт и PDF на
    условията към датата.
  - Музиката в реклама има синхронизационно право и право върху записа, а лицензът изрично покрива и платена
    реклама.
  - ТВ, радио или публично пускане → МУЗИКАУТОР и ПРОФОН (Правният Разбирач).
  - Шрифтът трябва да позволява видео (OFL е безопасен).
  - 3D модел с CC BY → атрибуция в описанието. CC NC и „editorial“ — не в реклама.
  - Стокови кадри с хора → разрешение от модела.
- [ ] **AI съдържание.** Deepfake (AI Act чл. 50(4) с чл. 3(60)) → ясно разкриване най-късно при първото
      показване (чл. 50(5)).
  - Текст в кадъра и ред в описанието; при звук без картина — изречено.
  - Важи от 02.08.2026.
  - Фотореалистичен синтетичен човек или глас → етикет по подразбиране.
  - AI персонаж не се представя за истински клиент или отзив (ЗЗП чл. 68г).
- [ ] **Реален човек** (образ, глас, клонинг) — само по писмен договор с него, който назовава:
  - AI синтез, кои клипове, реклама и платена реклама, платформи, територия, срок, възнаграждение;
  - право на преглед и какво става при оттегляне;
  - изтриване на гласовия или лицевия модел след срока;
  - и уведомление по чл. 13 ОРЗД.
  - Доставчик на клониране → `vendor-ai-review` и договор по чл. 28 ОРЗД. Дете → родителите и Правният Разбирач.
  - Без договора — не се снима и не се клонира.
- [ ] **Записи на екрана.**
  - Демо акаунт с измислени данни, генерирани наново — не копие и не „анонимизирано“ копие на реална база
    (Съобр. 26 ОРЗД).
  - Отделен профил на браузъра, известията изключени, без други прозорци, без тайни в терминала.
  - Преглед кадър по кадър. Лични данни или тайна в кадър → изрязване или плътно покритие, не размазване.
  - Медицински данни (medqr) — никога.
- [ ] Без стробоскоп: ≤3 проблясвания в секунда (`motion-a11y`).
- [ ] Звук: −14 LUFS.
- [ ] Заглавие, описание, тагове и часът за публикуване → Социалджията. Публикува човек.
- [ ] Промо клиповете в репото са замразени — нищо съществуващо не се рендира наново без изрична заявка.
