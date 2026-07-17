# Памет на агента „Изпитателят" (v6.0 — самообучение)

Трайно файлово знание между извикванията (Claude Code субагентите са stateless).
Цикълът е **наложен от hooks** (виж `_memory/PROTOCOL.md`): при старт `SubagentStart`
инжектира „Проверени поуки"; накрая `SubagentStop` добавя новия ```learn блок; `curate.mjs` дедупира.
**Закон:** само проверено става факт; източник или нищо; противоречие → стоп (човек решава).

Специалност: **пише и притежава тестовите пакети** (unit/интеграционни/e2e), детерминизъм, борба с flaky.
Версии на рамки (Playwright/Vitest/MSW) са време-чувствителни → потвърждавай на живо.

## Проверени поуки (verified)

### Стратегия — какво и на кое ниво
- **2026-07-16:** Тествай ПОВЕДЕНИЕ, не имплементация: асертирай на видимия изход/ефект, не на вътрешни privates/state — иначе всеки рефактор чупи теста (крехък). _("тестова философия"; verified; "https://testing-library.com/docs/guiding-principles/")_
- **2026-07-16:** Покритието е следствие, не цел; 100% покритие на грешно поведение = нула стойност. Ползвай coverage за да намериш нетестван КОД, не като KPI. _("coverage не е цел"; verified; "https://kentcdodds.com/blog/how-to-know-what-to-test")_
- **2026-07-16:** Пирамида: много бързи unit, по-малко интеграционни, малко скъпи e2e; за front-end „testing trophy" мести тежестта към интеграционни (най-добро съотношение увереност/цена). _("тестова пирамида/трофей"; verified; "https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications")_
- **2026-07-16:** Избирай най-ниското ниво, което дава увереност: не e2e за чиста функция, не unit за UI поток; e2e само за критични end-to-end пътища. _("избор на ниво"; verified; "https://playwright.dev/docs/best-practices#testing-philosophy")_
- **2026-07-16:** Тествай видимо от потребителя поведение, не детайли на рамката; тестът трябва да пада при реален дефект и да мълчи при рефактор без промяна на поведение. _("what to test"; verified; "https://testing-library.com/docs/guiding-principles/")_

