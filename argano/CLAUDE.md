# argano/ — избор и проверка на редукторна машина (argano geared) при подмяна

B2B софтуер за монтажници в Италия: от данните на асансьора и на старата машина проверява
предлаганата нова машина или предлага такава, и дава **relazione di calcolo** за техническото
досие. Нормативният профил е италианският: DPR 162/1999 (с DPR 23/2017), UNI EN 81-20:2020,
UNI EN 81-50:2020, UNI 10411-1:2024. Изследването е в `research/argano-geared/` (на италиански),
прототипът-калкулатор е публикуваният артефакт за Panev (версия 12).

_Етап 2 (сега): Next.js 15 приложение върху чистия модул `src/calc/` — фирми и 7 роли, асансьори
(проекти), калкулатор с резултати на живо, неизменими записи с SHA-256, relazione di calcolo в PDF,
IT/EN/BG. Root правилата са в кореновия `CLAUDE.md`._

## Команди (в `argano/`)

```bash
npm install
npm run lint          # ESLint 10 + typescript-eslint strict + react-hooks + next
npm run typecheck     # tsc --noEmit
npm test              # node:test през tsx: golden, ръчни проверки, свойства, предложение, регистър, роли, вход, snapshot, отчет, преводи
npm run build         # prisma generate + next build
npm run dev           # нужни: PostgreSQL и .env (виж .env.example: DATABASE_URL, AUTH_SECRET, PUBLIC_BASE_URL)
ADMIN_PASSWORD=… npm run admin:create                 # администратор на платформата (SUPERADMIN), идемпотентно
BASE_URL=… ADMIN_PASSWORD=… npm run smoke             # e2e в браузъра срещу пуснат сървър (Playwright)
npm run lista         # docs/lista-verifica-normativa.md + .json от регистъра
BASE_URL=… node scripts/render-poster.mjs            # постерът на 3D сцената (public/img/argano-machine-*.webp)
```

Гейтът (задължителен преди „готово“): `lint` + `typecheck` + `test` + `build`, после `smoke` срещу
пуснат `next start` с PostgreSQL.

## Структура

```
src/calc/            Чист изчислителен модул: без I/O, без framework (ESLint го пази). snapshot.ts — каноничният
                     вид на резултатите, който се записва и хешира (и golden тестът ползва).
src/lib/present/     Текстовете и таблиците на прототипа v12 като чисти функции: ползват ги и екранът, и PDF-ът.
src/lib/report/      build.ts — моделът на relazione (италиански); render.ts — вика report/relazione.py.
src/lib/             auth (JWT в httpOnly бисквитка), rbac (7 роли по способности), schemas (zod), env, db, log (pino),
                     ratelimit, audit, calc-input (zod за стойностите на формата), snapshot-hash, seo.
src/server/          Server actions ('use server') и заявки, винаги ограничени до фирмата на потребителя (queries.ts).
src/components/calc/ Калкулаторът в React (форма, схема, присъда, карти), портнат от прототипа.
src/components/machine/ 3D сцената на началната страница: машината от пример A (parts, materials), конвейерът
                     scene → TRAA → bloom → grade (ACES) и нивата на качество — по техниките на 3D двигателя boy
                     (Nexus/client/src/combat/engine/boy). MachineStage: постер веднага, three.js лениво.
src/app/             [locale]/… страниците, api/ (health, relazione PDF, lista-verifica), robots, sitemap, llms.txt.
messages/            it|en|bg.json — приложението; messages/calc/ — речникът на прототипа v12 (358 ключа × 3 езика).
report/relazione.py  PDF с ReportLab + DejaVu (никога Helvetica/Times); само подрежда подаден модел.
prisma/              schema + migrations/0_init (с тригер, който забранява UPDATE на Calculation).
deploy/              deploy.sh (сървърът), nginx/argano.conf. Dockerfile, docker-compose.yml, docker-entrypoint.sh.
```

## Правила

- **Всяко число от норма е в `K` и има запис във `VOCI`.** Тестът `norme.test.ts` пада, ако
  константа или проверка няма запис или текстът на записа не казва числото от кода.
- **Корекция по купената норма:** смени `K`/`VOCI` (статус `confermato`), вдигни `ENGINE_VERSION`
  (`src/calc/snapshot.ts`, semver), `npm run lista`, после `npx tsx scripts/golden-export.ts "<причина>"`.
  Записаните изчисления със стар двигател остават видими, но PDF не се генерира наново (409), докато не се преизчислят.
- **Числена идентичност:** операциите в `compute.ts`/`sizing.ts` са в реда на прототипа; не
  „опростявай“ формула, без да пуснеш golden теста (разлика в 7-ия знак го чупи).
- **Сървърът не вярва на браузъра:** записът валидира стойностите със zod, смята наново и пази
  snapshot + SHA-256; изчисление не се променя (тригер в базата), вариант = нов запис.
- **Изолация по фирма:** всяка заявка е през `src/server/queries.ts` или с `companyId` от сесията;
  чуждо id е 404. Правата — само през `can(role, capability)`.
- **Текстове:** UI на три езика (паритетът се проверява от тест); relazione е само на италиански.
  Текстовете на калкулатора са от прототипа — промяна се прави в трите езика наведнъж.
- **CSP с nonce** (`src/middleware.ts`): никакви inline скриптове; единственият `dangerouslySetInnerHTML`
  е JSON-LD с екраниран `<`.
- **Не копирай текст на нормите** в кода, тестовете или документите: само номер на клауза и
  стойност (авторско право на CEN-CENELEC и UNI).
- **3D сцената:** само на началната страница (входът показва постера). three.js се зарежда лениво, едва когато
  сцената е на екрана; при `prefers-reduced-motion`, save-data, липса на WebGL или бавен кадър остава постерът.
  WebGPU само на хардуерен адаптер, иначе WebGL 2. След промяна в `src/components/machine/` пусни
  `scripts/render-poster.mjs`, за да съвпада постерът с първия жив кадър.
- **Числата на екрана** минават през `makeFmt` (фиксирани разделители, не ICU на средата): Node и браузърът
  трябва да дават един и същ текст, иначе хидратацията на React пада (ICU 78: 2500, Chromium 141: 2.500).
- Коментарите в кода са на английски, текстовете за инженера и отчета — на италиански, комитите — на
  български. Без CI workflow засега (решение на собственика); гейтът се пуска локално.
