# CLAUDE.md — pismo

Писмо (Pismo) — собствен текстов шрифт (BG кирилица с български форми + латиница), Regular и Bold,
генериран от код. Нула деплой — продуктите **копират** `fonts/*.woff2`.

## Команди (гейтът)

```bash
cd pismo
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # веднъж
.venv/bin/python src/build.py        # src/ → fonts/*.otf|ttf|woff2
PYTHON=.venv/bin/python ./gate.sh    # unittest: покритие, метрики, locl/kern, ребилд == fonts/
```

`./gate.sh` е гейтът. CI (`.github/workflows/pismo.yml`) пуска същото на Python 3.13.

## Закони на пакета

1. **Източникът е `src/`.** `fonts/` е ГЕНЕРИРАН и е в репото (продуктите го копират).
   Ръчна редакция или забравен ребилд пада гейта (байт-сравнение със свеж билд).
2. **Билдът е детерминиран** — фиксиран `FIXED_TIMESTAMP`, `recalcTimestamp=False`, закачени
   версии в `requirements.txt`. Вдигаш версия → ребилд → комитваш `fonts/` в същия комит.
3. **Нов знак** = функция/ред в правилния модул + кодова точка в `REQUIRED` в `tests/test_fonts.py`.
   Модули: `latin_lower.py`, `latin_upper.py`, `figures.py`, `punctuation.py`, `cyrillic_upper.py`,
   `cyrillic_lower.py`, `marks.py` (акценти/й/ё/ѝ). Общи части: `shapes.py`; примитиви: `geometry.py`.
4. **Размерите идват от `Weight`** (`s`/`h` малки, `cs`/`ch` главни) и `w.wide()`. Твърдо число,
   което не мащабира с теглото, обикновено чупи Bold — проверявай и двете тегла.
5. **Българските форми** са глифове `*.bg` (без кодова точка); `features.py` ги връзва в
   `locl` за `cyrl/BGR` автоматично. Кирилица, идентична с латиница, е `alias` (отделен глиф).
6. **Визуална проверка е задължителна** при промяна на форма: `node tools/proof.mjs fonts out.png "…"`
   (с `PROOF_LANG=bg` за българските форми) и погледни и Regular, и Bold в едро.
7. Файл > 300 реда → разделяй (както латиница/кирилица са разделени).

## Подредба

```
src/geometry.py     примитиви + метрики (UPM 1000, x 520, cap 710, asc 760, desc −230)
src/shapes.py       общи части: арка, купа със стебло, куки, V, S-крива, К-клон, 3
src/*.py            глифовете по групи · registry.py сглобява · features.py locl+kern
src/build.py        OTF/TTF/WOFF2 + name/OS2 таблици
fonts/              ГЕНЕРИРАНИ шрифтове
tests/test_fonts.py гейтът
specimen/index.html витрина/поле за проба
tools/proof.mjs     PNG проба през Playwright
```
