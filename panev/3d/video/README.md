# Видео „Montaggio in undici passi“ — A 45 175 2 + B 45 320

Видео инструкция за монтажа на планката за етажна врата в 11 стъпки, по процедурата на собственика
(23.11.2026). Последната стъпка добави собственикът на 24.11.2026: ъглошлайфът отрязва всяка пластина A
наравно с предния ръб на прага. 115 s. Само на италиански, 16:9 за YouTube. Сцената се строи в Blender (Cycles) от същата геометрия
като 3D каталога. Надписите се рисуват с Pillow върху готовите кадри.

**Не е за сайта.** Папката е под `/3d/`, който `server.js` не сервира.

## Две версии

| | `light` (за преглед) | `heavy` (мастер) |
| --- | --- | --- |
| Рендер | CPU, 1280×720, 12 проби | NVIDIA OptiX, 3840×2160, 96 проби |
| Кадри в секунда | 24 | 60 (една честота навсякъде) |
| Изход | 1920×1080, H.264 CRF 23 | 3840×2160, H.264 NVENC 60 Mbps (`tools/video/presets.mjs frames`) |
| Файл | `out/Panev_montaggio-in-undici-passi_leggero.mp4` | `out/Panev_montaggio-in-undici-passi_4K60.mp4` |

## На компютъра на собственика (Windows + NVIDIA)

PowerShell. id-тата са от `tools/video/README.md`.

```powershell
winget install Git.Git
winget install OpenJS.NodeJS.LTS
winget install Gyan.FFmpeg
winget install BlenderFoundation.Blender
winget install Python.Python.3.12        # или най-новия Python.Python.3.x
# нов терминал (PATH се обновява), после:
py -m pip install numpy pillow
```

Драйверът е NVIDIA **Studio Driver** от nvidia.com. Без него няма OptiX (рендер) и NVENC (кодиране).

```powershell
git clone https://github.com/stefkostefko92-ux/Few-few.git
cd Few-few
node tools/video/doctor.mjs                # готово ли е студиото
cd panev/3d
npm ci
node video/export_mesh.mjs                 # геометрията на планката → video/mesh/ (само локално)
cd video
py fetch_assets.py                         # Poly Haven (CC0) + Inter → assets/, проверка по хеш
py render.py heavy --bench 26              # един кадър: колко време на кадър
py render.py heavy                         # всичко; при прекъсване просто го пусни пак
```

Пусни го отново и той продължава оттам, където е спрял. Сцена продължава след последния записан кадър, а
сглобяването прескача готовите кадри. Само една част: `--only stills|shots|assemble|encode`, само няколко
сцени: `--shots asm,pos`. Blender не е в PATH → `$env:BLENDER = "C:\…\blender.exe"`. Без NVENC →
`$env:VIDEO_ENCODER = "libx264"`.

## Устройство

| Файл | Какво прави |
| --- | --- |
| `timeline.py` | сцените и стъпките в секунди; `VIDEO_FPS` |
| `build.py` · `materials.py` · `props.py` · `lib.py` | сцената: стената 5° извън отвеса, двойките A+B, инструментите, прагът, светлините |
| `pose.py` · `motion.py` | къде е всичко в секунда t и точките за надписите |
| `ratchet.py` | тресчотката 3/8" с дълбока вложка 17 и ходовете ѝ (напред с гайката, назад без нея) |
| `grinder.py` · `cut.py` | стъпка 11: ъглошлайфът (моделиран тук), искрите и светлината им, булевото рязане на A и падащият отрязък |
| `shot.py` | една сцена кадър по кадър. Цял се рендерира само първият кадър, после само участъкът, който се мени (същият seed) |
| `run.py` | отделни кадри (интро, финал, проба) |
| `texts.py` · `overlay.py` | италианският текст и рисуването му (дизайн в 1920×1080, изход `VIDEO_OUT`) |
| `assemble.py` · `postfx.py` | кадри + изрези → цели кадри, преливане, надписи, затъмняване, bloom и зърно |
| `render.py` | целият поток с двете версии |
| `fetch_assets.py` | активите с фиксирани адреси и хешове, плюс `assets/LICENSES.txt` |
| `export_mesh.mjs` | геометрията на двойката от `src/` на 3D каталога |

## Права и правила

- **Poly Haven** (CC0 1.0): текстурите `concrete` и `dirty_concrete`, HDRI `interior_construction`,
  моделът `Drill_01`. **Inter 4.0** (SIL OFL 1.1). Логото е на собственика. Ъглошлайфът и
  тресчотката с вложка 17 са моделирани тук (`grinder.py`, `ratchet.py`), без чужд актив и без марка.
  Записът е в `assets/LICENSES.txt`.
- **Не влизат в git** `assets/`, `mesh/`, `render/`, `frames/` и `out/` (`.gitignore`). Геометрията на
  планките не излиза никъде (правилото „без CAD за сваляне“ в `panev/CLAUDE.md`).
- **Текстовете** са в `texts.py`. Провери ги Преводачът, а отворените въпроси ги реши собственикът
  (23.11.2026). Смяна на текст не иска нов рендер: изтрий `frames/<версия>/` и пусни
  `py render.py <версия> --only assemble,encode`.
