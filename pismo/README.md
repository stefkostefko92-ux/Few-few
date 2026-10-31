# Писмо (Pismo)

Собствен текстов шрифт на Carbon Stealth VCC — за дълги текстове на екран и на хартия.
Спокоен гротеск с отворени форми и ясни разлики между `I`, `l` и `1`.

| | |
|---|---|
| Тегла | Regular (400), Bold (700) |
| Азбуки | българска кирилица (с **български форми** чрез `locl`), руска кирилица, латиница |
| Езици | български, руски, английски, италиански (à è é ì ò ù), немски (ä ö ü) |
| Знаци | 217 глифа на тегло: цифри (таблични), „…“ «…» ‚‘, €, №, $, %, @, &, математика |
| OpenType | `locl` (BGR) — д, ж, и, й, ѝ, к, л, п, т, ц, ш, щ, ю в български вид · `kern` |
| Формати | `fonts/*.otf` (CFF), `fonts/*.ttf`, `fonts/*.woff2` (уеб) |

## Употреба

**Уеб** — копирай `fonts/Pismo-*.woff2` в проекта:

```css
@font-face { font-family: "Pismo"; src: url("/fonts/Pismo-Regular.woff2") format("woff2"); font-weight: 400; font-display: swap; }
@font-face { font-family: "Pismo"; src: url("/fonts/Pismo-Bold.woff2") format("woff2"); font-weight: 700; font-display: swap; }
body { font-family: "Pismo", system-ui, sans-serif; }
```

Българските форми се включват от езика на документа: `<html lang="bg">`. С `lang="ru"` или
без език остават стандартните (руски) форми.

**Word / LibreOffice / Figma** — инсталирай `fonts/Pismo-Regular.otf` и `fonts/Pismo-Bold.otf`.
В LibreOffice българските форми идват от езика на текста (Инструменти → Език → Български).

**Преглед** — отвори `specimen/index.html` в браузър (поле за проба, размер, тегло, език).

## Как е направен

Шрифтът е **код**: всеки глиф е описан като булево обединение на геометрични примитиви
(правоъгълници, елиптични пръстени, наклонени щрихи) в `src/`. `src/build.py` ги смята с
`skia-pathops` и пише шрифтовете с `fontTools`. Теглата са параметри (`WEIGHTS` в
`src/build.py`) — Bold не е рисуван отделно, а е същата геометрия с по-дебели щрихи.

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python src/build.py          # → fonts/
PYTHON=.venv/bin/python ./gate.sh      # гейт: покритие, метрики, locl/kern, байт-идентичен ребилд
node tools/proof.mjs fonts /tmp/proof.png "Текст"   # PNG проба (нужен Playwright)
```

## Права

© 2026 Carbon Stealth VCC. Всички права запазени. Шрифтът е собственост на Carbon Stealth VCC
и се ползва в нейните продукти; разпространение извън тях — само с писмено разрешение.

Created and Designed by [Carbon Stealth VCC](https://carbonstealth.eu)
