# Икони на сайта „За Бобов дол"

Общо **72** икони, дефинирани на едно място: `src/components/icons.tsx`.
Текущ източник: **Phosphor Icons, стил Fill**.

## Как да направиш заместващи икони

1. **Името в кода е задължително и не се променя** (`MapPin`, `Phone`…) — ползва се из целия сайт. Визията сменяш свободно.
2. SVG с **`viewBox="0 0 256 256"`** (или 24×24 — важното е да е квадратен и последователен).
3. **`fill="currentColor"`** — без вградени цветове. Иначе тъмният режим и високият контраст се чупят.
4. **Без вградени `width`/`height`** — размерът идва от Tailwind класове.
5. **Плътен/запълнен стил** (не контурен) — чете се по-лесно от възрастни хора.
6. **Критерий за приемане: да се чете ясно на 16px.** Аудиторията е възрастни хора; ако на 16px иконата се слива, не става.

Ползвани размери: `h-4 w-4` (16px, в текст) · `h-5 w-5` (20px) · `h-6 w-6` (24px) · `h-7 w-7` (28px, плочките на началния екран) · `h-20 w-20` (празни състояния).

## Приоритет

Започни от най-често показваните — там качеството личи най-много:

1. `MapPin` — Адрес, локация (11×)
2. `Phone` — Телефон (10×)
3. `AlertTriangle` — Предупреждение / измами (5×)
4. `CheckCircle2` — Потвърдено (5×)
5. `Info` — Информация, помощ (5×)
6. `Coins` — Монети, центове (4×)
7. `CalendarClock` — Срок, час (3×)
8. `Clock` — Час, работно време (3×)
9. `Contrast` — Висок контраст (3×)
10. `Hand` — По-лесно докосване (3×)

---

## Пълен списък