### Playwright (e2e)
- **2026-07-16:** Playwright локаторите по роля/етикет/текст (`getByRole`, `getByLabel`, `getByText`, `getByPlaceholder`) авто-чакат елемента; предпочитай ги пред CSS/XPath — устойчиви на промени в структурата. _("playwright локатори"; verified; "https://playwright.dev/docs/locators")_
- **2026-07-16:** Web-first assertions (`expect(locator).toBeVisible()/toHaveText()`) ретрайват до таймаут → детерминизъм без `sleep`; никога `page.waitForTimeout` в тест. _("playwright auto-waiting"; verified; "https://playwright.dev/docs/best-practices#use-web-first-assertions")_
- **2026-07-16:** Всеки тест е нов browser context (изолирани cookies/storage) → тестовете не си влияят; не споделяй стейт между тестове. _("playwright изолация"; verified; "https://playwright.dev/docs/browser-contexts")_
- **2026-07-16:** `storageState` записва пре-логнат сесиен стейт (веднъж в setup project) и го зарежда в тестовете → без логин през UI всеки път; по-бързо и по-стабилно. _("playwright storageState/auth"; verified; "https://playwright.dev/docs/auth")_
- **2026-07-16:** Fixtures (`test.extend`) дават преизползваем setup/teardown per тест с автоматично освобождаване; предпочитай пред глобален стейт. _("playwright fixtures"; verified; "https://playwright.dev/docs/test-fixtures")_
- **2026-07-16:** `projects` в config дефинират браузъри/устройства (Chromium/Firefox/WebKit + `devices['iPhone 13']`) и зависими проекти (setup project за auth). _("playwright projects"; verified; "https://playwright.dev/docs/test-projects")_
- **2026-07-16:** `trace: 'on-first-retry'` записва пълен trace (DOM снапшоти, мрежа, конзола) при провал за дебъг; отваря се с `npx playwright show-trace`. Screenshot/video `only-on-failure`. _("playwright trace"; verified; "https://playwright.dev/docs/trace-viewer")_
- **2026-07-16:** CI: `retries: 2` само в CI (не локално — крие flaky), `--shard=i/n` за паралел между машини, `--reporter=html,junit,list`; кеширай браузърите или ползвай `mcr.microsoft.com/playwright` образа. _("playwright CI"; verified; "https://playwright.dev/docs/ci")_
- **2026-07-16:** Мрежа: `page.route(url, handler)` за мок/стъб/abort на заявки; `page.waitForResponse` за детерминистично чакане на конкретна заявка вместо време. _("playwright network mock"; verified; "https://playwright.dev/docs/mock")_
- **2026-07-16:** API тестове без браузър: `request` fixture (`request.get/post`) удря endpoint-и директно — бързо за backend договори; или `page.request` за същия контекст като страницата. _("playwright API testing"; verified; "https://playwright.dev/docs/api-testing")_
- **2026-07-16:** `test.step` групира стъпки за четим репорт; `test.describe.configure({ mode: 'parallel'|'serial' })` — serial само при истинска зависимост (по подразбиране файловете вървят паралелно). _("playwright steps/parallel"; verified; "https://playwright.dev/docs/api/class-test#test-step")_
- **2026-07-16:** Инсталация: `npx playwright install --with-deps` тегли браузъри + системни зависимости; в CI кеширай `~/.cache/ms-playwright`. Тук глобалният Playwright е на `/opt/node22/.../playwright`. _("playwright install"; verified; "https://playwright.dev/docs/browsers")_
- **2026-07-16:** `expect(locator).toHaveScreenshot()` прави визуална регресия (пиксел-сравнение с baseline, `--update-snapshots` за обновяване); чувствително към шрифтове/OS → закови образа/маскирай динамичното. _("playwright visual"; verified; "https://playwright.dev/docs/test-snapshots")_
- **2026-07-16:** Избягвай тестове зависими от ред; `test.beforeEach` за свеж setup; не разчитай глобален стейт да оцелее между тестове (context е нов). _("playwright test independence"; verified; "https://playwright.dev/docs/best-practices#make-tests-as-isolated-as-possible")_

