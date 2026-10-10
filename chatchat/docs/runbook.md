# ChatChat — runbook (наблюдаемост и надеждност, F3)

Какво значи всяка аларма от `deploy/monitoring/alerts.yml`, как се проверява и какво се прави.
Спецификация: „AI Technical Support Platform v1.1“ — NFR-01 (наличност 99.5 %), NFR-02 (P95 на
текстовия отговор ≤ 8 s), NFR-07 (повторни опити, идемпотентност, circuit breaker), NFR-09
(наблюдаемост), NFR-11 (реално време P95 ≤ 2 s).

## SLO-тата

| SLO                  | SLI (от гледна точка на техника)                                         | Цел / 30 дни | Error budget |
| -------------------- | ------------------------------------------------------------------------ | ------------ | ------------ |
| NFR-01 наличност     | заявки без 5xx / всички (без `/healthz`, `/readyz`, SSE потока)          | 99.5 %       | 0.5 % заявки |
| NFR-02 AI латентност | текстови отговори (`answered`/`no_evidence`) до 8 s / същите + `timeout` | 95 %         | 5 % отговори |
| NFR-11 реално време  | събития, записани в потоците до 2 s / всички доставени                   | 95 %         | само тикет   |

Алармите са по burn-rate на много прозорци (SRE Workbook, табл. 5-8): **страница** при 14.4× (1 ч +
5 мин) и 6× (6 ч + 30 мин), **тикет** при 1× (3 дни + 6 ч). Страниците искат минимален обем (20
заявки/ч, 50/6 ч; 5 AI отговора/ч, 10/6 ч) — при малко трафик една грешка не буди човек.
`severity: page` = действие сега; `severity: ticket` = в работно време.

Отговорите със снимки/логове (`input="files"`) са извън SLO-2 — по-бавни по природа; виждат се в
метриките отделно.

## Включване (решение на собственика)

Prometheus/Alertmanager **не са инсталирани** — това е решение на собственика (къде тече, кой
получава страниците). Приложението е готово:

1. В `/opt/few-few/shared/chatchat/.env`: `METRICS_PORT=9464` (порт на ХОСТА) → нов деплой.
   Слушателят е отделен от публичния порт; на хоста е публикуван **само** като `127.0.0.1:9464`,
   nginx никога не го проксира.
2. Проверка: `curl -fsS 127.0.0.1:9464/metrics | head` (на сървъра).
3. Prometheus на същия хост (или през SSH тунел) — образец: `deploy/monitoring/prometheus.example.yml`
   (job `chatchat`, правилата от `alerts.yml`). Проверка на правилата:
   `promtool check rules alerts.yml && promtool test rules alerts.test.yml`.
4. Alertmanager: маршрут `severity="page"` → телефон/известие; `severity="ticket"` → имейл/тикет.
5. Външна синтетична проба (истината отвън): `https://chatchat.carbonstealth.eu/healthz` на 1 мин от
   монитора на VPS-аджията (Uptime Kuma/Beszel) — улавя и срив на nginx/TLS, който метриките не виждат.

## Обща диагностика

```bash
cd "$(cat /opt/few-few/shared/chatchat/last-good)"   # работещият release (DEPLOY.md)
CC="sudo docker compose"
$CC ps                                               # db, clamav, app — healthy?
curl -fsS 127.0.0.1:4330/readyz                      # {"ok":true,"app":"chatchat","ai":true,"aiCircuit":"closed"}
curl -fsS 127.0.0.1:${METRICS_PORT:-9464}/metrics | grep -E '^chatchat_(http_requests_total|ai_answers_total|circuit_breaker_state)'
$CC logs --since 30m app | grep -E '"level":(40|50)'  # warn/error (pino: 40 = warn, 50 = error)
```

Логовете са JSON (pino) без съдържание на въпроси/отговори, без имейли и токени — само кодове и id.
`/readyz` се отваря само от хоста (nginx го отказва отвън). `ok` зависи само от базата; `aiCircuit` е
състоянието на breaker-а към Vertex (`closed` / `open` / `half_open`; `null` — AI е изключен).

## ChatchatAvailabilityBurnFast

**Значи:** над 7.2 % от заявките за последния час (и последните 5 мин) са 5xx — при този темп
месечният бюджет (0.5 %) изгаря за ~2 дни. Техниците виждат грешки сега.

**Провери:**