| # | Име в кода (не се променя) | Значение | Ползва се | Къде |
|---|---|---|---|---|
| 1 | `MapPin` | Адрес, локация | 11× | app/smetishta/page.tsx, app/admin/signali/page.tsx |
| 2 | `Phone` | Телефон | 10× | components/SiteFooter.tsx, app/obyavi/[slug]/page.tsx |
| 3 | `AlertTriangle` | Предупреждение / измами | 5× | components/ReportContent.tsx, components/ScamBanner.tsx |
| 4 | `CheckCircle2` | Потвърдено | 5× | app/smetishta/DumpReportForm.tsx, app/prekysvaniya/page.tsx |
| 5 | `Info` | Информация, помощ | 5× | components/AccessibilityBar.tsx, app/grafik-smetosabirane/page.tsx |
| 6 | `Coins` | Монети, центове | 4× | app/danaci-srokove/page.tsx, app/spodeleno-patuvane/page.tsx |
| 7 | `CalendarClock` | Срок, час | 3× | app/prekysvaniya/page.tsx, app/danaci-srokove/page.tsx |
| 8 | `Clock` | Час, работно време | 3× | app/uslugi/page.tsx, app/spodeleno-patuvane/page.tsx |
| 9 | `Contrast` | Висок контраст | 3× | components/AccessibilityBar.tsx, app/dostapnost/page.tsx |
| 10 | `Hand` | По-лесно докосване | 3× | components/AccessibilityBar.tsx, app/dostapnost/page.tsx |
| 11 | `Landmark` | Банка, институция | 3× | app/grada/page.tsx, app/danaci-srokove/page.tsx |
| 12 | `Mail` | Имейл | 3× | components/SiteFooter.tsx, app/admin/signali/page.tsx |
| 13 | `Type` | Размер на текста | 3× | components/AccessibilityBar.tsx, app/dostapnost/page.tsx |
| 14 | `BookOpen` | Ръководство, четене | 2× | app/grada/page.tsx, app/kak-da-polzvam-sayta/page.tsx |
| 15 | `Bus` | Транспорт, автобус | 2× | app/transport/page.tsx |
| 16 | `CalendarDays` | Календар — днешна дата, имен ден | 2× | components/TodayCalendar.tsx, app/imen-den/page.tsx |
| 17 | `Church` | Църква, храмов празник | 2× | app/grada/page.tsx, app/imen-den/page.tsx |
| 18 | `Factory` | Мина/завод, сметосъбиране | 2× | app/grada/page.tsx, app/grafik-smetosabirane/page.tsx |
| 19 | `FileText` | Документ | 2× | app/pomoshti/page.tsx, app/prozrachnost/page.tsx |
| 20 | `HeartPulse` | Здраве, спешна помощ | 2× | app/kak-da-polzvam-sayta/page.tsx, app/pomoshti/page.tsx |
| 21 | `MessageSquare` | Съобщение, писмена връзка | 2× | app/dostapnost/page.tsx, app/kak-da-polzvam-sayta/page.tsx |
| 22 | `RefreshCw` | Опресни, ново търсене | 2× | components/ChatWidget.tsx, app/admin/novini/page.tsx |
| 23 | `Users` | Общност, доброволци | 2× | app/grada/page.tsx |
| 24 | `ArrowRight` | Напред, „виж още“ | 1× | app/pomoshti/page.tsx |
| 25 | `ArrowRightLeft` | Обмяна (лв↔€) | 1× | components/EuroConverter.tsx |
| 26 | `Ban` | Забрана | 1× | app/izmami/page.tsx |
| 27 | `Banknote` | Пари, банкноти | 1× | app/prozrachnost/page.tsx |
| 28 | `Building2` | Институция, община | 1× | app/prozrachnost/page.tsx |
| 29 | `CalendarRange` | Период (прозрачност: 2021–2026) | 1× | app/prozrachnost/page.tsx |
| 30 | `Camera` | Снимка | 1× | app/galeriya/page.tsx |
| 31 | `Car` | Кола, автомобилен транспорт | 1× | app/transport/page.tsx |
| 32 | `ChevronDown` | Разгъване | 1× | components/AccessibilityBar.tsx |
| 33 | `Cross` | Здраве, аптека | 1× | app/dezhurna-apteka/page.tsx |
| 34 | `Droplets` | Прекъсване на водата | 1× | app/prekysvaniya/page.tsx |
| 35 | `Ear` | Слух, за хора с намален слух | 1× | app/dostapnost/page.tsx |
| 36 | `Euro` | Евро, валута | 1× | app/evroto/page.tsx |
| 37 | `ExternalLink` | Външна връзка | 1× | app/prozrachnost/page.tsx |
| 38 | `Flame` | Отопление, газ | 1× | app/pomoshti/page.tsx |
| 39 | `Inbox` | Празно състояние (няма записи) | 1× | components/ui.tsx |
| 40 | `Keyboard` | Клавиатура, писане | 1× | app/dostapnost/page.tsx |
| 41 | `ListChecks` | Списък с отметки (договори) | 1× | app/prozrachnost/page.tsx |
| 42 | `Lock` | Сигурност | 1× | app/izmami/page.tsx |
| 43 | `Megaphone` | Обява | 1× | app/grafik-smetosabirane/page.tsx |
| 44 | `MessageCircle` | Чат, помощник | 1× | components/ChatWidget.tsx |
| 45 | `Moon` | Тъмен режим | 1× | components/AccessibilityBar.tsx |
| 46 | `Mountain` | Природа, местности край града | 1× | app/grada/page.tsx |
| 47 | `PhoneOff` | Затвори телефона (при измама) | 1× | app/izmami/page.tsx |
| 48 | `Plus` | Добави | 1× | app/galeriya/page.tsx |
| 49 | `Printer` | Принтирай | 1× | components/PrintButton.tsx |
| 50 | `Send` | Изпрати (чат) | 1× | components/ChatWidget.tsx |
| 51 | `ShieldCheck` | Проверена безопасност | 1× | app/izmami/page.tsx |
| 52 | `Soup` | Топъл обяд, социален патронаж | 1× | app/pomoshti/page.tsx |
| 53 | `Stethoscope` | Лекар, медицински преглед | 1× | app/dezhurna-apteka/page.tsx |
| 54 | `TrainFront` | Влак, жп транспорт | 1× | app/transport/page.tsx |
| 55 | `Trash2` | Изтрий | 1× | app/smetishta/page.tsx |
| 56 | `TreePine` | Дърво, парк, зеленина | 1× | app/grada/page.tsx |
| 57 | `X` | Затвори | 1× | components/ChatWidget.tsx |
| 58 | `Zap` | Ток, електричество | 1× | app/prekysvaniya/page.tsx |
| 59 | `Cloud` | Времето — облачно | — | _не се ползва_ |
| 60 | `CloudFog` | Времето — мъгла | — | _не се ползва_ |
| 61 | `CloudRain` | Времето — дъжд | — | _не се ползва_ |
| 62 | `CloudSnow` | Времето — сняг | — | _не се ползва_ |
| 63 | `CloudSun` | Времето — променлива облачност | — | _не се ползва_ |
| 64 | `HeartHandshake` | Взаимопомощ, дарителство | — | _не се ползва_ |
| 65 | `HelpCircle` | Помощ, въпрос | — | _не се ползва_ |
| 66 | `Images` | Много снимки, галерия | — | _не се ползва_ |
| 67 | `Newspaper` | Новини | — | _не се ползва_ |
| 68 | `ShieldAlert` | Предупреждение за сигурност | — | _не се ползва_ |
| 69 | `Square` | Спри четенето | — | _не се ползва_ |
| 70 | `Store` | Магазин, търговски обект | — | _не се ползва_ |
| 71 | `Sun` | Време, светъл режим | — | _не се ползва_ |
| 72 | `Volume2` | Чети на глас | — | _не се ползва_ |

## Неизползвани в момента (14)

Дефинирани са, но никъде не се показват — може да ги пропуснеш:

`Cloud` · `CloudFog` · `CloudRain` · `CloudSnow` · `CloudSun` · `HeartHandshake` · `HelpCircle` · `Images` · `Newspaper` · `ShieldAlert` · `Square` · `Store` · `Sun` · `Volume2`

> Повечето са за времето (`Cloud*`) — стоят в готовност за прогнозата.
