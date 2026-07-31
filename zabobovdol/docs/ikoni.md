# Икони на сайта „За Бобов дол"

Общо **72** икони. Текущ източник: **Phosphor Icons, стил Fill** (`@phosphor-icons/react`, `weight="fill"`).
Всички се дефинират на едно място: `src/components/icons.tsx`.

## Технически изисквания за нови икони

За да се сменят без промени другаде, новите икони трябва да:

1. **Запазят точно същите имена** от колоната „Име в кода" (те се внасят из целия сайт).
2. Приемат `className` — размерът се задава с Tailwind класове, не вътре в иконата.
3. Са **SVG с `viewBox="0 0 24 24"`** и `fill="currentColor"` (цветът се наследява от текста — важно за тъмен режим и висок контраст).
4. Са **плътни/запълнени** (не контурни) — така се четат по-лесно от възрастни хора.
5. Нямат вградени `width`/`height` и фиксирани цветове.

Ползвани размери в сайта: `h-4 w-4` (16px, в текст), `h-5 w-5` (20px), `h-6 w-6` (24px), `h-7 w-7` (28px, цветни плочки на началния екран), `h-20 w-20` (празни състояния).

> Забележка: важно е иконите да се четат ясно на **16px** — целевата аудитория е възрастни хора.

---

## Списък

