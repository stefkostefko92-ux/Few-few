# Икони на сайта „За Бобов дол"

Всичките **72** икони се дефинират на едно място: `src/components/icons.tsx`.

Източник: **Material Symbols Rounded (запълнени)** от Google, лиценз Apache 2.0.
Вградени са като inline SVG — няма външен шрифт, няма мрежова заявка и няма
runtime зависимост.

## Как е устроено

- **Името в кода е договорът** (`MapPin`, `Phone`…). То се ползва в 44 файла,
  затова не се променя — при смяна на иконна библиотека се пипа само
  `icons.tsx`. Имената са исторически от Lucide.
- `viewBox="0 -960 960 960"` (така са Material Symbols), `fill="currentColor"`.
- **Размерът идва от Tailwind** (`h-4 w-4` = 16px, `h-8 w-8` = 32px), не от SVG-то.
- Понеже цветът е `currentColor`, тъмният режим и високият контраст работят
  без допълнителна намеса.

## Добавяне на нова икона

1. Намери името ѝ в Material Symbols (стил Rounded, запълнен).
2. Вземи `d` от `@material-symbols/svg-400/rounded/<име>-fill.svg`.
3. Добави ред `export const ИмеТо = icon("…");` в `icons.tsx`.

Ако икона няма запълнен вариант (стрелки, шеврони), се ползва обикновеният —
те и без това са плътни форми.

## Подбор, направен нарочно

Две икони не са буквалният превод на името си, защото на 16px буквалният избор
не се четеше:

| Име | Ползва | Защо не другото |
|---|---|---|
| `ChevronDown` | `keyboard_arrow_down` | `arrow_drop_down` е твърде дребно триъгълниче на 16px |
| `Coins` | `savings` | `toll` (два кръга) се слива визуално с `Contrast` |

---

## Пълен списък

