# Ospedali Trasparenti — enterprise одит на кода (5 агента)

*Дата: 2026-07-14. Скан от 5 паралелни ревюъра, по един на подсистема.
Резюме за собственика преди пускането.*

## Състояние (2026-07-14, приложено)

Приложен е **пълният S+M+L обхват** по-долу, освен двете корекции, които местят
публикувани (журналистически) числа — виж «Отложено».

**Готово:** hbars a11y (`role=group`) · CSV/JSON injection guard · атомни записи в
сервиза + graceful shutdown + глобални handlers + **HTTP интеграционни тестове** ·
ETL ZIP magic-byte валидация + отчет за провали · **DRY** (`lib/enti-ssn.js`,
`lib/stats.js`) · **тестово покритие на форензик пайплайна** · **CI workflow** ·
**разбиване на `build-site.js` монолита** (2846 → 1328 реда, 6 нови модула, генериран
сайт байтово идентичен). Тестове: **116 → 138**. Всичко проверено (lint, 138 теста,
нулев diff на сайта и данните).

**Отложено (умишлено, за след пуска):** M3 percentile off-by-one и M4 frazionamento
undercount. Поправката им **променя публикувани, defamation-чувствителни числа** (187
сигнала, €2,70 mld frazionamento), които са в press kit-а за журналисти. Сега са
**документирани + пин-тествани** (не регресират тихо); поправят се като нарочно
ревю-нато опресняване на данните + обновяване на press материалите, не 24 ч. преди пуск.

## Присъда накратко

**Няма launch-blocker.** 0 експлоатируеми Critical/High по достижима пътека с
контролиран от атакуващ вход. Сайтът е статичен, вече билднат и комитнат — може да
се пусне. Всичко по-долу е **инвестиция в качество/устойчивост**, не спешна поправка.

Обща оценка спрямо enterprise стандарт: **~6/10.**

| Ос | Оценка | Коментар |
|----|--------|----------|
| Зависимости (нула деп.) | 9/10 | Силна страна — нищо за кръпка |
| Изходна сигурност (XSS/инжекция) | 8/10 | `esc()` последователен, JSON-LD breakout защитен |
| GDPR/приватност | 9/10 | Само юр. лица, санитизация на имена, анонимен брояч |
| Error handling / устойчивост | 5/10 | Fail-open (тих частичен резултат), не-атомни записи |
| Тестове (пирамида) | 5/10 | Чисти функции ✓; HTTP/render/ETL/forensics — 0 |
| CI/CD | 2/10 | **Няма CI workflow** за ospedali/ |
| Типова дисциплина | 3/10 | Няма `@ts-check`/JSDoc; линт = само `node --check` |
| Поддръжимост | 5/10 | `build-site.js` монолит 2843 реда; DRY дългове |

## Сходящи теми (казаха го ≥2 агента)

1. **Няма CI** + обърната тестова пирамида (HTTP/render/ETL/forensics непокрити).
2. **Fail-open error handling** — тихи частични агрегати, корумпиран кеш трови ETL.
3. **DRY дублиране** — HEALTH regex ×3, median/percentile ×2, region maps ×5, f1 ×3.
4. **Няма структурирано логване/manifest** (наблюдаемост).
5. **`build-site.js` монолит** + `main()` ~655 реда, 15 render-а в един файл.
6. **Няма типова дисциплина.**

---

## Находки по тежест

### HIGH (устойчивост/ops — не блокират пуска)

- **H1 · ETL** — корумпиран/не-ZIP кеширан файл трови всички следващи пускания
  (`fetch-appalti.js:101` unzip извън try/catch; `http.js:88-90` без magic-byte
  проверка на ZIP).
- **H2 · ETL** — тих частичен агрегат без отчет за провала (`fetch-appalti.js:97-99,174`).
- **H3 · server** — не-атомни записи на състоянието → корупция/загуба при срив
  (`analytics.js:89`, `visibility.js:19`, `config.js:55`).
- **H4 · архитектура/server** — HTTP слоят е напълно нетестван; render pipeline нетестван.
- **H5 · analysis** — forensics.js флаг-пайплайнът е с нулево тестово покритие
  (`forensics.js:107-340`) — това ражда публичните „сигнали".

### MEDIUM

- **M1 · a11y** — `hbars role="img"` крие табличните данни от екранни четци
  (`site-ui.js:424`); противоречи на декларацията в `accessibilita.html`. (EAA/WCAG.)
- **M2 · ETL** — позиционно четене на колони (`fetch-aggiudicazioni.js`,
  `segnali-gare.js:177-193`) — нарушава правилото „по имена, не по позиции".
- **M3 · analysis** — `percentile()` нестандартен/off-by-one (P90(1..10)=10);
  дублиран median/percentile между `analyze.js` и `forensics.js`.
- **M4 · analysis** — `clusterFrazionamento` подценява стойността при >3 директни в
  прозореца (`segnali-gare.js:54-69`; проверено 5×20k→60000 вместо 100000).
- **M5 · server** — няма graceful shutdown, преглъщат се грешки при запис, няма
  admin audit log, няма `unhandledRejection` handler, плитък health-check.
- **M6 · site** — латентен XSS/непоследователно екраниране: inline JSON в `<script>`
  без `<`→`<` (`approfondimenti.js:905`). Не е експлоатируемо (BDAP данни).
- **M7 · site** — твърдо закодирани факти („240 miliardi", „113 aziende") се разминават
  с изчислените KPI при обновяване.

### LOW (подбрани)

- CSV formula injection — `csvCell` не неутрализира водещи `= + - @` (`build-site.js:2525`).
- Непоследователно `esc()` на source URL (`pagina-perlapa.js:77`, `pagina-pnrr-salute.js:87`).
- Дублиране: `f1` ×3, client-side `esc` ×3, year-range зашит десетки пъти вместо `rangeAnni()`.
- a11y детайли: цвят-само сигнал в PNE, филтър броячи без `aria-live`, `<td>` вместо `<th scope="row">`.

---

## Пътна карта (усилие S/M/L)

**S — сега, безопасно (изолирано, тестваемо, без риск за пуска):**
- Атомни записи в server (temp + `rename`) → H3.
- CSV formula injection guard (`'` префикс) → Low.
- `hbars` без `role="img"` → M1 (EAA — правно значимо за IT сайт).
- `<` екраниране на inline JSON + `esc()` на 2-та URL → M6/Low.
- ZIP magic-byte проверка + unzip в try/catch → H1.
- CI workflow `.github/workflows/ospedali.yml` (lint+test, path-filtered).

**M — след пуска:**
- HTTP integration тестове за server (H4); forensics тестове (H5).
- Изнеси HEALTH regex → `src/lib/enti-ssn.js`; median/percentile → `src/lib/stats.js` (DRY).
- Отчет за провалени месеци в ETL (H2); структуриран manifest/лог.
- `@ts-check` + JSDoc на `lib/`.

**L — дълг, планирано:**
- Разбий `build-site.js` на билд-стъпки + изнеси старите render-и в модули (както `pagina-*`).
- Поправи позиционното четене на колони (M2), `percentile` семантиката (M3), frazionamento (M4).
