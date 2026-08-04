# Локална инсталация на следственото издание

За машина на органа. Различава се съществено от публичния деплой на
`carbonstealth.eu` — **двете не делят инсталация и не делят конфигурация.**

## Преди да започнеш

Изданието не бива да види мрежа, преди да са налице:

- [ ] Договор по чл. 22, § 3 от Директива (ЕС) 2016/680 (не GDPR DPA) —
      суровината е `docs/PRILOJENIE-TEHNICHESKO.md`
- [ ] Решение на администратора за **срока на съхранение** на дневника
- [ ] Отговор дали е нужна предварителна консултация с КЗЛД
- [ ] Многофакторна автентикация на ниво машина или мрежа

## 1. Машина

Node ≥ 20. Отделен системен потребител без права за влизане:

```bash
sudo useradd --system --home /opt/carbonip --shell /usr/sbin/nologin carbonip
sudo mkdir -p /opt/carbonip/{app,data}
sudo chown -R carbonip:carbonip /opt/carbonip
sudo chmod 700 /opt/carbonip/data
```

**Един работен процес.** Офлайн гео базата държи около 185 MB резидентна памет и
се умножава по процес; освен това одиторският дневник се дописва синхронно и
няколко процеса биха се надпреварвали за края на веригата.

## 2. Код и зависимости

```bash
sudo -u carbonip bash -c '
  cd /opt/carbonip/app
  npm ci --omit=dev
  npm run build
'
```

## 3. Гео база

```bash
sudo -u carbonip node scripts/fetch-geoip.mjs --dir /opt/carbonip/data
```

Изданията излизат месечно, на 1-во число. Задай задача, която я обновява — стара
база дава стари отговори, без да го казва:

```
0 4 3 * * carbonip cd /opt/carbonip/app && node scripts/fetch-geoip.mjs --dir /opt/carbonip/data
```

Атрибуцията към db-ip.com е условие на лиценза CC BY 4.0 и е във футъра. Не я маха́й.

## 4. Тайна за сесиите

```bash
sudo -u carbonip bash -c 'umask 077 && openssl rand -base64 48 > /opt/carbonip/data/session.key'
```

Тайната живее **само на машината**, никога в хранилището и никога в архива за
деплой. Смяната ѝ изхвърля всички отворени сесии — това е желаното поведение при
съмнение за компрометиране.

## 5. Служители

```bash
cd /opt/carbonip/app
sudo -u carbonip IPLOOKUP_USERS_FILE=/opt/carbonip/data/users.json \
  node scripts/add-user.mjs ivanov "Иван Иванов" "РПУ Дупница" operator
```

Роли: `operator` (заявител) · `supervisor` (ръководител) · `auditor` (одитор).
**Един служител — един идентификатор.** Одиторският запис трябва да сочи човек,
не длъжност. Одиторът нарочно не може да прави справки.

## 6. Услуга

`/etc/systemd/system/carbonip.service`:

```ini
[Unit]
Description=Карбон IP — следствено издание
After=network-online.target

[Service]
Type=simple
User=carbonip
WorkingDirectory=/opt/carbonip/app
# Слуша САМО на локалния адрес. Изнасянето навън е решение на органа и минава
# през обратно прокси с TLS, не през смяна на този ред.
Environment=HOST=127.0.0.1
Environment=PORT=3000
Environment=NODE_ENV=production
Environment=IPLOOKUP_MODE=investigation
Environment=IPLOOKUP_USERS_FILE=/opt/carbonip/data/users.json
Environment=IPLOOKUP_AUDIT_DIR=/opt/carbonip/data/audit
Environment=IPLOOKUP_EVIDENCE_DIR=/opt/carbonip/data/evidence
Environment=IPLOOKUP_GEOIP_DB=/opt/carbonip/data/dbip-city-lite-2026-08.mmdb
# Броят НАШИ обратни прокси-та. Грешна стойност тук значи грешен адрес в дневника.
Environment=IPLOOKUP_TRUSTED_HOPS=1
EnvironmentFile=/opt/carbonip/data/session.env
ExecStart=/usr/bin/npm run start

# Изданието пише само в своята папка и никъде другаде.
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
NoNewPrivileges=true
ReadWritePaths=/opt/carbonip/data
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

`session.env` (права 600, собственик `carbonip`):

```
IPLOOKUP_SESSION_SECRET=<съдържанието на session.key>
```

Ако тайната липсва, входът връща 503 — нарочно. По-добре нула достъп, отколкото
подправими жетони.

**Geofeed и активната проверка остават изключени.** Първата уведомява оператора
на проверявания адрес, втората — самата цел. Включват се с
`IPLOOKUP_ALLOW_GEOFEED=1` / `IPLOOKUP_ALLOW_PROBE=1` само с решение на органа.

## 7. Обратно прокси

TLS задължително, дори в локална мрежа: сесийната бисквитка е `Secure` в
продукция и без HTTPS входът няма да работи. Nginx: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`
и `set_real_ip_from` с адреса на самото прокси.

Броят прокси-та трябва да съвпада с `IPLOOKUP_TRUSTED_HOPS`. Разминаване тук
означава грешен адрес в одиторския дневник.

## 8. Дневник — поддръжка

```bash
# Проверка на целостта (нула зависимости, не ползва приложението)
sudo -u carbonip IPLOOKUP_AUDIT_DIR=/opt/carbonip/data/audit node scripts/verify-audit.mjs

# Запечатване и започване на нов
sudo -u carbonip IPLOOKUP_AUDIT_DIR=/opt/carbonip/data/audit node scripts/rotate-audit.mjs
```

Запечатването **не реже** веригата: архивът получава печат с броя записи,
началното и крайното звено и SHA-256 на файла, а новият дневник продължава от
същото звено. След унищожаване на архива по срок печатът остава като
доказателство какво е съдържал.

Провери целостта поне веднъж месечно и преди всяко запечатване. Повредена верига
е **находка** и се разследва — `rotate-audit.mjs` отказва да запечата такава без
изричен `--force`.

## 9. Резервни копия

Копирай цялата `/opt/carbonip/data`. Дневникът и замразените артефакти са
единственото незаменимо там — кодът и гео базата се свалят наново.

Копията съдържат кой какво е разследвал. Съхраняват се със същата защита като
самата система.

## 10. Проверка след пускане

- [ ] `/ip/8.8.8.8` без вход → пренасочва към `/vhod`
- [ ] Приложен интерфейс без вход → 401
- [ ] Грешна парола → отказ, и в дневника има запис
- [ ] Справка без зададена преписка → спряна
- [ ] Одитор → вижда `/dnevnik`, но не може справка
- [ ] Заявител → може справка, но `/dnevnik` е отказан
- [ ] `verify-audit.mjs` → веригата е цяла
