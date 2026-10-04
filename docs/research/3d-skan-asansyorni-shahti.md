# 3D скениране на асансьорни шахти — проучване

Дата: 2026-10-04 · Контекст: Panev Ascensori (планки за етажни врати и водачи на противотежестта).
Метод: уеб проучване с източник за всеки конкретен факт; недоказани неща са маркирани като такива.

## 1. Отговор накратко

**Да, възможно е и се прави комерсиално.** Шахтата е трудна среда (тясна, дълбока, гладки стени, липса на гледки встрани), но има три доказани подхода:

1. **Статичен лазерен скенер (TLS)** на специален хоризонтален статив — най-точният, документиран случай.
2. **Мобилен SLAM скенер** (носим/ръчен) — най-бърз, но с по-ниска точност и риск от вертикално „плъзгане“.
3. **Специализирани системи за шахти** (Schindler Sense-I, 2D LiDAR измервателни платформи) — не се продават като обща стока.

За задача „размери на отвори, стени, напречно сечение, наклон на шахтата“ най-безопасният избор е **статичен скенер + хоризонтален/таванен монтаж + контролна проверка с рулетка/лазерна ролетка**.

## 2. Защо шахтата е различна от обикновена стая

| Проблем | Последица | Източник |
|---|---|---|
| Скенер на дъното вижда стените под остър ъгъл → „нехомогенен облак“; скенер на вратата вижда непълно | Нужен е специален монтаж | [Laserscanning Europe](https://www.laserscanning-europe.com/en/case-study/scanning-elevator-shafts-using-horizontal-tripod) |
| Гладки стени с малко особености → SLAM „хлъзга“ по оста | Грешка по височина | [Emesent](https://knowledge.emesent.com/scanning-a-shaft), [NavVis](https://knowledge.navvis.com/docs/challenges-in-mobile-scanning) |
| ICP/визуална регистрация е слабо ограничена по гравитационната ос | Вертикално изместване | [arXiv 2601.02184](https://arxiv.org/pdf/2601.02184) |
| Терестричен скенер заснема само видимото от позицията му | Сенки зад греди/кабели | [LiftExpo](https://liftexpo.pl/en/modern-building-survey-methods-in-construction-work-planning/) |
| Ръчно измерване с висящи отвеси: грешно, бавно, само точкови проби | Мотив за скенер | [CTBUH резюме (търсене)](https://global.ctbuh.org/resources/papers/4441-Studer_Intelligent3-DElevator.pdf) |

## 3. Подходи, подредени по доказаност

### 3.1 Статичен TLS на хоризонтален статив (препоръчан)
Случай: Хамбург, сграда с 7 етажа, 2 шахти.
- Скенер: FARO FocusS 70 (1 mm @ 10 m).
- Два скана на етаж: нормално и **обърнат (над главата)** на специалния хоризонтален статив.
- Резолюция 1/5, качество 3×; ~3 мин на скан, ~6 мин подготовка на етаж; **~90 мин за 6 етажа**.
- Ограничение: скенерът да не е наклонен повече от ±3° (работа на датчика за наклон).
- Регистрация: Cloud2Cloud в FARO SCENE (или Scantra); анализ: PointCab Origins; изход: AutoCAD с минимално сечение, наклон на шахтата, места за достъп.
Източник: [Laserscanning Europe](https://www.laserscanning-europe.com/en/case-study/scanning-elevator-shafts-using-horizontal-tripod).

### 3.2 Компактен статичен скенер
Leica BLK360 (G2 спецификация, лист 2022): диапазон 0,5–45 m, 3D точност 4 mm @ 10 m, 360°×270°, 0,75 kg (0,85 с батерия), 155×80 mm, **работи „upright and upside down“**, IP54, 0–40 °C, ~20 s на пълен скан, до 70 позиции на батерия, автоматично предварително регистриране (VIS).
Източник: [Leica BLK360 spec sheet](https://www.instop.es/PDF/BLK/blk360_spec_sheet_2_0.pdf) (+ търсене: [Leica shop](https://shop.leica-geosystems.com/sites/default/files/2025-07/BLK360-Spec-Sheet-v2.pdf)).
Значение: малкият размер и обърнатият режим го правят удобен за тесни шахти. **Не намерих публикуван шахтов случай с BLK360** — това е извод от спецификацията, не доказана практика.

Професионален клас: Leica RTC360 — 1,9 mm @ 10 m, 5,35 kg ([ATG](https://atgusa.com/?p=16308)); FARO Focus Premium Max — до 400 m, ранжиране ±2 mm ([DiCarlo лист](https://content.dicarlotech.com/hubfs/FocusPremiumMax_AECO_ENG_LT%20October%202024.pdf), цифрите са от търсачка, листът не се прочете). Обхватът 400 m е излишен за шахта.

### 3.3 Мобилен SLAM (носим / ръчен)
| Устройство | Данни | Източник |
|---|---|---|
| NavVis VLX 3 | 8,5 kg, 2×32 слоя, оперативен обхват до 50 m, точност 5 mm (в тестова среда 500 m²), 6 mm среден / 18 mm макс. отклонение без контролни точки (независимо изследване), IP42, 0–40 °C, 1,5 h батерия | [NavVis](https://www.navvis.com/resources/specifications/navvis-vlx-3), [ISPRS 2025](https://isprs-archives.copernicus.org/articles/XLVIII-1-W6-2025/107/2025/isprs-archives-XLVIII-1-W6-2025-107-2025.pdf) |
| Leica BLK2GO PULSE | 0,75 kg (0,85 с батерия), обхват 0,5–10 m, вътрешна точност ±2 cm, шум след обработка ±5 mm, 210°×85° | [Leica](https://shop.leica-geosystems.com/reality-capture/blk2go-pulse/tech-specs) |

Практически: шахтата ще е в обхвата на BLK2GO (10 m е достатъчно за широчина), но **±2 cm вътрешна точност е с порядък по-лоша от статичния скенер**. Изследване на ръчен SLAM в рудна шахта (~1440 m) показва ниска точност спрямо статив, подобрена с позиционирани марки, и ръчна корекция на модела: [ISARC 2017](https://www.iaarc.org/publications/fulltext/ISARC2017-Paper124.pdf). Облекчение: добавяне на ориентири (кутии, конуси) и контролни марки ([NavVis](https://knowledge.navvis.com/docs/challenges-in-mobile-scanning)).

### 3.4 Специализирани системи за шахти
- **Schindler Sense-I** (с Sevensense): 4 хоризонтални камери към четирите стени, изтегля се вертикално с макара, визуален SLAM, цифров двойник; времето пада от дни до **най-много 1 ден**. Не публикува числова точност. Източник: [Sevensense](https://www.sevensense.ai/blog/schindler). Свързана публикация: Studer, Bitzi, Zimmerli (Schindler), CTBUH 2021 ([профил/патент](https://patents.google.com/patent/US10745242)); пълният текст върна 404 — **не е прочетен**.
- **2D LiDAR + извличане на ъгли**: RMSE 8 mm, MAE 17 mm, 60 % по-малко време от ръчно измерване, по-добро от UAV вариант ([IEEE 10905843](https://ieeexplore.ieee.org/document/10905843/) — данните са от резюмето в търсачка).
- **Дрон Lidar-VIO** за проверка на размерите на шахта: [NJIT](https://digitalcommons.njit.edu/fac_pubs/2217) — не е прочетена точност.
- **Schindler R.I.S.E**: робот, който сканира стените за арматура преди пробиване, до 40 % по-малко време ([IT Brief](https://itbrief.com.au/story/schindler-adds-two-more-elevator-shaft-robots-to-fleet)). Не е продукт за външни фирми.
- Не намерих публикувано готово решение за шахти от Kone, TK Elevator или Otis освен патент на Otis за платформа със сензор за обхват ([EP 4371922](https://data.epo.org/publication-server/rest/v1.2/patents/EP4371922NWA1/document.html) — не прочетен).

### 3.5 Смартфон LiDAR (iPhone) — недостатъчен
Сантиметрова точност зависи силно от приложението; в сравнение на 5 приложения най-малката позиционна RMSE е 49,8 mm ([ISPRS 2026](https://isprs-archives.copernicus.org/articles/XLIX-M-1-2026/1/2026/)); Polycam обещава ±½ инч (~12,7 mm) за стандартен интериор ([Polycam](https://learn.poly.cam/hc/en-us/articles/50434745985556-How-Accurate-Are-Polycam-Scans)). Подходящ е за груба визуална справка, **не за поръчка на планки по размер**.

## 4. Каква точност е нужна

- Рейките на водачите се изравняват на **±0,5 mm/m** (EN 81-20, приложение G, според [резултат от търсене](https://docs.google.com/document/d/10hJgZx77Db6FiS73g7kNc4KlDusWFrgs/export?format=pdf)) — това е изискване към релсите, **не към стените на шахтата**; скенерът не го заменя.
- Критерий за вертикалност на стена на шахта „≤ 1:500, максимум 25 mm“ идва от строителен чеклист ([Infralens](https://infralens.in/qaqc/lifts/lift-shaft-construction-checklist)) — ниско доверие, индийски контекст; провери в договора/нормата.
- ISO 4190-1:2010 дава размери на шахти за **нови** сгради ([UNI](https://store.uni.com/iso-4190-1-2010)); за **съществуващи** сгради е EN 81-21 ([BSI](https://shop-checkout.bsigroup.com/products/safety-rules-for-the-construction-and-installation-of-lifts-lifts-for-the-transport-of-persons-and-goods-new-passenger-and-goods-passenger-lifts-in-existing-building-2)). Конкретните таблици изискват купуване на стандартите — не са прочетени.
- Италианският контекст (ремонт на съществуващ вход): DM 236/1989, чл. 7 допуска алтернативни решения при технически ограничения ([lavoripubblici.it](https://www.lavoripubblici.it/news/installazione-ascensore-condominio-legittimo-taglio-vano-scale-36109/2)).

Извод: за проектиране на модернизация/планки е достатъчна точност **2–5 mm** на статичен скенер. SLAM с ±20 mm е приемлив само за предварителна оценка на обема.

## 5. Препоръка за Panev

| Цел | Метод | Защо |
|---|---|---|
| Точни размери за планки/скоби | Статичен скенер (BLK360 или FARO Focus) на хоризонтален/таванен статив, 2 скана на етаж | Документирана практика, 1–4 mm |
| Бърз обход на много сгради | BLK2GO PULSE или VLX 3 + контролни марки | Скорост; точност само за предварителна оценка |
| Контрол | Рулетка/лазерна ролетка на 2–3 места на шахта | Изключва скрита грешка на SLAM/регистрация |
| Бюджет без скенер | Наемане на услуга (в Полша 2025: PLN 3 500–7 000+ нето според сложността, [LiftExpo](https://liftexpo.pl/en/modern-building-survey-methods-in-construction-work-planning/)) | Цената е ориентир, не за България/Италия |

Работен ред: (1) марки/референтни точки на всеки 2–3 етажа; (2) скан на етаж, 2 ориентации; (3) регистрация Cloud2Cloud; (4) сечение на всеки етаж и минимално сечение; (5) наклон и отклонение от вертикалата; (6) експорт в DXF/DWG; (7) сверка с ръчни размери.

Най-добро време за скан: **преди шахтата да се обшие/затвори** ([LiftExpo](https://liftexpo.pl/en/modern-building-survey-methods-in-construction-work-planning/)).

## 6. Какво НЕ е проверено

- Цени на устройствата (не намерих надеждна публична цена).
- Точност на BLK360 и VLX 3 **специално в шахта** — публичните цифри са от лабораторни/общи условия.
- FARO Focus Premium Max: цифрите са от търсачка; листът не е прочетен.
- CTBUH статията на Schindler (404), IEEE/NJIT статиите (само резюме).
- Размери на шахтите на Panev клиентите и дали вътре има режим без достъп/осветление (влияе на избора).
- Законови изисквания в Италия/България за сканиране в сградите и защита на данни — не са проучени.

## Източници

- [Scanning elevator shafts using a horizontal tripod — Laserscanning Europe](https://www.laserscanning-europe.com/en/case-study/scanning-elevator-shafts-using-horizontal-tripod)
- [Modern building survey methods — LiftExpo](https://liftexpo.pl/en/modern-building-survey-methods-in-construction-work-planning/)
- [Leica BLK360 spec sheet](https://www.instop.es/PDF/BLK/blk360_spec_sheet_2_0.pdf)
- [NavVis VLX 3 specs](https://www.navvis.com/resources/specifications/navvis-vlx-3)
- [ISPRS 2025 — NavVis VLX accuracy](https://isprs-archives.copernicus.org/articles/XLVIII-1-W6-2025/107/2025/isprs-archives-XLVIII-1-W6-2025-107-2025.pdf)
- [Leica BLK2GO PULSE tech specs](https://shop.leica-geosystems.com/reality-capture/blk2go-pulse/tech-specs)
- [Leica RTC360 (ATG)](https://atgusa.com/?p=16308)
- [FARO Focus Premium Max (DiCarlo)](https://content.dicarlotech.com/hubfs/FocusPremiumMax_AECO_ENG_LT%20October%202024.pdf)
- [Sevensense — Schindler Sense-I](https://www.sevensense.ai/blog/schindler)
- [Schindler patent US10745242](https://patents.google.com/patent/US10745242)
- [IT Brief — Schindler R.I.S.E](https://itbrief.com.au/story/schindler-adds-two-more-elevator-shaft-robots-to-fleet)
- [Emesent — scanning a shaft](https://knowledge.emesent.com/scanning-a-shaft)
- [NavVis — challenges in mobile scanning](https://knowledge.navvis.com/docs/challenges-in-mobile-scanning)
- [ISARC 2017 — handheld SLAM](https://www.iaarc.org/publications/fulltext/ISARC2017-Paper124.pdf)
- [arXiv 2601.02184](https://arxiv.org/pdf/2601.02184)
- [IEEE 10905843](https://ieeexplore.ieee.org/document/10905843/)
- [NJIT — Lidar-VIO UAV](https://digitalcommons.njit.edu/fac_pubs/2217)
- [ISPRS 2026 — iPhone apps](https://isprs-archives.copernicus.org/articles/XLIX-M-1-2026/1/2026/)
- [Polycam accuracy](https://learn.poly.cam/hc/en-us/articles/50434745985556-How-Accurate-Are-Polycam-Scans)
- [ISO 4190-1:2010 (UNI)](https://store.uni.com/iso-4190-1-2010)
- [EN 81-21 (BSI)](https://shop-checkout.bsigroup.com/products/safety-rules-for-the-construction-and-installation-of-lifts-lifts-for-the-transport-of-persons-and-goods-new-passenger-and-goods-passenger-lifts-in-existing-building-2)
- [lavoripubblici.it — DM 236/1989](https://www.lavoripubblici.it/news/installazione-ascensore-condominio-legittimo-taglio-vano-scale-36109/2)
