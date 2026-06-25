# Few-few — монорепо на Carbon Stealth VCC

Две независими продукции на [Carbon Stealth VCC](https://carbonstealth.eu), плюс екип
персонализирани Claude Code агенти и автоматизиран деплой.

> 📌 **AI асистенти и разработчици започват от [`CLAUDE.md`](./CLAUDE.md)** — там е
> цялата карта на репото: структура, команди, конвенции, агенти и деплой.

## Продукции

| Папка | Продукт | Стек | Адрес |
| --- | --- | --- | --- |
| [`zabobovdol/`](./zabobovdol) | **За Бобов дол** — граждански портал | Next.js 15 · React 19 · TypeScript · Prisma · PostgreSQL · Tailwind | https://zabobovdol.carbonstealth.eu |
| [`medqr/`](./medqr) | **MedQR** — спешен медицински профил с QR/NFC | Node.js · Express · EJS · SQLite | https://medqr.carbonstealth.eu |

Няма коренен `package.json` — влез в съответната папка и пускай нейните скриптове.
Потребителският език е **български**; и двете приложения имат превключвател BG/EN.

## Екип агенти

Персонализирани Claude Code субагенти в [`.claude/agents/`](./.claude/agents), всеки с роля,
изградена от дълбоко проучване. Наблюдавай развитието им в **Лабораторията на агентите**
([`agents-dashboard/`](./agents-dashboard)). Пълната таблица — в [`CLAUDE.md`](./CLAUDE.md).

## Деплой

Ръчно качваш GitHub архива в `/root` на VPS-а, после един скрипт автоматизира всичко до
жив сървър — виж [`deploy/`](./deploy) и [`CLAUDE.md`](./CLAUDE.md).

## Лиценз

Собственически (`UNLICENSED` / proprietary). Данните се хостват в ЕС; поверителност (GDPR)
и сигурност са основни изисквания. Виж `SECURITY.md` във всеки проект.