| # | Име в кода | Material Symbol | Ползва се | Къде (първите 2) |
|---|---|---|---|---|
| 1 | `Phone` | `call` | 11× | components/SiteFooter.tsx, app/obyavi/[slug]/page.tsx |
| 2 | `MapPin` | `location_on` | 9× | app/smetishta/page.tsx, app/admin/signali/page.tsx |
| 3 | `AlertTriangle` | `warning` | 5× | components/ReportContent.tsx, components/ScamBanner.tsx |
| 4 | `CheckCircle2` | `check_circle` | 5× | app/smetishta/DumpReportForm.tsx, app/prekysvaniya/page.tsx |
| 5 | `Coins` | `savings` | 5× | app/danaci-srokove/page.tsx, app/page.tsx |
| 6 | `Info` | `info` | 5× | components/AccessibilityBar.tsx, app/grafik-smetosabirane/page.tsx |
| 7 | `Landmark` | `account_balance` | 4× | app/grada/page.tsx, app/danaci-srokove/page.tsx |
| 8 | `Type` | `format_size` | 4× | components/AccessibilityBar.tsx, app/dostapnost/page.tsx |
| 9 | `BookOpen` | `menu_book` | 3× | app/grada/page.tsx, app/page.tsx |
| 10 | `CalendarClock` | `event_upcoming` | 3× | app/prekysvaniya/page.tsx, app/danaci-srokove/page.tsx |
| 11 | `CalendarDays` | `calendar_month` | 3× | components/TodayCalendar.tsx, app/page.tsx |
| 12 | `Clock` | `schedule` | 3× | app/uslugi/page.tsx, app/spodeleno-patuvane/page.tsx |
| 13 | `Contrast` | `contrast` | 3× | components/AccessibilityBar.tsx, app/dostapnost/page.tsx |
| 14 | `Hand` | `touch_app` | 3× | components/AccessibilityBar.tsx, app/dostapnost/page.tsx |
| 15 | `Mail` | `mail` | 3× | components/SiteFooter.tsx, app/admin/signali/page.tsx |
| 16 | `Sun` | `sunny` | 3× | components/WeatherWidget.tsx, lib/hours.ts |
| 17 | `Zap` | `bolt` | 3× | components/WeatherWidget.tsx, app/prekysvaniya/page.tsx |
| 18 | `Banknote` | `payments` | 2× | app/page.tsx, app/prozrachnost/page.tsx |
| 19 | `Bus` | `directions_bus` | 2× | app/page.tsx, app/transport/page.tsx |
| 20 | `Camera` | `photo_camera` | 2× | app/page.tsx, app/galeriya/page.tsx |
| 21 | `Church` | `church` | 2× | app/grada/page.tsx, app/imen-den/page.tsx |
| 22 | `Cross` | `local_pharmacy` | 2× | app/page.tsx, app/dezhurna-apteka/page.tsx |
| 23 | `Euro` | `euro` | 2× | app/page.tsx, app/evroto/page.tsx |
| 24 | `Factory` | `factory` | 2× | app/grada/page.tsx, app/grafik-smetosabirane/page.tsx |
| 25 | `FileText` | `description` | 2× | app/pomoshti/page.tsx, app/prozrachnost/page.tsx |
| 26 | `HeartPulse` | `monitor_heart` | 2× | app/kak-da-polzvam-sayta/page.tsx, app/pomoshti/page.tsx |
| 27 | `Megaphone` | `campaign` | 2× | app/grafik-smetosabirane/page.tsx, app/page.tsx |
| 28 | `MessageSquare` | `chat` | 2× | app/dostapnost/page.tsx, app/kak-da-polzvam-sayta/page.tsx |
| 29 | `RefreshCw` | `refresh` | 2× | components/ChatWidget.tsx, app/admin/novini/page.tsx |
| 30 | `Store` | `storefront` | 2× | components/BannerCard.tsx, app/page.tsx |
| 31 | `Trash2` | `delete` | 2× | app/smetishta/page.tsx, app/page.tsx |
| 32 | `Users` | `group` | 2× | app/grada/page.tsx, app/page.tsx |
| 33 | `X` | `close` | 2× | components/ChatWidget.tsx, lib/ratelimit.ts |
| 34 | `ArrowRight` | `arrow_forward` | 1× | app/pomoshti/page.tsx |
| 35 | `ArrowRightLeft` | `swap_horiz` | 1× | components/EuroConverter.tsx |
| 36 | `Ban` | `block` | 1× | app/izmami/page.tsx |
| 37 | `Building2` | `apartment` | 1× | app/prozrachnost/page.tsx |
| 38 | `CalendarRange` | `date_range` | 1× | app/prozrachnost/page.tsx |
| 39 | `Car` | `directions_car` | 1× | app/transport/page.tsx |
| 40 | `ChevronDown` | `keyboard_arrow_down` | 1× | components/AccessibilityBar.tsx |
| 41 | `Cloud` | `cloud` | 1× | components/WeatherWidget.tsx |
| 42 | `CloudFog` | `foggy` | 1× | components/WeatherWidget.tsx |
| 43 | `CloudRain` | `rainy` | 1× | components/WeatherWidget.tsx |
| 44 | `CloudSnow` | `weather_snowy` | 1× | components/WeatherWidget.tsx |
| 45 | `CloudSun` | `partly_cloudy_day` | 1× | components/WeatherWidget.tsx |
| 46 | `Droplets` | `water_drop` | 1× | app/prekysvaniya/page.tsx |
| 47 | `Ear` | `hearing` | 1× | app/dostapnost/page.tsx |
| 48 | `ExternalLink` | `open_in_new` | 1× | app/prozrachnost/page.tsx |
| 49 | `Flame` | `local_fire_department` | 1× | app/pomoshti/page.tsx |
| 50 | `HeartHandshake` | `volunteer_activism` | 1× | app/page.tsx |
| 51 | `HelpCircle` | `help` | 1× | app/page.tsx |
| 52 | `Images` | `photo_library` | 1× | app/page.tsx |
| 53 | `Inbox` | `inbox` | 1× | components/ui.tsx |
| 54 | `Keyboard` | `keyboard` | 1× | app/dostapnost/page.tsx |
| 55 | `ListChecks` | `checklist` | 1× | app/prozrachnost/page.tsx |
| 56 | `Lock` | `lock` | 1× | app/izmami/page.tsx |
| 57 | `MessageCircle` | `chat_bubble` | 1× | components/ChatWidget.tsx |
| 58 | `Moon` | `dark_mode` | 1× | components/AccessibilityBar.tsx |
| 59 | `Mountain` | `landscape` | 1× | app/grada/page.tsx |
| 60 | `Newspaper` | `newspaper` | 1× | app/page.tsx |
| 61 | `PhoneOff` | `phone_disabled` | 1× | app/izmami/page.tsx |
| 62 | `Plus` | `add` | 1× | app/galeriya/page.tsx |
| 63 | `Printer` | `print` | 1× | components/PrintButton.tsx |
| 64 | `Send` | `send` | 1× | components/ChatWidget.tsx |
| 65 | `ShieldAlert` | `gpp_maybe` | 1× | app/page.tsx |
| 66 | `ShieldCheck` | `verified_user` | 1× | app/izmami/page.tsx |
| 67 | `Soup` | `soup_kitchen` | 1× | app/pomoshti/page.tsx |
| 68 | `Stethoscope` | `stethoscope` | 1× | app/dezhurna-apteka/page.tsx |
| 69 | `TrainFront` | `train` | 1× | app/transport/page.tsx |
| 70 | `TreePine` | `park` | 1× | app/grada/page.tsx |
| 71 | `Square` | `stop` | — | _никъде_ |
| 72 | `Volume2` | `volume_up` | — | _никъде_ |

**Ползвани:** 70 · **свободни:** 2

### Дефинирани, но неползвани (2)

`Square` · `Volume2`

> Повечето са за прогнозата за времето (`Cloud*`) — стоят готови.