| # | Име в кода | Сегашна Phosphor икона | Значение / къде се ползва | Ползва се |
|---|---|---|---|---|
| 1 | `MapPin` | MapPin | Адрес, местоположение | 11× |
| 2 | `Phone` | Phone | Телефон, обаждане | 10× |
| 3 | `AlertTriangle` | Warning | Предупреждение / измами / опасност | 5× |
| 4 | `CheckCircle2` | CheckCircle | Потвърдено, успешно | 5× |
| 5 | `Info` | Info | Информация, помощ | 5× |
| 6 | `Coins` | Coins | Монети, стотинки/центове | 4× |
| 7 | `CalendarClock` | CalendarDots | Срок, час на събитие | 3× |
| 8 | `Clock` | Clock | Час, работно време | 3× |
| 9 | `Contrast` | CircleHalf | Висок контраст (достъпност) | 3× |
| 10 | `Hand` | Hand | По-лесно докосване (достъпност) | 3× |
| 11 | `Landmark` | Bank | Банка, държавна институция | 3× |
| 12 | `Mail` | Envelope | Имейл, контакт | 3× |
| 13 | `Type` | TextT | Размер на текста (достъпност) | 3× |
| 14 | `BookOpen` | BookOpen | Ръководство, четене, история | 2× |
| 15 | `Bus` | Bus | Транспорт, автобус | 2× |
| 16 | `CalendarDays` | CalendarDots | — | 2× |
| 17 | `Church` | Church | — | 2× |
| 18 | `Factory` | Factory | — | 2× |
| 19 | `FileText` | FileText | Документ, бланка | 2× |
| 20 | `HeartPulse` | Heartbeat | Здраве, спешна помощ | 2× |
| 21 | `MessageSquare` | ChatText | — | 2× |
| 22 | `RefreshCw` | ArrowsClockwise | — | 2× |
| 23 | `Users` | Users | Хора, общност, доброволци | 2× |
| 24 | `ArrowRight` | ArrowRight | Напред, „виж още“ | 1× |
| 25 | `ArrowRightLeft` | ArrowsLeftRight | Обмяна, конвертор (лв↔€) | 1× |
| 26 | `Ban` | Prohibit | Забрана, „не прави“ | 1× |
| 27 | `Banknote` | Money | Пари, банкноти | 1× |
| 28 | `Building2` | Buildings | Институция, община, сграда | 1× |
| 29 | `CalendarRange` | CalendarBlank | — | 1× |
| 30 | `Camera` | Camera | Снимка, качване на снимка | 1× |
| 31 | `Car` | Car | — | 1× |
| 32 | `ChevronDown` | CaretDown | Разгъване надолу | 1× |
| 33 | `Cross` | Cross | Здраве, аптека, медицина | 1× |
| 34 | `Droplets` | Drop | — | 1× |
| 35 | `Ear` | Ear | — | 1× |
| 36 | `Euro` | CurrencyEur | Евро, валута | 1× |
| 37 | `ExternalLink` | ArrowSquareOut | Външна връзка | 1× |
| 38 | `Flame` | Fire | Отопление, газ, пожар | 1× |
| 39 | `Inbox` | Tray | — | 1× |
| 40 | `Keyboard` | Keyboard | — | 1× |
| 41 | `ListChecks` | ListChecks | — | 1× |
| 42 | `Lock` | Lock | Сигурност, заключено | 1× |
| 43 | `Megaphone` | Megaphone | Обява, съобщение | 1× |
| 44 | `MessageCircle` | ChatCircle | Чат, дигитален помощник | 1× |
| 45 | `Moon` | Moon | Тъмен режим | 1× |
| 46 | `Mountain` | Mountains | — | 1× |
| 47 | `PhoneOff` | PhoneX | — | 1× |
| 48 | `Plus` | Plus | Добави ново | 1× |
| 49 | `Printer` | Printer | Принтирай | 1× |
| 50 | `Send` | PaperPlaneTilt | — | 1× |
| 51 | `ShieldCheck` | ShieldCheck | Проверена безопасност | 1× |
| 52 | `Soup` | BowlSteam | — | 1× |
| 53 | `Stethoscope` | Stethoscope | — | 1× |
| 54 | `TrainFront` | Train | — | 1× |
| 55 | `Trash2` | Trash | Изтрий | 1× |
| 56 | `TreePine` | Tree | — | 1× |
| 57 | `X` | X | Затвори | 1× |
| 58 | `Zap` | Lightning | Ток, електричество | 1× |
| 59 | `Cloud` | Cloud | — | **не се ползва** |
| 60 | `CloudFog` | CloudFog | — | **не се ползва** |
| 61 | `CloudRain` | CloudRain | — | **не се ползва** |
| 62 | `CloudSnow` | CloudSnow | — | **не се ползва** |
| 63 | `CloudSun` | CloudSun | — | **не се ползва** |
| 64 | `HeartHandshake` | Handshake | — | **не се ползва** |
| 65 | `HelpCircle` | Question | — | **не се ползва** |
| 66 | `Images` | Images | — | **не се ползва** |
| 67 | `Newspaper` | Newspaper | Новини | **не се ползва** |
| 68 | `ShieldAlert` | ShieldWarning | — | **не се ползва** |
| 69 | `Square` | Square | Спри (четене на глас) | **не се ползва** |
| 70 | `Store` | Storefront | — | **не се ползва** |
| 71 | `Sun` | Sun | Време, светъл режим | **не се ползва** |
| 72 | `Volume2` | SpeakerHigh | Чети на глас | **не се ползва** |

---

## Неизползвани в момента (14)

Тези са дефинирани, но никъде не се използват — може да ги пропуснеш при преработката:

`Cloud` · `CloudFog` · `CloudRain` · `CloudSnow` · `CloudSun` · `HeartHandshake` · `HelpCircle` · `Images` · `Newspaper` · `ShieldAlert` · `Square` · `Store` · `Sun` · `Volume2`

## Най-важни за качеството (най-често на екрана)

1. `MapPin` — Адрес, местоположение (11×)
2. `Phone` — Телефон, обаждане (10×)
3. `AlertTriangle` — Предупреждение / измами / опасност (5×)
4. `CheckCircle2` — Потвърдено, успешно (5×)
5. `Info` — Информация, помощ (5×)
6. `Coins` — Монети, стотинки/центове (4×)
7. `CalendarClock` — Срок, час на събитие (3×)
8. `Clock` — Час, работно време (3×)
9. `Contrast` — Висок контраст (достъпност) (3×)
10. `Hand` — По-лесно докосване (достъпност) (3×)
11. `Landmark` — Банка, държавна институция (3×)
12. `Mail` — Имейл, контакт (3×)