```bash
curl -fsS 127.0.0.1:9464/metrics | grep chatchat_http_requests_total | grep 'status="5'
$CC logs --since 30m app | grep -E 'необработена грешка|AI извикването се провали|circuit breaker'
curl -fsS 127.0.0.1:4330/readyz
```

- 5xx само на `route="/api/v1/chat/messages"` със статус 503 → AI доставчикът (виж
  [ChatchatAiProviderUnavailable](#chatchataiproviderunavailable)).
- 5xx по всички маршрути + `/readyz` 503 → базата: `$CC ps db`, `$CC logs --tail=80 db`.
- 500 с `необработена грешка` след деплой → регресия в кода.

**Направи:** базата — `$CC restart db` само ако е спряла (томовете не се пипат, **никога**
`down -v`). Регресия след деплой → откат (DEPLOY.md, т. 7):
`sudo CHATCHAT_SKIP_BACKUP=1 bash "$(cat /opt/few-few/shared/chatchat/last-good)/deploy/deploy.sh"`.
После — blameless postmortem (хронология, причина, действия със собственик).

## ChatchatAvailabilityBurnSlow

**Значи:** над 3 % 5xx за 6 ч (и последните 30 мин) — 5 % от месечния бюджет за 6 ч. По-бавна, но
трайна повреда (напр. един маршрут, AI доставчикът с прекъсвания).

**Провери:** като горе; разбивката по маршрут показва кой е виновният:
`curl -fsS 127.0.0.1:9464/metrics | grep 'chatchat_http_requests_total' | grep 'status="5' | sort -t' ' -k2 -n`.

**Направи:** като горе. Ако е само AI пътят — виж breaker-а; ако е един маршрут — тикет към
Кодаджията с маршрута и часа (без данни на клиента).

## ChatchatAvailabilityBudgetTicket

**Значи:** за 3 дни 5xx са над 0.5 % — с този темп бюджетът свършва преди края на 30-те дни.

**Провери:** трендът на `chatchat:availability_errors:ratio_rate3d` в Prometheus; кои маршрути.

**Направи:** приложи политиката за бюджета (по-долу); тикет за причината.

## ChatchatAiLatencyBurnFast

**Значи:** над 72 % от текстовите AI отговори за последния час са над 8 s (или са таймаут) — P95 ≤ 8 s
(NFR-02) е нарушен силно.

**Провери:**

```bash
curl -fsS 127.0.0.1:9464/metrics | grep -E 'chatchat_ai_answer_duration_seconds_(bucket|count)\{outcome="answered",input="text"'
curl -fsS 127.0.0.1:9464/metrics | grep chatchat_ai_answers_total
curl -fsS 127.0.0.1:9464/metrics | grep -E 'chatchat_circuit_breaker_(state|transitions_total)'
$CC logs --since 30m app | grep -E 'семантичното търсене е пропуснато|AI извикването се провали'
```

- Много `timeout` → Vertex е бавен/претоварен (регион `eu`); breaker-ът ще се отвори при провали.
- Бавно, без таймаути → проверка на `AI_EFFORT`/`AI_MAX_TOOL_ROUNDS` (повече кръгове = повече време),
  на embeddings (`EMBEDDING_TIMEOUT_MS`, по подразбиране 4 s, се плаща преди модела) и на базата.

**Направи:** временно `AI_EFFORT=low` или `AI_MAX_TOOL_ROUNDS=2` в `.env` + деплой (решение на
собственика — сменя качеството). Проблем при Google → status.cloud.google.com, тикет към GCP.

## ChatchatAiLatencyBurnSlow

**Значи:** над 30 % от текстовите отговори за 6 ч са над 8 s. **Провери / Направи:** като горе.

## ChatchatAiLatencyBudgetTicket

**Значи:** за 3 дни над 5 % от текстовите отговори са над 8 s — SLO-2 се пропуска системно.
**Направи:** тикет: профил на времето (търсене / модел / кръгове инструменти) по `evals/`, прегледай
промпта и тавана на инструментите. Политиката за бюджета (по-долу).

## ChatchatDown

**Значи:** Prometheus не чете `/metrics` от 3 мин — процесът е спрял, рестартира се или слушателят на
метриките не е тръгнал. Симптомите отвън — от синтетичната проба на `/healthz`.

**Провери:**

```bash
$CC ps app
$CC logs --tail=80 app | grep -E 'chatchat слуша|метриките не тръгнаха|Невалидна конфигурация|P30'
curl -fsS 127.0.0.1:4330/healthz; curl -fsS 127.0.0.1:9464/metrics >/dev/null && echo metrics-ok
```

- `Невалидна конфигурация` → грешна стойност в `.env` (съобщението казва коя) — поправи и деплой.
- `P3018`/`P3009` → провалена миграция (DEPLOY.md, т. 7).
- `метриките не тръгнаха` + `EADDRINUSE` → друг процес държи METRICS_PORT; приложението работи —
  смени порта в `.env`.

**Направи:** `$CC up -d app`; ако не тръгва след деплой — откат (DEPLOY.md, т. 7).

## ChatchatAiProviderUnavailable

**Значи:** circuit breaker-ът към Vertex (`vertex_messages`) е отворен над 15 мин — след
`AI_BREAKER_FAILURES` (5) последователни провала (429/5xx/мрежа/таймаут) извикванията се отказват
бързо с 503 `ai_unavailable`, без да стигат до Google; на всеки `AI_BREAKER_COOLDOWN_SECONDS` (30 s)
минава ЕДНА проба. Случаите, разговорите и търсенето работят; човешкото съобщение се пази и повторът със
същия `clientMessageId` пита модела, щом доставчикът се върне (AC-12).

**Провери:**

```bash
curl -fsS 127.0.0.1:4330/readyz                                   # "aiCircuit":"open"
$CC logs --since 1h app | grep -E '"msg":"circuit breaker"|AI извикването се провали'
curl -fsS 127.0.0.1:9464/metrics | grep -E 'chatchat_circuit_breaker_(transitions|rejections)_total'
```

Статусът в лога (`status`): 429 → квота; 401/403 → ключът на service account-а (`GCP_SA_FILE`,
права „Vertex AI User“); 404 → моделът `AI_MODEL` не е наличен в `eu`; `null` → мрежа/таймаут.

**Направи:** 429 → квота в GCP (Vertex AI → Quotas, регион `eu`); 401/403 → ключът (DEPLOY.md, т. 1);
Google инцидент → чакай, breaker-ът се затваря сам след успешна проба. Резервен доставчик **няма** по
дизайн (само Vertex в ЕС) — не се включва друг.

## ChatchatSemanticSearchDegraded

**Значи:** breaker-ът към embeddings (`vertex_embeddings`) е отворен над 30 мин. Търсенето е
fail-open: работи само точното + пълнотекстовото; отговорите са по-бедни, но верни. Новите документи
не получават вектори, докато не се затвори (фоновото индексиране ги догонва само).

**Провери:** `curl -fsS 127.0.0.1:9464/metrics | grep 'breaker="vertex_embeddings"'`;
`$CC logs --since 1h app | grep -E 'семантичният индекс не е обновен|circuit breaker'`.

**Направи:** като при AI доставчика (същият проект и регион). След възстановяване: `npm run embed` не е
нужно — индексирането минава на `EMBEDDING_SWEEP_SECONDS`.

## ChatchatUploadsFailing

**Значи:** над половината качвания за 30 мин падат на антивируса (`av_scan_failed`) — файлът не се
приема (fail-closed, никога „приет без проверка“). Чатът работи без прикачени файлове.

**Провери:**

```bash
$CC ps clamav                                    # healthy? (зареждането е 1–2 мин след старт)
$CC logs --tail=60 clamav
curl -fsS 127.0.0.1:9464/metrics | grep 'chatchat_av_scans_total{verdict="FAILED"'   # reason: connect / timeout / clamd_error
```

**Направи:** `connect` → `$CC restart clamav` (DEPLOY.md, т. 8); `timeout` → големи файлове или бавен
диск — `CLAMAV_TIMEOUT_MS`; `clamd_error` → сигнатурите/паметта (`mem_limit` 2 GB).

## ChatchatRealtimeSlow

**Значи:** над 5 % от събитията в реално време се записват в потоците за повече от 2 s (NFR-11).
Времето е от публикуването до записа: опашката на хъба + проверката на правата в базата. UI-ят не губи
нищо — при reconnect догонва по REST.

**Провери:** `curl -fsS 127.0.0.1:9464/metrics | grep -E 'chatchat_(sse_streams|realtime_)'`; бавна база
(`$CC logs db`); натоварен event loop (`nodejs_eventloop_delay_p99_seconds`).

**Направи:** тикет. Един процес носи всички потоци (CLAUDE.md) — при растеж се добавя pub/sub, не втора
инстанция без него.

## ChatchatMetricsCardinalityCap

**Значи:** метрика удари тавана на сериите си (500, при Safety Gate — 100) — нов етикет носи
променлива стойност. Това е грешка в кода и **риск от лични данни** в метриките.

**Провери:** `curl -fsS 127.0.0.1:9464/metrics | grep chatchat_metrics_series_dropped_total` — кой е
`metric`; после стойностите на етикетите му.

**Направи:** тикет към Кодаджията — етикетите са само затворени множества от кодове (CLAUDE.md,
инварианти). Ако в етикет има id/имейл/текст — поправка веднага и рестарт (метриките са в паметта).

## Шифроване в покой (NFR-03): рестарт, изгубен ключ, ротация

Не е аларма, а процедури — моделът и командите са в DEPLOY.md, т. 12. Ключовете се пазят и при
собственика, извън сървъра, **никога заедно с бекъпите**.

### Базата не тръгва след рестарт на машината (томът не е отключен)

**Симптом:** [ChatchatDown](#chatchatdown) / `/readyz` 503; `$CC ps -a db` — спрян или `Created`;
`$CC up -d db` → `bind source path does not exist: …/pgdata/data`; `sudo chatchat-pgdata status` →
`отключен: не`.

**Направи:**

- Режим с ключов файл: `journalctl -u chatchat-pgdata -b` — защо не е отключил (липсва
  `/etc/chatchat/pgdata.key`; друг UUID — грешен носител; Hetzner Volume не е закачен към машината).
  После `sudo chatchat-pgdata open` — отключва, монтира и пуска db и app.
- Ръчен режим: `sudo chatchat-pgdata open` и паролата. Другите продукти на машината не чакат това.
- **Никога** не създавай `pgdata/data` на ръка и не махай `COMPOSE_FILE` от `.env`: първото дава
  празна база върху некриптирания диск, второто — базата от стария том (`db-data`), с остарели данни.

### Приложението не тръгва: `Невалидна конфигурация: FILES_KEK…`

`FILES_KEK` липсва или е повреден в `/opt/few-few/shared/chatchat/.env`. Върни го от password
manager-а и пусни `deploy.sh`. Ако има шифровани файлове, `deploy.sh` **отказва** да роди нов ключ
(нов ключ не ги отваря). `FILES_KEK` равен на `MFA_ENC_KEY` също се отказва — отделни ключове.

### Изгубен FILES_KEK

Ако копие има — `.env` и деплой (горе). Ако **наистина** е изгубен, шифрованите файлове не се
възстановяват — по дизайн, и тези в бекъпите (те носят същия шифротекст):

1. Нов ключ на ръка: `openssl rand -base64 32` → `FILES_KEK=` в `.env` (и в password manager-а), деплой.
   Новите файлове се пишат с него.
2. `$CC exec -T app node dist/cli/files.js verify --db` — броят `неуспешни` (`unknown_key`) са
   загубените; свалянето им дава 500 и се вижда в логовете.
3. Решение на собственика: оригиналите на документите (PDF) — качват се наново от хранилището на
   клиента (§17.3: оригиналите се пазят с checksum; текстът и знанието в базата остават); снимките и
   логовете в случаите — загубени (техникът ги качва наново при нужда).

### Изгубен ключ на тома на базата

- **Томът още е отключен** (сървърът не е рестартиран): данните са достъпни. Веднага пълен бекъп
  (`sudo systemctl start chatchat-backup.service`) и проверката му (DEPLOY.md, т. 10). После нов том:
  `sudo chatchat-pgdata close` → премести `/etc/chatchat/pgdata.conf` настрана → `enable` върху нов
  носител (нов Volume или нов файл: `CHATCHAT_PGDATA_FILE=…/pgdata-2.luks`). Без стария том
  `db-data` това е празна база, с него — мигрира стария (остарял) том; и в двата случая следва
  `deploy.sh` → `backup-restore.sh --live --yes-i-know` от бекъпа от преди малко (заменя всичко).
- **Томът е заключен:** данните в него не се връщат. Същото като горе, от последния дневен бекъп —
  губи се всичко след него (до 24 ч).
- Затова: копие на `/etc/chatchat/pgdata.key` (`sudo base64 /etc/chatchat/pgdata.key`) извън
  сървъра веднага след `enable` и след всяка ротация.

### Ротация на ключовете

- `FILES_KEK` — DEPLOY.md, т. 12 („Ротация на FILES_KEK“): старият във `FILES_KEK_PREVIOUS` → деплой
  → `files.js rekey` (преопакова само DEK; изход 0 = нищо със стар ключ) → махни стария. Старият се
  пази офлайн, докато има бекъпи отпреди ротацията (до 8 седмици).
- Ключът на тома — `sudo chatchat-pgdata rotate-key` (нов ключов файл: добавяне → проба → махане на
  стария слот). Ръчен режим — `cryptsetup luksChangeKey <носителя>` (`chatchat-pgdata status`).
- Подозрение, че главният ключ на тома е изтекъл (не само ключовият файл) → `cryptsetup reencrypt`
  или нов том + миграция; планира се с престой.

### Повреден файл (`files.js verify` → `corrupt`)

Обектът е отрязан, подменен или повреден на диска — не се сервира (500), никога „почти верен“. Вземи
същия обект от бекъпа на файловете (репетиция в нова папка, DEPLOY.md т. 10 — там той вече е
проверен с разшифроване) и го сложи на същия ключ (`<tenant>/<yyyy>/<mm>/<id>`, uid 1000, mode 600);
`verify` отново. Много повредени наведнъж → дискът (`dmesg`, SMART) и [ChatchatDown](#chatchatdown).

## Политика за бюджета (проект — за одобрение от собственика)

Записва се ПРЕДИ инцидент, не по време на него (product + eng + SRE):

1. Бюджетът (0.5 % за NFR-01, 5 % за NFR-02) е изразходен за 30 дни → замразяват се рискови промени
   (нов модел/промпт, миграции, нови функции) до възстановяване; минават само поправки за надеждност
   и сигурност.
2. Един инцидент изяде над 20 % от месечния бюджет → blameless postmortem с действия и собственик.
3. Бюджетът се изразходва системно от една причина извън нас (Vertex) → решение на собственика:
   регион/модел/квота, не по-нисък SLO по подразбиране.
4. Смяна на целта на SLO — само с решение на собственика и запис тук.

## Каталог на метриките

| Метрика                                                                                                                       | Тип                | Етикети                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------- |
| `chatchat_http_requests_total`                                                                                                | брояч              | `method`, `route` (шаблон), `status`                                                                |
| `chatchat_http_request_duration_seconds`                                                                                      | хистограма         | `method`, `route` (без SSE)                                                                         |
| `chatchat_ai_answers_total` / `chatchat_ai_answer_duration_seconds`                                                           | брояч / хистограма | `outcome` (answered, no_evidence, ai_unavailable, timeout, error, cancelled), `input` (text, files) |
| `chatchat_safety_gate_interventions_total`                                                                                    | брояч              | `reason` (код `gate.*`/`ai.*`, иначе `other`)                                                       |
| `chatchat_safety_gate_answers_total`                                                                                          | брояч              | `level` (standard, caution, blocked)                                                                |
| `chatchat_attachment_uploads_total`                                                                                           | брояч              | `kind`, `result` (clean, infected, scan_failed, rejected)                                           |
| `chatchat_av_scans_total` / `chatchat_av_scan_duration_seconds`                                                               | брояч / хистограма | `verdict`, `reason`                                                                                 |
| `chatchat_sse_streams`                                                                                                        | gauge              | —                                                                                                   |
| `chatchat_realtime_events_total` / `chatchat_realtime_delivery_seconds`                                                       | брояч / хистограма | `type`, `result` / —                                                                                |
| `chatchat_circuit_breaker_state`                                                                                              | gauge (0/1/2)      | `breaker` (vertex_messages, vertex_embeddings)                                                      |
| `chatchat_circuit_breaker_transitions_total` / `…_rejections_total`                                                           | брояч              | `breaker`, `to` / `breaker`                                                                         |
| `chatchat_metrics_series_dropped_total`                                                                                       | брояч              | `metric`                                                                                            |
| `process_resident_memory_bytes`, `nodejs_heap_used_bytes`, `nodejs_eventloop_delay_p99_seconds`, `process_start_time_seconds` | gauge              | —                                                                                                   |

`cancelled` = техникът е затворил заявката преди отговора — не е грешка на системата и е извън SLO-2.

**Никога в метриките:** tenantId, userId, имейл, номер/id на случай, QR токен, текст на въпрос/отговор,
име на файл, сигнатура на вирус. Маршрутът е шаблонът (`/api/v1/cases/:id`), не пътят.