### Vitest / Jest (unit)
- **2026-07-16:** Vitest е нативен за Vite проекти (споделя конфиг/трансформ), Jest-съвместим API (`describe/it/expect/vi`); за zabobovdol/Nexus/mastilko (Vite/Next) → Vitest, за legacy → Jest. _("vitest избор"; verified; "https://vitest.dev/guide/why.html")_
- **2026-07-16:** `vi.fn()` (mock функция), `vi.spyOn(obj,'m')` (шпионира + може да възстанови), `vi.mock('module')` (авто/фабрика мок на модул — hoist-ва се най-горе). Jest: `jest.fn/spyOn/mock`. _("vitest mocking"; verified; "https://vitest.dev/api/vi.html")_
- **2026-07-16:** `vi.useFakeTimers()` + `vi.advanceTimersByTime(ms)` тества време-зависима логика детерминистично (debounce/timeout/interval) без реално чакане; `vi.useRealTimers()` в teardown. _("vitest fake timers"; verified; "https://vitest.dev/api/vi.html#vi-usefaketimers")_
- **2026-07-16:** `--coverage` (v8 бърз или istanbul по-точен) дава отчет; `test.each`/`it.each` за параметризирани случаи (една логика, много входа) — по-четимо от цикъл. _("vitest coverage/each"; verified; "https://vitest.dev/guide/coverage.html")_
- **2026-07-16:** Async тестове: върни/await promise (`await expect(fn()).rejects.toThrow()`); не забравяй `await` — иначе тестът минава преди assertion-а (фалшиво зелено). _("async тестове"; verified; "https://vitest.dev/api/expect.html#rejects")_
- **2026-07-16:** `beforeEach`/`afterEach` за изолиран стейт; `vi.restoreAllMocks()`/`vi.clearAllMocks()` между тестове — иначе мок call-ове изтичат и правят тестовете зависими. _("mock cleanup"; verified; "https://vitest.dev/api/vi.html#vi-restoreallmocks")_
- **2026-07-16:** Vitest environment: `jsdom`/`happy-dom` за DOM тестове (компоненти), `node` за чиста логика; задава се per файл (`// @vitest-environment jsdom`) или в конфиг. _("vitest environment"; verified; "https://vitest.dev/guide/environment.html")_
- **2026-07-16:** `expect.assertions(n)` гарантира, че n асершъна са изпълнени (пази async тест да не „мине" без да е проверил нищо). _("expect.assertions"; verified; "https://vitest.dev/api/expect.html#expect-assertions")_

### Testing Library (компоненти)
- **2026-07-16:** Приоритет на заявки: `getByRole` > `getByLabelText` > `getByPlaceholderText` > `getByText` > `getByDisplayValue`; `getByTestId` само краен случай (не е достъпен от потребителя). _("testing-library приоритет"; verified; "https://testing-library.com/docs/queries/about/#priority")_
- **2026-07-16:** `getBy*` хвърля ако липсва (за наличие), `queryBy*` връща null (за отсъствие — `expect(...).not.toBeInTheDocument()`), `findBy*` връща promise + авто-чака (за async поява). _("query варианти"; verified; "https://testing-library.com/docs/queries/about/#types-of-queries")_
- **2026-07-16:** `userEvent` (не `fireEvent`) симулира реално взаимодействие (focus, keydown, input последователно); `const user = userEvent.setup()` + `await user.click(...)` (v14 е async). _("userEvent"; verified; "https://testing-library.com/docs/user-event/intro")_
- **2026-07-16:** `render` + `screen.getByRole(...)`; не разчитай на container.querySelector (заобикаля достъпността). `screen.debug()` печата DOM за дебъг. _("render/screen"; verified; "https://testing-library.com/docs/react-testing-library/api/#render")_
- **2026-07-16:** `waitFor(() => expect(...))` за async промени, но предпочитай `findBy*` (по-ясно); не слагай странични ефекти в `waitFor` callback (върви многократно). _("waitFor vs findBy"; verified; "https://testing-library.com/docs/dom-testing-library/api-async/#waitfor")_
- **2026-07-16:** Ролите идват от ARIA/семантичен HTML — ако `getByRole` не намира бутон, вероятно маркъпът не е достъпен (div вместо button) → тестът хваща и a11y проблем. _("role-based = a11y"; verified; "https://testing-library.com/docs/queries/byrole/")_

### MSW (мокване на мрежата)
- **2026-07-16:** MSW прихваща заявки на мрежово ниво (Service Worker в браузър / interceptor в Node) → тестваш реалната fetch/axios логика без да удряш сървър; същите handlers за тест и dev мок. _("msw основи"; verified; "https://mswjs.io/docs/")_
- **2026-07-16:** msw v2 API: `http.get/post(...)` + `HttpResponse.json(...)` (смени старите `rest`/`res(ctx.json())` от v1); `setupServer(...handlers)` за Node тестове, `setupWorker` за браузър. _("msw v2 API"; verified; "https://mswjs.io/docs/migrations/1.x-to-2.x")_
- **2026-07-16:** Жизнен цикъл в тест: `server.listen()` в beforeAll, `server.resetHandlers()` в afterEach (маха per-тест overrides), `server.close()` в afterAll; `server.use(...)` за override на отделен тест (грешка/edge). _("msw lifecycle"; verified; "https://mswjs.io/docs/integrations/node")_
- **2026-07-16:** `onUnhandledRequest: 'error'` кара тестовете да падат при неочаквана мрежова заявка → хващаш липсващ мок вместо тих реален fetch. _("msw unhandled"; verified; "https://mswjs.io/docs/api/setup-server/listen")_

### Детерминизъм и flaky тестове
- **2026-07-16:** Причини за flaky: чакане по време не по състояние; споделен стейт; реални Date/random/timezone; немокната мрежа; async race; зависимост от ред. Атакувай първопричината. _("flaky причини"; verified; "https://playwright.dev/docs/best-practices"; scope: диагностика)_
- **2026-07-16:** Фиксирай време (fake timers / mock Date), seed за random, timezone (`TZ=UTC`), локал; иначе тестът пада „в петък" или в друга часова зона. _("детерминизъм време/random"; verified; "https://vitest.dev/api/vi.html#vi-setsystemtime")_
- **2026-07-16:** Ретрайовете КРИЯТ flaky (тестът „минава" на 2-ри опит) — ползвай retry само в CI за да не блокираш, но проследявай flaky rate и поправяй; не е решение. _("retry крие flaky"; verified; "https://playwright.dev/docs/test-retries")_
- **2026-07-16:** Карантинирай упорито flaky тест (`test.fixme`/skip + билет), не го трий и не го маскирай завинаги; flaky тест обучава екипа да игнорира червено. _("flaky карантина"; verified; "https://playwright.dev/docs/test-annotations#fixme")_
- **2026-07-16:** Изолация: свеж стейт/БД per тест (migrate+seed в setup, teardown после); никакъв ред-зависим тест; паралелните тестове не бива да пишат в един ресурс. _("тест изолация"; verified; "https://playwright.dev/docs/best-practices#make-tests-as-isolated-as-possible")_

### CI, покритие, репорти
- **2026-07-16:** Тестовете са required гейт в CI (координирай с Конвейерът); бързите (unit) първи, e2e последни; junit/html репорт + trace артефакт при провал за диагностика без ре-ран локално. _("тестове в CI гейт"; verified; "https://playwright.dev/docs/ci-intro"; scope: граница с Конвейерът)_
- **2026-07-16:** Не таргетирай сляпо 100% покритие; фокусирай критичните пътища и клонове; праг (напр. 80%) като предпазна мрежа срещу регрес, не като самоцел. _("coverage праг"; verified; "https://vitest.dev/config/#coverage-thresholds")_
- **2026-07-16:** JUnit XML репорт се чете от GitHub/тест-репортери за annotations на PR; HTML репорт (Playwright) за човешки преглед; публикувай ги като артефакт. _("тест репорти"; verified; "https://playwright.dev/docs/test-reporters")_
- **2026-07-16:** Sharding разпределя тестовете между N машини (`--shard=1/4`); мерж-ни репортите (`playwright merge-reports`) за единен HTML. _("sharding"; verified; "https://playwright.dev/docs/test-sharding")_

### Достъпностни и API тестове
- **2026-07-16:** `@axe-core/playwright`: `new AxeBuilder({ page }).analyze()` → асертирай `violations` е празен на ключови екрани; хваща контраст/роли/етикети (свързва се с EAA/Правния). _("a11y тестове axe"; verified; "https://playwright.dev/docs/accessibility-testing")_
- **2026-07-16:** Автоматичните a11y скенери (axe) хващат ~30-50% от проблемите (машинно проверимите); ръчна проверка с клавиатура/екранен четец остава нужна за пълнота. _("axe покритие граница"; verified; "https://github.com/dequelabs/axe-core#what-issues-does-axe-detect")_
- **2026-07-16:** API/договорни тестове: за Express рутове ползвай supertest (`request(app).get(...).expect(200)`) без да вдигаш реален порт; за междусервизни договори — Pact (consumer-driven). _("api/supertest"; verified; "https://github.com/ladjs/supertest")_
- **2026-07-16:** Контрактно тестване (Pact) фиксира очакванията между consumer и provider → хваща breaking API промени преди интеграция; provider verification в CI. _("contract testing pact"; verified; "https://docs.pact.io/")_

### Репото конкретно
- **2026-07-16:** Безопасно-критични e2e (задължителни): medqr спешен профил/SOS (визуал+хаптик до всеки звук), CSPos фискален бон/сторно и „продажба без бон не се записва", Stripe checkout (суми на сървъра, достъп през webhook). Регресия тук е недопустима. _("репо критични потоци"; verified; "CLAUDE.md (продукти); medqr/CSPos/Продавача договори")_
- **2026-07-16:** Стек per продукт: Next.js апове → Vitest + Testing Library + Playwright; Express/EJS/SQLite (medqr/panev/vizitka) + бот → Vitest/Jest + supertest + Playwright; плейн ESM. Всеки продукт носи own test config (няма коренен). _("репо тест стек"; verified; "CLAUDE.md (Products таблица, per-product toolchain)")_
- **2026-07-16:** Prisma тестове срещу ОТДЕЛНА тест БД (не production); migrate+seed в setup, изолиран стейт per тест; Сийдъра владее seed-овете (координирай). _("prisma тест БД"; verified; "https://www.prisma.io/docs/orm/prisma-client/testing"; scope: граница със Сийдъра)_
- **2026-07-16:** Тук вече ползвам Playwright за headless проверка на таблото (рендер + interaction + монтаж); същият инструмент върши e2e за продуктите — closeup crop + trace при провал. _("репо playwright практика"; verified; "agents-dashboard headless verify practice")_

### Общи практики
- **2026-07-16:** Именувай теста по поведение („не записва продажба без успешен бон"), не по метод („test createSale") — четимо като спецификация; при провал казва какво е счупено. _("именуване на тестове"; verified; "https://testing-library.com/docs/guiding-principles/")_
- **2026-07-16:** AAA структура (Arrange-Act-Assert) държи теста четим; един логически assertion на тест (или свързани) — тест, който проверява 10 неща, е неясен при провал. _("AAA структура"; verified; "https://github.com/goldbergyoni/javascript-testing-best-practices")_
- **2026-07-16:** Не тествай библиотеката/рамката (React/Prisma) — тя си има тестове; тествай ТВОЯТА логика/интеграция върху нея. _("не тествай рамката"; verified; "https://kentcdodds.com/blog/how-to-know-what-to-test")_
- **2026-07-16:** Мокни на границата (мрежа/време/random/файлова система), не вътрешните си модули — прекомерното мокване тества мока, не кода; интеграционният тест с реални модули дава повече увереност. _("мокни на границата"; verified; "https://kentcdodds.com/blog/the-merits-of-mocking")_
- **2026-07-16:** `test.only`/`fdescribe`/`.only` оставени в кода заключват CI пакета само в тях (тихо пропускат останалите) → доказан капан; линт/pre-commit да ги хваща. _("only капан"; verified; "https://vitest.dev/api/#test-only")_

### Тестови данни, дубльори, шаблони
- **2026-07-16:** Test doubles: **dummy** (запълва аргумент), **stub** (връща зададена стойност), **spy** (записва обажданията), **mock** (с очаквания), **fake** (работеща олекотена имплементация, напр. in-memory БД). Ползвай най-простия достатъчен. _("test doubles"; verified; "https://martinfowler.com/bliki/TestDouble.html")_
- **2026-07-16:** Фабрики за тестови данни (build функции с override) > ръчни фикстури: `makeUser({email})` дава валиден обект по подразбиране + точния override за случая → четими, устойчиви тестове. _("test data factories"; verified; "https://github.com/thoughtbot/factory_bot#defining-factories"; scope: шаблон)_
- **2026-07-16:** Object Mother / builder pattern за сложни обекти; не дублирай setup в 20 теста — извади в helper, но пази теста четим (setup да не крие важното). _("test data builders"; verified; "https://martinfowler.com/bliki/ObjectMother.html")_
- **2026-07-16:** Не споделяй мутируем тестов обект между тестове (глобален seed) — един тест го променя, друг пада; всеки тест си прави своите данни. _("shared test data капан"; verified; "https://github.com/goldbergyoni/javascript-testing-best-practices#-%EF%B8%8F-15-avoid-global-test-fixtures-and-seeds")_
- **2026-07-16:** Валидирай API отговори със схема (zod/JSON Schema) в теста — хваща договорни промени (липсващо поле, тип) по-добре от точкови assertion-и. _("schema validation в тест"; verified; "https://zod.dev/"; scope: API тестове)_

### Page Object / организация на e2e
- **2026-07-16:** Page Object Model капсулира селектори + действия на страница в клас → e2e тестовете четат като сценарии, промяна в UI се оправя на едно място. Playwright препоръчва fixtures-базирани POM. _("page object model"; verified; "https://playwright.dev/docs/pom")_
- **2026-07-16:** Не слагай assertion-и в page object-а (той е за взаимодействие); assertion-ите живеят в теста → ясно разделение действие/проверка. _("POM без assertions"; verified; "https://playwright.dev/docs/pom"; scope: организация)_
- **2026-07-16:** Групирай e2e по потребителски поток (login → checkout → confirm), не по страница; тестът разказва история, която бизнесът разбира. _("e2e по поток"; verified; "https://playwright.dev/docs/best-practices")_

### Playwright — разширени възможности
- **2026-07-16:** `page.clock` (fake time в браузъра) тества време-зависим UI (таймери, „преди 5 мин") детерминистично без реално чакане. _("playwright clock"; verified; "https://playwright.dev/docs/clock")_
- **2026-07-16:** Emulation: `devices[...]` (viewport/UA/touch), `geolocation`+`permissions`, `colorScheme: 'dark'`, `locale`/`timezoneId`, offline режим — тествай responsive/локал/тъмна тема детерминистично. _("playwright emulation"; verified; "https://playwright.dev/docs/emulation")_
- **2026-07-16:** File upload: `setInputFiles`; download: `waitForEvent('download')` + `download.saveAs`; dialogs: `page.on('dialog', d => d.accept())` — иначе диалогът блокира. _("playwright files/dialogs"; verified; "https://playwright.dev/docs/input#upload-files")_
- **2026-07-16:** iframe: `page.frameLocator(...)` за елементи в iframe; Shadow DOM: локаторите пронизват open shadow roots автоматично (за разлика от CSS). _("playwright iframe/shadow"; verified; "https://playwright.dev/docs/locators#locate-in-a-frame")_
- **2026-07-16:** Мрежово дроселиране/HAR: `routeFromHAR` записва/възпроизвежда мрежа за напълно детерминистичен e2e без реален backend. _("playwright HAR"; verified; "https://playwright.dev/docs/mock#mocking-with-har-files")_
- **2026-07-16:** `expect.poll(fn)` и `expect.toPass()` ретрайват произволна проверка/блок до успех — за не-локатор условия (напр. изчакай стойност от API). _("playwright expect.poll"; verified; "https://playwright.dev/docs/test-assertions#expectpoll")_
- **2026-07-16:** Global setup (`globalSetup` в config) стартира сървъра/сийдва БД веднъж за целия ран; `webServer` опцията вдига dev сървъра автоматично и чака да е готов преди тестовете. _("playwright webServer/globalSetup"; verified; "https://playwright.dev/docs/test-webserver")_

### Компонентни/друг инструментариум
- **2026-07-16:** Storybook + play функции / interaction тестове тестват компонент изолирано (визуален каталог + поведение); Chromatic за визуална регресия на stories. _("storybook тестове"; verified; "https://storybook.js.org/docs/writing-tests/interaction-testing")_
- **2026-07-16:** Cypress е алтернатива на Playwright (в-браузър runner, time-travel debug), но Playwright дава по-добра паралелизация/мулти-браузър/API тестове; за това репо Playwright е базата. _("cypress vs playwright"; verified; "https://playwright.dev/docs/why-playwright"; scope: избор)_
- **2026-07-16:** Vitest browser mode / component testing рендерира реални компоненти в браузър (по-точно от jsdom за layout/CSS); за повечето логика jsdom е достатъчен и по-бърз. _("vitest browser mode"; verified; "https://vitest.dev/guide/browser/")_
- **2026-07-16:** Snapshot тестовете гният лесно („обнови на сляпо" анти-паттерн); ползвай inline snapshots за малки стойности, избягвай snapshot на цели компоненти — асертирай конкретното поведение. _("snapshot пестеливо"; verified; "https://kentcdodds.com/blog/effective-snapshot-testing")_

### BDD, документиране, четимост
- **2026-07-16:** Given-When-Then (BDD/Gherkin) структурира сценария на език на бизнеса; полезно за критични потоци/приемни тестове, но не задължавай цялото unit ниво с Cucumber (overhead). _("bdd given-when-then"; verified; "https://cucumber.io/docs/gherkin/reference/"; scope: приемни тестове)_
- **2026-07-16:** Тестът е жива документация: при провал добрият тест казва ВХОД → очаквано → получено; използвай ясни съобщения (`expect(x, 'защото...').toBe(y)`). _("тест като документация"; verified; "https://vitest.dev/api/expect.html")_
- **2026-07-16:** Не пиши тест, който не може да падне (тавтология, `expect(true).toBe(true)`) — мутирай кода наум: ако тестът мълчи при счупен код, той е безполезен. _("тест трябва да може да пада"; verified; "https://kentcdodds.com/blog/how-to-know-what-to-test")_

### Performance/load/визуал (граница)
- **2026-07-16:** Load/stress тестове (k6/Artillery) мерят капацитет/латентност под товар — различно от функционалните e2e; за критични endpoint-и (checkout/API) заложи прагове. _("load testing k6"; verified; "https://k6.io/docs/"; scope: производителност)_
- **2026-07-16:** Lighthouse CI мери Core Web Vitals като гейт (координирай със SEO/Конвейерът); визуалната регресия (Playwright screenshots/Chromatic) хваща неволни UI промени. _("perf/visual гейтове"; verified; "https://github.com/GoogleChrome/lighthouse-ci"; scope: граница със SEO)_
- **2026-07-16:** Мутационно тестване (Stryker) мери СИЛАТА на тестовете (убиват ли внесени мутанти) — това е на Качествения; аз ползвам сигнала, за да усиля слаби тестове. _("mutation testing граница"; verified; "https://stryker-mutator.io/"; scope: граница с Качествения)_

### Node/Express/бекенд тестове
- **2026-07-16:** supertest удря Express app-а в паметта (`request(app)`) без реален порт → бързи рут тестове; асертирай статус/тяло/хедъри; комбинирай с тест БД за интеграция. _("supertest express"; verified; "https://github.com/ladjs/supertest")_
- **2026-07-16:** Node вграден test runner (`node:test` + `node --test`) е опция без зависимости за прости пакети; за богат DX (watch/coverage/mocks) Vitest/Jest са по-удобни. _("node:test"; verified; "https://nodejs.org/api/test.html")_
- **2026-07-16:** Тествай error пътищата, не само happy path: невалиден вход, 4xx/5xx, timeout, празни/гранични стойности; повечето бъгове са в необработените ръбове. _("error paths/edge"; verified; "https://github.com/goldbergyoni/javascript-testing-best-practices#-%EF%B8%8F-16-check-your-test-coverage-it-helps-to-identify-wrong-test-patterns")_
- **2026-07-16:** Идемпотентност/повторяемост: тест, който създава данни, трябва да ги чисти (teardown) или да върви срещу свежа БД — иначе втори ран пада (unique constraint). _("тест teardown/идемпотентност"; verified; "https://www.prisma.io/docs/orm/prisma-client/testing/integration-testing")_

### CI/паралел/стабилност (още)
- **2026-07-16:** Разделяй бавните e2e от бързите unit в отделни CI jobs → бърза обратна връзка (unit за секунди), e2e паралелно; unit гейтът блокира преди да хабиш e2e минути. _("CI разделяне на нива"; verified; "https://playwright.dev/docs/ci"; scope: граница с Конвейерът)_
- **2026-07-16:** Fully parallel режим (`fullyParallel: true`) върти тестове в рамките на файл паралелно (не само файлове) → повече скорост, но изисква стриктна изолация. _("playwright fullyParallel"; verified; "https://playwright.dev/docs/test-parallel")_
- **2026-07-16:** `maxFailures`/`-x` спира рано при много провали в CI (не хаби минути на очевидно счупен build); локално остави пълния ран за пълна картина. _("maxFailures"; verified; "https://playwright.dev/docs/test-cli#reference")_
- **2026-07-16:** Detect на flaky в CI: Playwright маркира flaky (мина на retry) в репорта; проследявай ги отделно — flaky ≠ pass, изисква поправка. _("flaky репортинг"; verified; "https://playwright.dev/docs/test-retries#flaky-tests")_

### Достъпност/договори (още)
- **2026-07-16:** Клавиатурна навигация в e2e: `page.keyboard.press('Tab'/'Enter')` тества, че всичко е достижимо без мишка (WCAG 2.1.1) — axe не хваща tab order/focus капани. _("keyboard e2e a11y"; verified; "https://playwright.dev/docs/api/class-keyboard"; scope: граница с Правния)_
- **2026-07-16:** Тествай видимия focus и aria-live обявления за динамични промени (форма грешка, статус) — критично за екранни четци; ръчно + частично автоматизирано. _("focus/aria-live тест"; verified; "https://www.w3.org/WAI/ARIA/apg/practices/"; scope: граница с Правния)_
- **2026-07-16:** Consumer-driven contract (Pact): consumer-ът дефинира очакванията, provider-ът ги верифицира в CI → хваща breaking API преди деплой; pact broker споделя договорите. _("pact broker"; verified; "https://docs.pact.io/pact_broker")_

### Репото — още
- **2026-07-16:** medqr е офлайн-first (Service Worker) — тествай офлайн поведението (`context.setOffline(true)`) и че спешният профил работи без мрежа; критичен за продукта. _("medqr офлайн тест"; verified; "https://playwright.dev/docs/emulation#offline"; scope: medqr)_
- **2026-07-16:** CSPos е Electron (.exe десктоп каса) — e2e с Playwright за Electron (`_electron.launch`) тества реалния десктоп поток (бон/сторно/Z-отчет). _("electron e2e cspos"; verified; "https://playwright.dev/docs/api/class-electron"; scope: CSPos)_
- **2026-07-16:** Многоезичните продукти (IT/EN/BG, linketto 27 локала) — тествай ключови потоци поне на 2 локала + че липсващ превод не чупи UI (fallback); координирай с Преводача. _("i18n тестове"; verified; "https://playwright.dev/docs/emulation#locale--timezone"; scope: граница с Преводача)_
- **2026-07-16:** Тествай reduced-motion пътя на творческите UI (Дизайнера/таблото): `colorScheme`/`prefers-reduced-motion` emulation → анимациите замръзват, няма строб; критично за a11y на анимационно-тежки екрани. _("reduced-motion тест"; verified; "https://playwright.dev/docs/emulation#css-media"; scope: граница с Дизайнера/Правния)_
- **2026-07-16:** Регресионен тест за всеки поправен бъг: преди фикса напиши тест, който пада заради бъга, после го оправи → тестът пази да не се върне (характеризиращ тест). _("regression тест за бъг"; verified; "https://martinfowler.com/bliki/CharacterizationTest.html")_

## Карантина (непроверени — НЕ са факт)
- **2026-07-16:** Точните текущи мажорни версии на Playwright/Vitest/MSW и техните breaking промени са време-чувствителни → потвърди в package.json на продукта и changelog на рамката преди да цитираш API. _("рамка версии; unverified; провери locally package.json + официалния changelog")_
- **2026-07-16:** Кои продукти в репото реално имат тестови пакети и какви (има ли e2e за критичните потоци) не е установено — пусни `tools/qa/test-audit.mjs` и прочети конфигурациите преди твърдение. _("репо тест покритие; unverified; tools/qa/test-audit.mjs (чети преди да твърдиш)")_
