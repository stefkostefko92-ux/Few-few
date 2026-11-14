# Памет на „Фрезаджията" (v0.1 · самообучаващ се цикъл)

Проверена, преизползваема памет на специалиста по CAM изхода на Korpora (разкрой, кантиране, пробиване,
DXF, G-code ISO/Fanuc и GRBL). Пълни се от `SubagentStop` hook-а (verified → тук, друго → Карантина).
**Закон:** поука е `verified` само с реален ран, `файл` + символ или жива документация на контролера;
противоречие → стоп (човек решава). Без тайни/лични данни.

## Проверени поуки (verified)
- **2026-11-14:** В Korpora маркировките (type 'mark', напр. blind-fix, шаблон за дръжка) не стигат до G-code, DXF и drill.csv — CAM чете само 'hole'/'groove', drillCsv прескача h.mark; виждат се само в чертежа на детайла _(преглед на нов детайл само с маркировки в korpora/engine; verified; engine/cam.js sheetOps (f.type === 'hole' / 'groove') + engine/drill.js drillCsv (if (h.mark) continue); проба u.mjs → 0 реда „Сляп“ в drill.csv)_
- **2026-11-14:** Проверка за удар при отваряне на врати трябва да отваря до ъгъла на пантата от каталога (107–110°), не до 90° — в Г/П кухня вратата до ъгъла удря съседния фронт след 90° _(колизии на врати в ъгъл (kitchen и бъдещи ъглови модули); verified; копие на tests/engine/kitchen-corner.test.mjs с deg <= 110 → 36 удара, първият на 93°; engine/data/hinge-systems.js (имена „110°“))_
- **2026-11-06:** В Korpora checkHoles (engine/model.js) дава 'error' само за застъпване cup/cup, всяко друго застъпване на отвори е 'warn' и не спира cncBlockers — за fail-closed при нов генератор провери застъпванията сам (sheetOps ги пуска в G-code) _(преглед на нов генератор на отвори в korpora/engine; verified; engine/model.js checkHoles + engine/cam.js cncBlockers (филтрира само level==='error'); пусната проба ov3.mjs → двата отвора на 0,2 mm в drillOps)_
- **2026-11-06:** Конфирмат през делител слага главата на отсрещното лице; детайл, който допира това лице на същата височина (±T/2 + радиуса на главата), закрива входа и прави сглобяването невъзможно — проверката на отстоянието между отворите не го хваща _(връзки с конфирмат през двустранно ползвани плоскости (делители); verified; engine/joinery.js confirmat (holeThrough на face) + проба heads.mjs → 16/16 покрити глави без грешка)_
- **2026-11-02:** GRBL v1.1 не поддържа G41/G42 (компенсация на радиуса) — единственият код в групата е G40; няма и G81 (канонични цикли; има само G80), M6 и G43 H (има G43.1/G49). Компенсацията и пробиването за GRBL се правят в CAM пътя с G0/G1/G2, а смяната на инструмента — с M5 + M0. _(GRBL постпроцесор, проверка на G-code за GRBL; verified; https://raw.githubusercontent.com/gnea/grbl/master/README.md („List of Supported G-Codes in Grbl v1.1“) + https://github.com/gnea/grbl/wiki/Grbl-v1.1-Commands (модална група „Cutter Radius Compensation: G40“))_

## Карантина (непроверени / спорни — НЕ са факт)
