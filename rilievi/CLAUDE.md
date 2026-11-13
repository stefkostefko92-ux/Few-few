# CLAUDE.md — Rilievi Impianti

Портал само с покана (и публична витрина със заявка за достъп) за схемите за оглед на асансьорни уредби („scheda rilievo impianto“): попълване на
29-те полета от заданието и полетата от второто (врати, аларма, работна карта, мерки на старите
бутониери по спирки), търсене (№ на асансьора, матрикула, адрес, марка, работна карта, бележки), печат
A4 и PDF. Модулите: при табло Pelazza / MoviLift / DMG (Pitagora 4.0) / Mastech (NG120 или QI Touch — втори избор) /
Elettroquadri (geared, gearless или oleodinamico — сам по вида на уредбата) (поръчката), „Vuoi compilare la scheda ordine
bottoniere DMG?“ при „Bottoniere da sostituire: Sì“ (QF Fixtures на DMG), „Argano da sostituire?“ (листът с данни за аргано) и „Sospensioni da cambiare?“ /
„Operatore da cambiare?“ (листът на 2SG за оператора и окачванията — начертан наново от нас) и отметката „AMI 100 Mono RTBS“ в
решенията при намалено горно пространство или яма (листът AMI 100 Mono RTBS — начертан от нас) се попълва самият модул и излиза
като отделен PDF — празният лист с данните върху него. Редът на разделите на картата се избира за всяка фирма (настройките на администратора ѝ);
кои раздели влизат в печата и PDF-а — за всяка карта (в края на формата). Снимки и клипове — във
всеки раздел на картата, компресирани от фонов процес (`worker`); снимките — избрани като иконки в края
на формата, в края на печата и PDF-а, в избран ред и големина (с преглед на страниците). Скицник (за всички
фирми, винаги включен): листове, нарисувани на ръка в края на картата, в печата и PDF-а. Листът за интервенция („Servizio assistenza elevatori ·
Modulo di pronto intervento“, като хартиения блок): номер за фирмата от 1, точките 01–97 с кръстчета,
подписите на техника и на клиента с пръст; след „Conferma“ не се пипа — само PDF A4 и имейл.
Новините на портала — публична страница `/novita` и прозорец в портала при първата страница след всяко обновяване
с новото от последното прочитане. Многофирмен: всяка фирма (клиент на портала) има свои хора, свои карти и свое лого на листа. Един човек
може да е в няколко фирми, с различна роля във всяка (слага го само MASTER).
Бранд Carbon Stealth VCC, монохромен (бяло/черно, светла и тъмна тема). Самостоятелен продукт —
`cd rilievi/` за всичко. Домейн: rilievi.carbonstealth.eu (порт 4330).

## Версията

**4.5 от 13 ноември 2026** (3.0 — 12 ноември; 3.1 — поправките от одита преди пазара; 4.0 — проверката във VIES,
връщанията и споровете през Revolut, алармите в Discord, публичните `/prezzi` и `/segnalazioni` с модерирането,
условията 2026-11-13; 4.1 — продажбата с български ДДС при номер извън VIES, кредитните известия, условията
2026-11-14, външният монитор на `/health`; 4.2 — пощата казва защо писмо не е тръгнало, „Richiedi la firma“ работи и
в навечерието на версия, която влиза сама, редовете на офертата при празен ценоразпис; 4.3 — кодът за подпис важи 30
минути, бележка „5–10 minuti“ там, където порталът праща писмо, формата на подписа не тръгва без отметката;
4.4 — записаната карта се праща по имейл от страницата си; 4.5 — листовете на DMG излизат на един език за всеки
четец и принтер, текстът в полетата на формулярите не се реже от кутийката си; собственикът: „Смени версията на софтуера ни и започни да я тълкуваш като versione 3.0.
След всеки patch вдигаш цифрата след 3, при големи добавяния вдигаш цялостното ниво“). MAJOR.MINOR в ЕДНО място —
`src/versione.ts` (`VERSIONE_SOFTWARE`); `package.json` и `package-lock.json` го следват като `MAJOR.MINOR.0`
(тестът `tests/versione.test.ts`). **Всеки patch** (поправка или малка промяна, която стига до хората) — второто
число +1 (3.0 → 3.1 → 3.2 …), в същия commit; **голямо добавяне** (нов модул, нов вид документ, нова голяма функция) —
следващото цяло (3.x → 4.0). Всяка версия — новина най-отгоре в `novita/voci.ts`. Вижда се долу на всяка страница
(връзка към `/novita`), на PDF-ите на изчисленията, бона и офертата („Generato con Rilievi Impianti 3.0“), в
„Salute del sistema“ на конзолата, в JSON-LD (`softwareVersion`) и в llms.txt. „Build“ (отпечатъкът на кода в
`src/build.ts`) остава отделно — той е за сверката на листовете.

## Стек

Node ≥22 · TypeScript strict (ESM, `NodeNext`) · Express 5 · EJS (сървърно рендиране, строг CSP с nonce,
`style-src-attr 'none'`) · Prisma 6 + PostgreSQL 16 (`pg_trgm`) · zod на всеки външен вход · pino (без
PII и токени) · Argon2id · JWT (jose, HS256) в HttpOnly бисквитка, проверяван срещу сесия в базата ·
pdfkit + DejaVu Sans (PDF с кирилица) · pdftoppm (poppler-utils — картинката на табелата) · pdf-lib + @pdf-lib/fontkit (модулите на доставчиците, попълнени
с DejaVu) · multer + sharp (логото на фирмата, прекодирано; снимките) · ffmpeg (клиповете — само в
контейнера `worker`) · Fira Sans /
Fira Sans Condensed от @fontsource (без CDN).
UI: **само италиански** (решение на собственика) — един речник в `locales/it/`, без избор на език.

## Команди (гейтът)

```bash
npm ci
npm run check            # prisma generate, format:check, typecheck, test, build — преди всеки push
npm test                 # unit (node:test през tsx) — без база
npm run test:integration # реален PostgreSQL: TEST_DATABASE_URL (името съдържа _test/_ci — таблиците се трият)
npm run test:e2e         # Chromium + axe (WCAG 2.1 AA) срещу работещ портал: RILIEVI_URL, E2E_EMAIL, E2E_PASSWORD
                         # (MASTER акаунт); създава фирма, карти и покани — само локално/staging
npm run dev              # локално на :4330, чете .env (README, „Локално“)
npm run worker           # компресията на снимките и клиповете (иска ffmpeg/ffprobe; MEDIA_DIR=./media)
npm run build            # prisma generate + tsc + шрифтовете в public/fonts (scripts/fonts.mjs)
npm run moduli:disegna   # чертае листовете на 2SG и AMI 100 Mono RTBS и картите им (assets/moduli) — после commit
npm run moduli:dmg       # картите на двата формуляра на DMG от самите PDF-и (scripts/moduli/dmg.mjs) — после commit
npm run moduli:geat      # картата на формуляра на GEAT от самия PDF (scripts/moduli/geat.mjs) — после commit
npm run render:encode    # снимките на витрината: scripts/render/out/*.png → public/img/site (AVIF + WebP)
npm run brand:logo       # логата: scripts/logo/originals/{mark,logo}.png → public/img/brand (WebP) + favicon-*.png
                         # + иконите на приложението icon-{192,512}.png и icon-maskable-{192,512}.png
npm run owner:create     # първият MASTER от OWNER_EMAIL/OWNER_NAME/OWNER_PASSWORD (на сървъра: deploy/create-master.sh)
```

## Подредба

```
src/
  config.ts          zod схема на средата (процесът не тръгва с полуготов конфиг)
  server.ts          helmet/CSP, редът на middleware-ите, грешките; рутерите в реда им — routes/montaggio.ts
  novita/            новините: voci.ts (ЕДИНСТВЕНИЯТ списък, без база: кога, кое не е прочетено, по дни) ·
                     registro.ts (таблицата `Novita` — кога е излязла всяка; прочитането) · popup.ts
                     (прозорецът в портала — middleware)
  auth/              роли (7 нива), scope.ts (обхватът по фирма и способност), manage.ts (кой управлява
                     кого), memberships.ts, permessi.ts (имената и правата на ролите по фирма) ·
                     lockout.ts (заемане на опит, поредни заключвания) · rete.ts (таванът по мрежа) ·
                     totp.ts · recovery.ts · codice.ts (проверката на втория фактор) · chiavi.ts (HKDF,
                     AES-256-GCM, HMAC) · oidc.ts + oidc-stato.ts + oidc-valori.ts (входът с Microsoft/Google) ·
                     nomi-ruoli.ts (`ruolo()` в изгледите) · registro.ts (кои записи на регистъра се
                     виждат), пароли, JWT сесии, заключване, CSRF
  aziende/           service.ts (фирмите) · logo.ts (проверка по байтове + прекодиране през sharp) ·
                     esportazione.ts + tar.ts (износът на фирмата) · eliminazione.ts (изтриването, 90 дни) ·
                     sezioni.ts (редът на разделите на фирмата — запис, одит) · dati.ts (данните на фирмата — zod,
                     четене с недоверие, главата на табелата) · intestazione.ts (запис на данните и на
                     шаблона на табелата, одит; `testataDi` — главата на табелата: логото и данните) ·
                     ruoli.ts (имената и правата от настройките, одит)
  services/          вход (login.ts, login-2fa.ts — кодът след паролата), reauth.ts (потвърждение в
                     сесия), due-fattori.ts (включване, кодове, изключване, нулиране), покани,
                     потребители, членства (фирми и роли), токени (в базата само SHA-256), revoche.ts
                     (връзките за парола и поканите, които спират с причината си)
  schede/            fields.ts (ЕДИНСТВЕНИЯТ списък полета и условията им) + fields-quadro.ts +
                     fields-argano.ts + fields-centralina.ts + fields-serrature.ts (разделите им) +
                     field-conditions.ts + field-options.ts · field-parsers.ts (zod по вид) ·
                     validation.ts + validation-campi.ts (проверката на всяко поле) · stampa.ts (разделите и модулите в печата) · misure.ts (мерките по
                     спирки) · search.ts · service.ts +
                     list.ts (списъкът и търсенето) · ordine.ts (редът на разделите, без база) ·
                     format.ts · pdf.ts + pdf-head.ts (заглавната лента, табелата) + pdf-layout.ts +
                     pdf-spunte.ts (квадратчетата и отметките, с линии) + pdf-table.ts + pdf-foto.ts +
                     pdf-schizzi.ts (листовете на скицника, векторно)
  interventi/        листът за интервенция: voci.ts (точките 01–97 дословно от блока, празните места,
                     проверката им) · firma.ts (подписът — щрихи 600 × 200, zod, SVG пътят) · form.ts
                     (черновата, zod — без подписи) · service.ts (номерът — брояч на фирмата в
                     транзакцията; черновата с `base`; одитът) · conferma.ts (подписите и потвърждението —
                     един UPDATE; проверката на печата) · sigillo.ts (отпечатъкът SHA-256, печатът HMAC) ·
                     pdf.ts + pdf-parti.ts (една страница A4)
  cartelli/          табелата „Avviso di fermo impianto“: modelli.ts (петте шаблона от assets/cartelli —
                     SHA-256, картата в пиксели, изчистването на примерните данни) · vista.ts
                     (картинката на табелата — самият PDF, WebP) · anteprima.ts (голият шаблон —
                     само без pdftoppm) · form.ts (zod) · service.ts (запис с `base`, изтриване,
                     одит) · da-scheda.ts (попълването от картата — без база) · scheda.ts (картата
                     на табелата: избор, търсене, паметта) · pdf.ts (A4 по посоката на шаблона, логото и данните на фирмата горе)
  buoni/             „Buono di lavoro“: voci.ts (проверките, подписите долу, таваните) · posti.ts (мястото на
                     подпис) · form.ts (разборът, zod) + form-valori.ts (стойностите на формата, от картата) ·
                     dati.ts (редът ↔ данните, с недоверие) · firme.ts (отпечатъци, план на подписите, печат —
                     без база) · service.ts (запис с подписите, изтриване) + elenco.ts (четене, търсене) ·
                     documento.ts (проверените подписи, PDF-ът) · pdf.ts + pdf-foglio.ts + pdf-sezioni.ts
  preventivi/        офертите (C1): importi.ts (парите — цели центове, хилядни за количеството, стотни от
                     процента за отстъпката; ДДС по ставка — без база) · form.ts (разборът, zod) · dati.ts
                     (редовете ↔ JSON с недоверие, сборовете) · listino.ts (ценоразписът) · service.ts (номерът —
                     брояч на фирмата; `base`; състоянията) · elenco.ts · azienda.ts (включването от MASTER,
                     условията по подразбиране) · da-scheda.ts · documento.ts + pdf.ts + pdf-parti.ts (A4)
  verbali/           „Verbale di chiusura cantiere“: voci.ts (разделите и редовете на листа, кои са с
                     „Certificato“; разборът и четенето с недоверие) · form.ts (черновата, zod; попълването
                     от картата — само адрес, „N° buono“, дата) · service.ts (нов — картата пак в
                     транзакцията с `FOR SHARE`; черновата с `base`; одитът) · conferma.ts (двата подписа и
                     потвърждението — един UPDATE) · sigillo.ts (отпечатък и печат, свой етикет) · pdf.ts +
                     pdf-parti.ts (A4, „Copia azienda“ / „Copia installatore“)
  argano/            изчислението за аргано по „RT-E MOD 10411-1“: calcolo.ts (формулите на листовете
                     „Macchina“ и „Funi“, без база) · dati.ts (входът — zod, формата) · tabelle.ts
                     (въжетата TELCAL/DONATI, мерките на компенсацията) · fune.ts (въжето за показване:
                     формация, нишки, клас, cordatura) · da-scheda.ts (попълването от
                     „Modulo rilievi dati argani“) · righe.ts (резултатите като редове — страница и PDF) ·
                     formato.ts · service.ts (четене, запис върху `base`, одит) · pdf.ts (A4) ·
                     pdf-testata.ts (общото на PDF-ите на изчисленията: шрифтът, главата на фирмата,
                     долният ред) · impianto.ts (уредбата без карта — zod) · liberi.ts (изчислението
                     без карта) · elenco.ts (списъкът и търсенето на страницата в менюто)
  limitatore/        изчислението за ограничителя по „Limitatore_velocita_EN81-20-2020.xlsx“: calcolo.ts
                     (клетките B5, B6, B9, B10, B13 на листа „Limitatore“ и границите по нормата при
                     монтажа, без база) · dati.ts (скоростта, видът на парашута и нормата — zod, формата,
                     попълването от картата) · righe.ts (резултатът с
                     думи — страница и PDF) · service.ts (на карта и без карта: четене, запис върху
                     `base`, изтриване, одит) · elenco.ts (списъкът и търсенето) · pdf.ts (A4, една
                     страница)
  schizzi/           скицникът: elementi.ts (видът на елементите — zod, тежестта) · costanti.ts (мерките,
                     таваните, стрелките, пунктирите, котите) · simboli.ts (символите за шахтата) ·
                     forme.ts (елементът → примитиви: линии, запълнени върхове, елипси, надписи — за SVG и
                     PDF) · model.ts (каквото отива в браузъра, пратеното от формата, спасеното при
                     върната форма) · service.ts (четене и запис в транзакцията на картата)
  ordini/            модулите: moduli.ts (картите от assets/moduli, SHA-256) + moduli-schema.ts (zod
                     схемата на картите) · registry.ts (марка ↔
                     колона ↔ въпрос ↔ модул) + registry-controlli.ts (втория избор на пратената карта:
                     модел, вид на уредбата) · valori.ts · prefill.ts · opzioni.ts (опцията на падащ
                     списък за текст) · collegamenti-elenco.ts (списъкът на свързаните данни) +
                     collegamenti-impianto.ts (втората му част, от адреса нататък) +
                     collegamenti-aggiunti.ts + -scheda.ts + -quadri.ts + -pulsantiere.ts (добавените по-късно — винаги в края; `spunta` — collegamenti-spunta.ts) +
                     collegamenti.ts (видовете места, проверката при старт) + collegati.ts (правилата
                     им) + collegati-browser.ts (JSON-ът за браузъра) · riepilogo.ts (модулите в печата на
                     картата) · form.ts · pdf.ts (плоските листове: Pelazza, аргано, 2SG, Mastech, Elettroquadri,
                     AMI 100) + pdf-form.ts (формулярите на MoviLift, DMG и GEAT) + pdf-form-testo.ts
                     (текстовите им полета: един ред или блок, вътре в кутийката) + pdf-form-pulizia.ts
                     (почистването на формуляр с JavaScript — DMG) + pdf-livelli.ts + pdf-livelli-contenuto.ts
                     (езиковите слоеве на DMG: на листа остава само включеният; второто — съдържанието
                     на страницата оператор по оператор, без документ) + pdf-testo.ts (шрифтът, мястото на
                     текста) — pdf-lib
  cerca/             service.ts — търсенето в целия портал (`/cerca`, палитрата Ctrl K)
  master/            конзолата на MASTER: panoramica.ts (числата, седмиците) · sistema.ts (здравето) ·
                     contratti.ts · verifica.ts · comunicazioni.ts + banner.ts (лентите) · tempo.ts (дните по Рим)
  http/              menu.ts (менюто — единственият списък) · prefs.ts (темата) · colori.ts (темата „Personalizzato“: контраст, стилът) · flash,
                     бисквитки, таванове, помощниците на изгледите
  routes/            тънки рутери: проверка → услуга → изглед (витрината · заявките · картите ·
                     печатът и PDF-ът на картата (schede-stampa.ts) · кошчето · модулите · хора · фирми ·
                     настройките · одит)
  requests/          заявките за достъп: form.ts (публичната форма) · service.ts (запис, решение, срок)
  pwa/               manifest.ts — приложението на началния екран (манифестът; рутерът — routes/pwa.ts,
                     страницата „Installa l'app“ — routes/installa.ts) · sistema.ts (устройството по
                     User-Agent — стъпките му идват отворени от сървъра)
  site/ · seo/       витрината (+ seo/feed.ts — емисията на новините): landing.ts (разделите, ролите и възможностите до снимките — от кода) ·
                     immagini.ts (снимките: ширини, srcset) · paths.ts · structured-data.ts
                     (JSON-LD) · files.ts (robots, sitemap, llms.txt) · company.ts (данните на фирмата)
  allegati/          снимките и клиповете на картата: archivio.ts (пътищата в тома — само от id-тата) ·
                     formati.ts (видът по байтовете) · caricamento.ts (тялото на качването, таваните) ·
                     service.ts (запис, надписи, изтриване, одит) · coda.ts (опашката в базата) ·
                     foto.ts (sharp) · video.ts (ffmpeg/ffprobe) · stampa.ts (снимките в печата и PDF-а)
  abbonamenti/       абонаментът на фирмата: regole.ts (нива, дати, състояние — без база) · persone.ts (таванът) ·
                     servizio.ts (пробата, ръчното задаване, плановете в опашка) · scadenze.ts + avvisi.ts
  pagamenti/         Revolut: config.ts · revolut.ts (клиентът) · firma.ts (подписът на известията) · importi.ts (ДДС,
                     P. IVA) · offerta.ts · periodo.ts + situazione.ts (кога започва купеното) · servizio.ts (нова
                     поръчка) · riconcilia.ts + applica.ts (сверката, даването на периода) · avvisi.ts (писмата) ·
                     rimborsi.ts (дължимото връщане, „фактурирано“) · piani.ts · vies.ts + vies-ordine.ts
                     (проверката на ДДС номера) · rimborso-revolut.ts + rimborsi-riparto.ts + rimborsi-riconcilia.ts
                     (връщането през Revolut) · avvisi-rimborsi.ts · contestazioni.ts (споровете) ·
                     prepara-offerta.ts (офертата за показване и за записа) · soglia.ts (прагът от 10 000 € за
                     продажбите с български ДДС извън VIES) · note-credito.ts + note-credito-importi.ts
                     (дължимите кредитни известия)
  allarmi/           discord.ts (адресът, пращането, паузите — без база) · servizio.ts (настройката, `allarme()`)
  segnalazioni/      form.ts (формулярът по чл. 16 DSA, без база) · servizio.ts (запис, решение, преглед, срок)
  legale/            условията и доказателствата: versioni.ts · accettazioni.ts · firma.ts (кодът) · annunci.ts ·
                     emissioni.ts · sigillo.ts · stato.ts · informativa.ts · pdfa.ts · registro-trattamenti.ts
  mail/              mailer.ts (пращането, пълният подпис, последният изход) · posta.ts + posta-form.ts (пощата от
                     конзолата) · prova.ts · templates*.ts
  api/ · stato/      chiavi.ts (ключовете на API-то) · servizio.ts (страницата `/stato`)
  maintenance.ts     часовата поддръжка от независими стъпки (manutenzione-passi.ts)
  worker.ts          фоновият процес (контейнерът `worker`): компресира опашката, файл „жив съм“
assets/cartelli/     петте шаблона на табелата (JPEG-ите на собственика, увеличени за печат — scripts/cartelli/) + картата им (JSON)
assets/moduli/       празните PDF-и на Pelazza, MoviLift, листа за аргано (Word-ът на собственика, в PDF),
                     2SG (начертан наново от нас — `scripts/moduli/2sg.mjs`), AMI 100 Mono RTBS
                     (начертан от нас — `scripts/moduli/ami100.mjs`), Mastech NG120 / QI Touch (сканирани; QI Touch — две
                     страници) и Elettroquadri geared / gearless / oleodinamico (официалните им PDF-и
                     от elettroquadri.net; geared и oleodinamico — две страници), DMG Pitagora 4.0 и QF
                     Fixtures (формулярите им, непроменени — картите от `scripts/moduli/dmg.mjs`) +
                     картата на полетата им (JSON)
views/               EJS: partials/ (горна и долна лента, табелата, филтърът по фирма), site/ (витрината,
                     чертежът на шахтата, политиката), requests/, auth/, schede/, users/, aziende/,
                     account/, audit/; снимките — schede/_allegati*.ejs, allegato-elimina.ejs; скицникът —
                     schede/_schizzo.ejs (листът като SVG), _schizzo-foglio.ejs, _schizzo-editor.ejs
locales/it/          common · auth · schede · users · aziende · requests · site · mail · allegati · schizzi ·
                     interventi · cartelli · argano · limitatore · verbali · buoni · preventivi · pagamenti ·
                     vies · rimborsi · allarmi · prezzi · segnalazioni (.json) — единственият
public/              css/ (портал: base, buttons, shell, layout, plate, forms, pages, data, sheet, misure,
                     moduli, allegati, foto-stampa, schizzi, schizzo-editor, interventi, foglio, verbali, preventivi, cartelli, argano, print;
                     витрина: site, shaft,
                     site-hero, site-parts,
                     site-request),
                     js/app.js + js/valori.js + js/moduli.js + js/collegati-luoghi.js (едно място на
                     връзката: четене, следване, запис) + js/collegati.js (последните четири — само във
                     формата на картата, в този ред) + js/allegati.js (галерията) + js/carica.js
                     (качването, умаляването на снимките в браузъра) — формата и страницата на картата
                     + js/stampa-foto.js (иконките за печата) + js/foto-righe.js (редовете на PDF-а ≡
                     pdf-foto.ts) + js/foto-ordine.js (редът и прегледът) + скицникът — само във формата, в реда от
                     form.ejs: schizzo-forme.js (геометрията ≡ forme.ts) · schizzo-tratti.js (общото,
                     рисуването на платно) · schizzi.js (листовете) · schizzo-regole.js (проверката ≡
                     elementi.ts, нормализиране, местене) · schizzo-aggancio.js · schizzo-vista.js (мащаб,
                     местене на листа) · schizzo-editor.js (ядрото, историята, слоевете) ·
                     schizzo-puntatori.js (пръст/писалка/мишка) · schizzo-tracciati.js (опростяването и
                     пътищата на точките) · schizzo-strumenti.js (формите — влачене или две щраквания) ·
                     schizzo-penna.js (молив, гума) · schizzo-testi.js (текст, надпис със стрелка) ·
                     schizzo-quota.js (котата) · schizzo-polilinea.js · schizzo-maniglie.js
                     (дръжките) · schizzo-selezione.js ·
                     schizzo-azioni.js · schizzo-valore.js (лентата за стойност) · schizzo-menu.js
                     (менютата — и от клавиатурата) · schizzo-comandi.js (лентите, клавиатурата,
                     отваряне/затваряне); css/schizzo-barre.css — лентите и менютата;
                     img/ (og.png и apple-touch-icon.png — `npm run brand:images`; site/ — снимките на
                     витрината, `npm run render:encode`; brand/ и favicon-32/192.png — логата,
                     `npm run brand:logo`), indexnow-key.txt
tests/               unit · integration/ (реален Postgres) · e2e/run.mjs (Playwright + axe)
deploy/              deploy.sh · setup-env.sh · create-master.sh · backup.sh (базата + снимките, копие
                     извън сървъра) · restore-test.sh · backup-alert.sh · alert.sh (алармите на скриптовете —
                     Discord webhook или друг адрес) · nginx/ · systemd/
```

## Правила, които не се нарушават

- **Регистрация няма.** Акаунт се ражда само от приета покана (`services/invites.ts`) или от
  `owner:create` за първия MASTER. Имейлът и ролята идват от поканата, не от формата. Токенът на
  поканата/новата парола е 32 случайни байта; в базата е само SHA-256; връзката се показва веднъж.
- **Заявката за достъп** (витрината, `requests/`) само се записва — акаунт от нея не става. Решава само
  MASTER (`requests:manage`): „да“ = фирма (нова или съществуваща) + поканата до администратора ѝ в
  ЕДНА транзакция (`insertAzienda` + `insertInvite`; заявката се заключва първа, провал не оставя нищо),
  „не“ = отказ без писмо. Защитите: двойна бисквитка, 5/ч. на мрежа, 100 на денонощие за портала,
  капан за ботове, нова заявка от същия имейл обновява чакащата (advisory lock — без дубли). На заявителя
  писмо не се праща (адресът не е проверен); до MASTER — само името на фирмата и връзката. Срок 180 дни
  от последната промяна (`maintenance.ts`), изтриване по всяко време.
- **Роли — 7 нива като ERP Ascensori** (`auth/roles.ts`): MASTER(1) > ADMIN > DIREZIONE > RESPONSABILE >
  TECNICO > OPERATORE > CLIENTE(7). Проверката е по способност и винаги на сървъра. MASTER е
  собственикът на портала (Carbon Stealth, `User.master`): без фирма, вижда всички, само той създава фирми
  (`aziende:manage`). Ролята на всеки друг е **във фирма** — членство `Membership` (човек, фирма, роля),
  различна за всяка фирма; извън MASTER — поне едно членство. ADMIN е най-високата роля във фирмата.
  CLIENTE е само четене; кошчето и одитът — ADMIN+ (във фирмата) — по подразбиране, виж следващото.
- **Имената и правата на ролите са на фирмата** (`auth/permessi.ts`, собственикът, 30 октомври 2026):
  ADMIN (и MASTER) ги сменя в `/impostazioni` → „Ruoli e permessi“. Имената — на ADMIN…CLIENTE (MASTER е
  на портала), до 40 знака, без две еднакви. Правата — само за ролите под ADMIN и само за работата:
  `schede:read/write/delete/trash`, `interventi:read/write`, `audit:view`; писането, изтриването и
  кошчето водят четенето със себе си (`chiudi`). Хората (`users:manage`), настройките, фирмите и заявките
  остават по йерархията — и подправен запис в базата не ги дава (`puo`); ADMIN не може да се ограничи.
  Пазят се само разликите от подразбиране (`Azienda.nomiRuoli`/`permessiRuoli`, одит `AZIENDA_RUOLI` без
  имената). Членството в сесията носи правата и имената на фирмата си, затова `scope.ts` решава по тях и
  промяната важи от следващата заявка на всеки във фирмата. Имената в изгледите — `ruolo(роля, фирма)`
  (`auth/nomi-ruoli.ts`; MASTER чете имената на всички фирми със свои), в поканата и писмото ѝ — също.
- **Регистърът** (`auth/registro.ts`, собственикът, 30 октомври 2026): който има `audit:view`, вижда във
  всяка своя фирма своите действия и тези на хората, чиято роля там е под неговата; равните, по-високите,
  MASTER и автор, който вече не е във фирмата, не се виждат. MASTER вижда всичко.
- **Кой управлява кого** (`auth/manage.ts`, без база — тества се само): MASTER управлява всеки акаунт,
  който не е MASTER, и своя, но никога друг MASTER (одит, 4 ноември 2026: откраднатата сесия на единия не
  взима другия — нов имейл и връзка за парола биха го превзели) и никога не се деактивира сам. Своя акаунт
  — име и имейл; новият имейл иска текущата парола (`reauthPassword` в `services/users.ts`, броят се в
  заключването — откраднатата сесия не пренасочва писмата), а връзка за нова парола за себе си не прави
  (`createResetLink` отказва; паролата си сменя в `/account` със старата). Само той слага и маха фирми на
  човек (последната не се маха — за пълно спиране се деактивира). ADMIN управлява ролята на човек в
  своята фирма (само под своята, никога себе си), а акаунта му (име, имейл, парола, достъп) — само ако
  управлява членството му във ВСЯКА негова фирма; иначе акаунтът е на MASTER. Нов имейл: известие до
  стария адрес. Неизползваните връзки за парола спират при нов имейл, нова фирма и смяна на роля
  (`revokeResetLinks`) — иначе връзка от човек, който вече не управлява акаунта, пак би го отворила.
  MASTER не се вижда от никой друг — нито в списъка, нито по адрес (404); в поканите е
  „Amministrazione del portale“, а в регистъра на фирмата действията му не излизат. „Invitato da“ назовава поканилия само ако е във фирма, видима за гледащия.
- **Фирмите са изолирани** (`auth/scope.ts`). Обхватът е за способност: `scopeFor(user, 'schede:delete')` са
  фирмите, в които ролята на човека има правото (MASTER — всички); записът се проверява във фирмата му
  (`canIn`), менюто — „поне в една“ (`canAnywhere`). Всяка заявка към карти, хора, покани, одит и лого минава
  оттам; празен обхват е „нищо“, никога „всичко“. Чужд запис е 404, не 403. Човек с няколко фирми вижда
  картите им заедно с филтър; нова карта — само във фирма, в която пише. Деактивирана фирма спира само
  себе си; човек без нито една активна фирма излиза веднага. В базата: `Membership_role_check` (MASTER
  не е роля във фирма), `aziendaId` NOT NULL на карта и покана.
- **Краят на услугата за фирма** (чл. 28, ал. 3, б. „g“ GDPR; одит, 4 ноември 2026; само MASTER,
  `routes/aziende-fine.ts`, раздел „Fine del servizio“ на страницата на фирмата). Износ:
  `/aziende/:id/esporta` — един `.tar` (`aziende/tar.ts` — свой ustar, имената само `[A-Za-z0-9._/-]`;
  `aziende/esportazione.ts` — поток, не в паметта): `dati.json` (фирмата, хората с ролите, картите с
  мерките, скиците и описанието на снимките, листовете за интервенция с подписите и печата, табелите,
  изчисленията, протоколите за приключване, регистърът), логото и готовите снимки и клипове; без пароли, тайни на 2FA, токени и
  HMAC-и. Одит `AZIENDA_EXPORT`. Изтриване (`aziende/eliminazione.ts`): деактивираната фирма пази всичко
  `GIORNI_PRIMA_DELL_ELIMINAZIONE` (90) дни — активирана наново, нищо не се губи, — после `maintenance.ts`
  я изтрива окончателно; MASTER може и веднага, но само деактивирана и с името ѝ, написано на ръка. Една
  транзакция (редът на фирмата `FOR UPDATE` — активиране и изтриване не се разминават): картите (със
  снимките, скиците и мерките), листовете, табелите, изчисленията, протоколите, поканите, регистърът, членствата и
  хората, които са били САМО в нея; който е и в друга фирма, губи само членството. Папките в тома — след
  записа (провал оставя файл без карта, никога карта без файл). В регистъра остава `AZIENDA_DELETE` без
  фирма и без лични данни (кой, кога, колко). Политиката казва 90-те дни от същата константа (`endDays`).
- **Износът от ADMIN и смяната на доставчика** (Data Act, чл. 23–30; собственикът, 12 ноември 2026 — точки
  A1, A3, A4; текстовете — Правният Разбирач, не е правен съвет). `/impostazioni/esportazione`
  (`routes/impostazioni-esportazione.ts`, раздел `esportazione` на настройките): ADMIN на фирмата (и MASTER)
  сваля същия `.tar` С ПАРОЛАТА СИ (`reauthPassword` — броят се в заключването; откраднатата сесия не изнася
  всичко), `esportaLimiter` 10/ч. на акаунт, един износ на фирма наведнъж (`inCorso`, 429); не по способност,
  а по роля ADMIN във фирмата. Форматът е ЕДИН — `aziende/formato.ts` (select-ите, `SEZIONI_DATI`; износът и
  публичната страница `/esportazione` четат оттам — тестът сверява разделите и че тайна не излиза): нов раздел
  в `dati.json` = ред там + описание в `locales/it/esportazione.json`. Смяната (`aziende/cambio.ts` +
  `cambio-tempi.ts`, колоните `Azienda.cambio*`, CHECK `Azienda_cambio_check`): ADMIN избира изхода
  (`CambioEsito`) и пише името на фирмата; **услугата продължава ИЗЦЯЛО 30 дни** (чл. 25(2)(a)(ii) — не „само
  четене“), лента без „Chiudi“ над страниците на хората ѝ (`cambiInCorso`, master/banner.ts), писма до
  администраторите и до MASTER; веднъж удължаване с 30/60/90 дни (друг срок — писмено, на ръка), смяна на
  избора, оттегляне — до края. Краят — полунощ по Рим след 30-ия ден (`fineTransizione`). `concludiCambi`
  (поддръжката, всеки час) деактивира фирмата и пуска писмото с деня на изтриването. **Свършила фирма**
  (деактивирана от смяна или от MASTER): 90 дни (`GIORNI_PRIMA_DELL_ELIMINAZIONE`) нейният ADMIN влиза САМО
  за износа — членство с `soloEsportazione` (`auth/memberships.ts`), без нито една способност (`scope.ts`),
  нищо за приемане (`legale/stato.ts`), всичко друго води към износа (`requireUser`); другите ѝ хора — вън.
  Активирана наново — искането пада. Изтриването (`eliminaAzienda`) потвърждава по имейл на администраторите
  (адресите — взети в транзакцията, преди хората да изчезнат).
- **Страницата на подписа и копието за подписалия** (собственикът, 12 ноември 2026 — точка D4; условията 5.5 и
  15.4 от версия 2026-11-12): над подписите на листа за интервенция и на протокола — информацията по чл. 13
  GDPR на фирмата (`views/partials/firma-informativa.ejs`; `legale/informativa.ts`): написаната от фирмата в
  `/impostazioni/firme` (`Azienda.informativaFirme`, до 4000 знака, одит `AZIENDA_INFORMATIVA` без текста;
  „Torna al modello“ — null), иначе моделът с данните ѝ (наименование, седалище, имейл/телефон) — фирмата е
  администраторът и отговаря за текста. По избор имейл на подписалия (`copiaEmailSchema`; грешен адрес — 422,
  нищо не се потвърждава): след потвърждението документът тръгва веднага (`routes/firma-copia.ts` — листът,
  или двете копия на протокола в едно писмо), с проверката на печата; адресът НЕ се пази (одит
  `INTERVENTO_EMAIL`/`VERBALE_EMAIL` без него).
- **PDF/A-2b за потвърдените документи** (точка D6; `legale/pdfa.ts`): листът за интервенция и двете копия на
  протокола — `subset: 'PDF/A-2b'`, PDF 1.7, XMP с идентификацията, изход sRGB с ICC; без шрифт по
  подразбиране (празно — иначе pdfkit зарежда невградената Helvetica): документът избира вградения DejaVu
  веднага. Проверката — `tests/pdfa.ts` (pdf-lib: идентификацията, изходът, всеки шрифт вграден, без
  JavaScript и шифър); пълна валидация с veraPDF не е в инструментите. Износът носи PDF/A-тата в
  `documenti/` (`aziende/esportazione-documenti.ts` — правят се един по един, докато архивът тече; нарушен
  печат — не).
- **Работният поток на картата** (собственикът, 12 ноември 2026 — точки C2, C4, C6, C7):
  - **Етикет с QR** (`schede/etichetta.ts`, `routes/schede-etichetta.ts`, `etichetta.css`): лист A4 3 × 8 по
    70 × 37 mm (или 1, 3) — QR (SVG от сървъра, само адресът на картата; без вход — входът), фирмата,
    матрикулата, номерът, адресът. Печата го, който вижда картата.
  - **Версии** (`schede/versioni.ts`, модел `SchedaVersione`): след всеки запис (създаване и промяна, в
    транзакцията — редът е заключен) — снимка на полетата и мерките; еднаква с последната не се пази; последните 100. `/schede/:id/versioni` и `/versioni/:n` — разликите спрямо предишната (полето по името си, „преди“ и
    „после“ през `displayValue`; модулите и мерките — с името си). В износа (`schede[].versioni`).
  - **„Duplica“** (`/schede/nuova?da=<id>`): полетата на видима карта във фирма, в която човекът пише, без
    матрикула, номер и бон, с днешна дата; снимки и скици — не. Чужда карта — 404.
  - **Одобрение на две стъпки** (`schede/approvazione.ts`, `routes/schede-approvazione.ts`; `Azienda.
approvazioneSchede` — включва го ADMIN в раздел „Scheda“ на настройките, по подразбиране НЕ): чернова → пратена
    (който пише) → одобрена/върната с бележка (способността `schede:approve`, по подразбиране RESPONSABILE, сменя се
    в ролите) — никога от пратилия (одитът `SCHEDA_INVIATA` казва кой; MASTER — да). Промяна на одобрена — пак
    чернова (`riapriApprovazione` в `updateScheda`). Поръчка от портала — само от одобрена (`ordineConsentito`).
    `/approvazioni` и лента над списъка за одобряващите. CHECK `Scheda_approvazione_check`.
  - **Картата по имейл** (собственикът, 13 ноември 2026 — „Искам да имам опция да изпращам запазената вече
    scheda по емайл директно от портала“; `schede/invio.ts`, `routes/schede-invio.ts`, `mail/templates-schede.ts`,
    `views/schede/_invia.ejs`): „Invia per email“ на страницата на записана карта — адрес (пише се сега, НЕ се
    пази), по избор съобщение до 2000 знака; прикачен е същият PDF като „Scarica PDF“ (`pdfDellaScheda` в
    schede-stampa.ts), `replyTo` — пратилият. Праща, който пише карти във фирмата (`schede:write` + `canIn`);
    карта в кошчето и чужда — 404; `mailLimiter`. PDF над `MAX_PDF_EMAIL` (4 MB — препоръката на Brevo за прикачен
    файл) не тръгва: „togli qualche foto dalla stampa oppure scarica il PDF“. Записва се само тръгналото — одит
    `SCHEDA_EMAIL` (картата, фирмата, имало ли е съобщение), без адреса и без текста.
  - **Поръчки към доставчиците** (`ordini/fornitori.ts`, `ordini/invio.ts`, `routes/ordini-invio.ts`,
    `routes/impostazioni-flusso.ts`): адресникът на фирмата (`Fornitore`, до 200, раздел „Fornitori“ на
    настройките, ADMIN); „Invia al fornitore“ на картата — PDF-ът на модула (`ordini/modulo-scheda.ts`, същият
    като свалянето) по имейл, `replyTo` — пратилият, `mailLimiter`; записва се САМО тръгналата
    (`OrdineFornitore`: модулът, получателят — адресът е поръчката, в износа е, — бележката, състоянието),
    одит без адреса; „confermato“/„annullato“ — само от „inviato“; `/ordini` (меню „Impianti“) по състояние.
- **Регистрите по GDPR** (собственикът, 12 ноември 2026 — точка A6; само MASTER): `/master/registri` —
  регистърът на дейностите като обработващ (чл. 30(2)) и като администратор (чл. 30(1)): текстът е
  `legale/registri/trattamenti.json` (zod, `legale/registro-trattamenti.ts`; сроковете — от кода), фирмите-
  администратори — живо от базата (декларираното при приемането, администраторите, състоянието); за печат.
  `/master/violazioni` — регистърът на нарушенията (чл. 33(5); `master/violazioni*.ts`, модел `Violazione`,
  CHECK за празния текст): всяко нарушение, и неуведоменото — ролята ни, рискът, кой е уведомен кога, срокът
  от 72 ч (чл. 33(1)) при ролята на администратор; часовете — по Рим (`momentoRoma`/`inputRoma`); редове НЕ
  се трият, одит `VIOLAZIONE_CREATE/UPDATE` без текста.
- **Логото** се проверява по байтовете (PNG/JPEG/WebP, никога SVG), до 1 MB, и се ПРЕКОДИРА през sharp
  (`aziende/logo.ts`): до 1200×600, без EXIF. Прекодирането пази и процеса — pdfkit декодира PNG с
  прозрачност асинхронно и при повреден файл хвърля извън всеки try/catch. Пази се в базата (bytea —
  влиза в бекъпа), показва се само на фирмата и на MASTER. Стои най-горе вляво на листа и на PDF-а; вдясно
  — кой е попълнил картата („Compilata da“).
- **Сесия = JWT + ред в базата.** JWT-то носи само `sid`; изход, деактивиране и смяна на паролата
  прекратяват сесията веднага. Бисквитките са `__Host-` в продукция, HttpOnly, SameSite=Lax; записите
  пазят synchronizer CSRF токен + проверка на Origin. Формите преди вход — двойна бисквитка.
- **Без изброяване на акаунти:** непознат имейл и грешна парола — един отговор, едно време (фиктивен хеш),
  едно заключване (`auth/lockout.ts`; непознатите се броят в паметта, със същите поредни заключвания).
  Неуспешният вход трае поне `ESITO_NEGATIVO_MS` (400 ms, `services/login.ts`; одит, 4 ноември 2026):
  заключен акаунт и мрежа над тавана отговарят преди хеша и иначе биха се познали по бързия отговор.
- **Налучкване (brute force)** (собственикът, 31 октомври 2026 — „максимална защита“), на пластове:
  nginx — 10 POST-а в минута на адрес към входа и формите преди вход (`limit_req`, само POST); приложението
  — 10/мин. на мрежа в паметта (`loginLimiter`) и таван в базата: 30 грешни входа (парола, непознат имейл,
  код) от мрежа (IPv4 или IPv6 /64) за 15 минути спират входа от нея, преди паролата да се провери
  (`auth/rete.ts`; пази се само HMAC на мрежата, ден; успешен вход не нулира); акаунтът — опитът се
  ЗАЕМА атомарно преди бавната проверка (`reserveAttempt`: паралелни заявки не получават повече от 5
  проверки), 5 грешни пароли или кода → заключване, всяко поредно по-дълго: 15 мин → 1 ч → 4 ч → 24 ч
  (`User.lockouts`; нулира го само завършен вход или връзка за нова парола). Старата парола при смяна и
  паролата/кодът при 2FA в отворена сесия се броят там (`services/reauth.ts`); заключи ли се акаунтът
  от тях, всички сесии падат — откраднатата сесия не налучква.
- **Двуфакторен вход (TOTP, RFC 6238) — по избор** (собственикът, 31 октомври 2026 — „изключен по
  подразбиране, всеки потребител може да го активира по желание“): `/account/2fa`. Включване: паролата →
  QR (SVG от сървъра) и ключ на ръка → кодът от приложението; започнатата тайна НЕ е в базата — пътува
  шифрована в скритото поле (`cifraBozza`), вързана за човека и сесията, 15 минути (откраднатата сесия не
  довършва чужда настройка). Включена: тайната в базата шифрована (AES-256-GCM, `auth/chiavi.ts`), 10
  резервни кода (показани веднъж, в базата — HMAC, `auth/recovery.ts`), другите сесии падат, писмо. Вход:
  вярната парола НЕ дава сесия, а предизвикателство (`LoginChallenge`: бисквитка `__Host-rilievi_2fa`
  SameSite=Strict, в базата — SHA-256, 10 мин, 5 опита) → `/accesso/codice`; кодът се приема веднъж
  (`totpLastStep`, атомарно), ±1 стъпка; грешните кодове се броят в заключването и в тавана на мрежата;
  заключат ли акаунта — писмо „паролата ти е известна на друг“. Изключване и нови кодове — паролата И
  код. Изгубен телефон: изключва я управляващият акаунта (`auth/manage.ts`, `/utenti/:id/due-fattori`),
  писмо до човека. Ключовете (тайната, чернова, HMAC на кодовете и мрежата) са изведени с HKDF от
  `INTERVENTI_SEAL_KEY` (отделен етикет за всяко) — затова той и занапред не се сменя никога. В базата:
  `User_totp_check` (включена 2FA без тайна е невъзможна). Одит: `TOTP_ON/OFF/RESET/CODES`, `LOGIN` с
  `meta.secondoFattore`.
- **Полетата са в `schede/fields.ts`** — формата, проверката, страницата, печатът и PDF-ът се строят
  оттам; редът е дословно от заданието, а разделите — в реда от снимките на собственика (13 — от 24 октомври и „Bottoniere“; номерът е
  броят на видимите — CSS брояч, скритият раздел не взема номер). Раздел 1
  „Impianto“ е подреден като главата и табелата на листа: дата; адрес и бон; матрикула и № на асансьора;
  товар, капацитет, спирки, марка — във формата със същото разположение (`.grid--testa`, sheet.css).
  Ново поле = ред там + колона в схемата (миграция) + ключове в речника — имената на разделите,
  полетата, въпросите и опциите са в `locales/it/campi.json` (тестът хваща липсващите). N° impianto е низ само от
  цифри — водещата нула се пази; матрикулата — свободен текст до 40 знака (собственикът, 10 ноември 2026 — „Nel
  numero matricola fallo campo di tipo testo“; колоната — VARCHAR(40), и в изчисленията без карта, `argano/impianto.ts`;
  в търсенето точното съвпадение не гледа главни/малки). На табелата на PDF-а двете стойности са на ЕДИН ред
  (`pdf-head.ts`, `grandeInRiga`: номерът взима колкото му трябва, матрикулата — останалото, шрифтът пада от 19,5
  до 8 pt, после „…“); на страницата и в печата — от 600 px на един ред, матрикулата се пренася в колоната си
  (plate.css). Десетичните приемат „6,5“ и „6.5“, пазят се като Decimal.
  Октомври 2026: хидравличната уредба няма „Argano“ и „Limitatore“, а „Centralina“ (от 21-ви: „Centralina
  da sostituire?“, марка и модел при всеки отговор, при „No“ — „Emendamento A3 da installare“, а при неговото
  „Sì“ — гъвкава тръба: Sì/No, диаметър (свободен текст до 40 знака от 9 ноември — „1/2"“, „DN 25“; миграцията
  направи числото в mm „25,4 mm“), дължина, бележки; бележките на раздела — винаги); намалената
  яма и горно пространство в „Quadro“ — НЕ при хидравлична (`NON_IDRAULICO`, виж по-долу); при „Argano da
  sostituire? No“ — челюстите на спирачката. 3 ноември
  (листовете на собственика): „Note locale macchina“ веднага под мястото на машинното; „Quantità funi
  DX/SX“ до „N° funi“ (общият брой остава — него чете листът за аргано); в „Quadro“ (`fields-quadro.ts`)
  — „Testata ridotta?“, после „Fossa ridotta?“ (двата — само при електрическа и MRL, `NON_IDRAULICO`), всеки със списък на решенията
  (`testataInterventi`: W+W puntoni, AMI 100 Mono RTBS, Semaforo, Puntone OKATT contrappeso;
  `fossaInterventi`: AMI 100 Mono RTBS, Semaforo fondo fossa, Grembiule retrattile 3 stadi — с бележка,
  Puntone OKATT); в „Centralina“ — при „Sì“ данните за новата (мотор V/HP, помпа l/min, пускане,
  електровентили, тръба, бутало, стебло, ход, вид бутало, литри масло), при „No“ — „Installare kit A3?“
  (колоната `emendamentoA3`), после „Tipo centralina in opera“ Hydronic (части + напрежение на бобините)
  или Altro (HSV-150/440 BIS по дебита, части, шибър ASS/2 или ASS/3), гъвкавата тръба, и накрая „Note
  raccordi e tubazioni“ при всеки отговор. 17 октомври:
  „Buono di lavoro“ (беше „Buono di riferimento“); операторът на вратите (марка, светъл отвор,
  напрежение) — махнат; „Serrature o sospensioni“ пита само каквото е за вида врати — бравите и шейната
  (тя е тук, след бравите, с „Tipo di pattino retrattile“) при ръчни и полуавтоматични, окачванията и 2SG
  — само при автоматични (`PORTE_CON_PATTINO`/`PORTE_AUTOMATICHE`; без отметнат вид — нито едното); при ръчни
  (`PORTE_MANUALI`; собственикът, 10 ноември 2026) веднага след шейната — „Contatti antine da sostituire?“
  (`contattiAntine`) и „Blocca portine da installare?“ (`bloccaPortineDaInstallare` — НЕ старата колона
  `bloccaPortine` на махнатия въпрос от октомври, чиито отговори остават непрочетени); в табелата за спиране
  първият е „meccanismi delle porte“, вторият — „nuovi dispositivi di sicurezza“; а от
  22 октомври при полуавтоматични — и операторът на кабината („Operatore da cambiare?“ след шейната: на
  етажите са бравите, кабината е автоматична врата с оператор), а от 24 октомври и при автоматични
  (`PORTE_CON_OPERATORE`; след окачванията и броя им); от 10 ноември — верига (собственикът: „Vuoi cambiare
  operatore? Si/no. Vuoi compilare modulo d'ordine? Se si fai scegliere modulo 2sg o altro“): „Vuoi
  cambiare operatore?“ → „Vuoi compilare modulo d'ordine?“ (`operatoreOrdine`) → „2SG“ или „Altro“
  (`operatoreModulo`, enum `OperatoreModulo`; при „Altro“ — кой, на ръка, `operatoreModuloAltro`); листът
  на 2SG се отваря от „2SG“ (`apertura` на слота `so` в registry.ts), не от „Sì“ на оператора — миграцията
  `20261110140000_operatore_modulo_ordine` даде „Sì“ и „2SG“ на картите с „Sì“ на оператора, за да остане
  листът им отворен;
  бележки в „Quadro“, „Argano“ (`fields-argano.ts`) и „Serrature, sospensioni o operatore“ (така от 24
  октомври) — винаги; при „Argano da sostituire? No“ — „Tipo argano esistente“ (на ръка) и „Kit controllo
  ganasce da installare?“ с вида си на ръка при „Sì“; „Controllo su quadro manovra da installare?“ (с вида
  си) — само при „Quadro di manovra da sostituire? No“ (новият първи въпрос в „Quadro“), при всяко аргано
  (миграцията дава „No“ на таблото на стара карта с „Controllo su quadro: Sì“ — контрол се слага на
  табло, което остава; „No“ на контрола не казва нищо за таблото и там въпросът остава без отговор);
  „Stop argano da installare?“ — винаги (собственикът, 24 октомври; контактите и челюстите на спирачката
  — махнати); „Fossa ridotta“ и „Testata ridotta“ — не при хидравлична; разделът „Bottoniere“ (преди „Note
  e lavori“) — „Bottoniere da sostituire?“ и бележка на ръка — винаги, и при „No“ (засега само това; бележката за
  бутониерите в работа и мерките на старите остават в „Note e lavori“); „Funi e
  tiranti“ — брой и вид на тирантите на кабината и на противотежестта, а при хидравлична уредба (без
  противотежест) — на тирантите в ямата (`tirantiFossa*`; миграцията пренесе там писаното при хидравлична
  в колоните на противотежестта, без да ги пипа), всеки на свой ред във формата (sheet.css); „Allarme e telesoccorso“ — един раздел: трите въпроса какво се
  монтира (заменят „Telesoccorso“ и състоянието му — колоните остават, не се четат), портиерната накрая;
  „Luce vano da sostituire: Sì“ → бележка на ръка. „Tipo impianto“ и „Tipo porte“ — по един избор
  (`single`: радио; пази се като списък от един — колоната остава масив и предишният код я чете, старите
  карти с два избора се показват както са записани, а във формата е отметнат първият; два пратени
  избора са грешка `option`).
- **Бележка в края на раздела** (собственикът, 11 ноември 2026 — „In Funi e tiranti metti campo di testo Note funi,
  tiranti e contrappeso … In Impianto metti campo di testo Note impianto“): textarea до 4000 знака, винаги видима,
  в търсенето — `noteImpianto` (Impianto), `ubicazioneNote`, `tipologiaNote`, `funiNote`, `limitatoreNote`,
  `allarmeNote` (миграция `20261111120000_note_sezioni`, само добавя). „Note impianto“ дойде от „Note e lavori“ —
  същата колона, написаното остава (изборът на собственика); разделът Impianto не се печата отделно, затова в
  печата и PDF-а бележката стои под табелата, само попълнена (`print.ejs`, `pdf.ts`).
- **Поле с условие** (`when`: „при автоматични врати“, „при Sì“) се показва, чете и пази само когато
  условието е изпълнено — иначе е null и не дава грешка (скритото не се проверява). Условието сочи
  по-ранно поле (тестът го пази); веригата работи (поле с условие може да зависи от друго с условие).
  Цял раздел също може да има условие (`SectionDef.when`; `not: true` — обратното: „не при
  хидравлична“) — полетата на скрития раздел нямат смисъл; app.js скрива и полето, чийто родител е скрит.
  `also` — още полета, от които стига едното (листът на AMI 100 Mono RTBS при отметката в списъка на
  ямата или на горното пространство; в страницата — `data-when-also`).
  Махнатите от листа полета (блокировка, донивелиране, брой шейни, марка на аргано, марката и данните на
  оператора, контактите и челюстите на спирачката, данните на централата освен марката) остават в
  колоните си със старите отговори —
  проверката не ги чете, записът не ги пипа. Слетият раздел „telesoccorso“ се маха от записания ред на фирмата при четене, а
  страница отпреди сливането, която още го праща в избора за печат, не дава грешка (`stampa.ts`).
  Сървърът решава по пратените стойности; app.js само скрива/показва.
- **Мерките на старите бутониери** (`schede/misure.ts`, таблица `MisuraBottoniera`) — ред за спирка,
  колкото е „Fermate“ (до 300), полетата `mb-<спирка>-<колона>`. Записват се наново с картата в една
  транзакция; празен ред не се пази; редовете над броя на спирките не се четат.
- **Модулите** (`src/ordini/`, `assets/moduli/`): „Marca quadro“ Pelazza + „Sì“ → техният „Modulo
  d'ordine quadri“; „Marca quadro“ MoviLift + „Sì“ (същият въпрос, същата колона) → техният „Modulo
  ordine quadro (Scelta v2.6)“; „Marca quadro“ Mastech → втори избор „Tipologia quadro“ NG120 / QI Touch
  → същият въпрос → техният модул (слотът има и `modello`; „Sì“ без модел е грешка `modelloNeeded`);
  „Marca quadro“ Elettroquadri → същият въпрос, без втори избор: модулът е по „Tipo impianto“ на
  картата (собственикът, 30 октомври 2026) — Elettrico → geared, MRL (`GEARLESS`) → gearless,
  Idraulico → oleodinamico; „Piattaforma oleodinamica“ — не (слотът има `impianto`; видът е отметка —
  `scelto` сравнява и списък; „Sì“ без вид е грешка `impiantoNeeded` на „Tipo impianto“; в браузъра —
  обвивка `data-when="tipoImpianto"`, смяната на вида сменя листа на място) — модулът на таблото е
  отворен само при СВОЯТА марка, модел и вид (`registry.ts`, `slotAperto`; тестът пази `when` на
  въпроса = марките от регистъра). Във формата модулът стои веднага след въпроса си и
  полетата, които зависят от него, преди бележките на раздела (`moduliDopo`, `ordini/form.ts`).
  „Argano da sostituire?“ + „Sì“ →
  „Modulo rilievi dati argani“ (Word-ът на собственика, за всеки вид аргано — без марка и без
  доставчик); „Sospensioni da cambiare?“ + „Sì“ → брой и листът на 2SG за оператора на кабината и
  окачванията, а „Operatore da cambiare?“ + „Sì“ (полуавтоматични и автоматични врати) → целият същият лист
  (същата колона `ordineSospensioni`, втори слот: префикс `so`, свой PDF). При автоматични двата въпроса
  се виждат заедно — листът е един: с „Sì“ на окачванията е техният слот, слотът на оператора отстъпва
  (`ModuloSlot.cede`: `slotAperto` на сървъра, обвивка `field--wide` с `data-when-not` в браузъра — тя е
  клетката на грида, затова е широка; PDF-ът му — 404). Двата слота на един модул в една колона са един
  лист на две места (`data-gemelli="<колона>:<модул>"`): когато на екрана се смени кое се вижда,
  `public/js/moduli-gemelli.js` пренася в новото всичко писано и отметнато в старото (и знаците
  `data-auto`/`data-touched`/`data-scritto`) — нищо написано не се губи при „Sì“/„No“ на окачванията; в
  печата на картата колоната излиза веднъж. Листът на 2SG е начертан наново от нас като векторен A4
  (собственикът, 30 октомври 2026 — „non generi un pdf … basato sulla scansione“): същите полета, надписи
  и ред като хартиения им модул; `scripts/moduli/2sg.mjs` (общото — `scripts/moduli/foglio.mjs`) чертае
  листа и пише координатите в картата, ключовете на полетата са старите — записаните карти пазят
  стойностите си; `npm run moduli:disegna` дава едни и същи байтове. **AMI 100 Mono RTBS** (30 октомври,
  от 3 ноември 2026 по листа „Solo su elettrico“): без въпрос „Sì/No“ — отваря го отметката „AMI 100 Mono
  RTBS“ в решенията на горното пространство или на ямата (слотът има `apertura`: стойността и още
  полета; `campoCheApre` в registry.ts — на сървъра, в печата, в PDF маршрута и в страницата, където
  стоят връзките към PDF-а; обвивката в браузъра — `data-when-also`). Колона `ordineAmi`, префикс `ar`,
  PDF `/ami100-mono-rtbs`. „Installare AMI 100?“, видът и Mono UCM са махнати (колоните `ami100`/
  `ami100Tipo` пазят старите отговори; миграцията отметна RTBS в списъка на намаленото пространство на
  картите, които го имаха, за да остане листът им отворен; UCM — не се чете). Полетата и редът им — от
  списъка на собственика („Ami_100.pdf“), фиксираните варианти — отметки по
  каталога AMI100 (захранване 24/48 Vdc, въжето на ограничителя отляво/отдясно, водач 7/8/9/16 mm,
  икономайзер), отгоре — подател, дата и асансьорът; листът е начертан от нас
  (`scripts/moduli/ami100.mjs`). **DMG** (собственикът, 2 ноември 2026): „Marca quadro“ DMG + „Sì“ на
  въпроса на таблото → „Quote form Pitagora 4.0“ (префикс `dp`, колона `ordineQuadro`); в раздела
  „Bottoniere“ при „Bottoniere da sostituire: Sì“ — „Vuoi compilare la scheda ordine bottoniere DMG?“
  (`bottoniereOrdine`; при всяка марка на таблото) → „Quote form Fixtures“ (префикс `db`, колона `ordineBottoniere`). Полетата и редът им са дословно от модула (италиански, не се
  превеждат). Пазят се като JSON (`ordineQuadro`, `preventivoArgano`, `ordineSospensioni`, `ordineAmi`,
  `ordineBottoniere`:
  `{modulo, valori}` — `modulo` е id-то на картата, затова записът на Pelazza никога не се чете като
  MoviLift, нито старото запитване към Montanari като листа за аргано) и излизат като свой PDF
  (`/schede/:id/ordine-quadro`, `/ordine-quadro-movilift`, `/ordine-quadro-dmg-pitagora`,
  `/ordine-bottoniere-dmg`, `/ordine-quadro-mastech-ng120`,
  `/ordine-quadro-mastech-qi-touch`, `/ordine-quadro-elettroquadri-geared`, `…-gearless`,
  `…-oleodinamico`, `/dati-argano`, `/sospensioni-2sg`, `/operatore-2sg`, `/ami100-mono-rtbs`; затворен
  модул → 404). В печата
  и PDF-а на картата влизат САМО модулите, които картата иска — всеки поотделно (таблото, аргано, 2SG:
  отметките `riepilogoOrdini` в края на формата, пазят се в `moduliStampati`; `riepilogoOrdini` в базата е
  „поне един“ за предишния код, а карта с него и без списък включва и трите, както преди) — само
  попълненото, по групите на модула (`ordini/riepilogo.ts`). PDF-ът на модула е самият модул: плоските листове (Pelazza, аргано, 2SG) —
  кръстчета и текст по координатите от картата (`dimensione`/`sopraLinea` — размерът на текста по
  листа; `righe` — кутия с редове, NOTE на 2SG; `pagina` — групата е на втората страница, QI Touch;
  `segno: 'cerchio'` — кръгче около номера на етажа, NG120; `allinea: 'destra'` — стойността вдясно на
  реда, до мерната единица след него („Potenza motore: ___ Kw ___ Cv ___ A“ на листа за аргано —
  собственикът, 3 ноември 2026: отляво CV стоеше веднага след „Kw“); `anche: [2]` — същото поле и на тези
  страници, на същото място: главата на поръчката на Elettroquadri се повтаря на стр. 2); `titolo` на ред — надписът на реда от листа
  („Tensione Allarme“): във формата над отметките (група за четеца), в резюмето пред всяка; знаците — 1,7
  pt (`SEGNO`, pdf-testo.ts); MoviLift — попълнен и „заключен“ формуляр. PDF-ите са
  закрепени по SHA-256: нова версия = нова карта (координати/имена), иначе процесът не тръгва.
  Montanari е махнат (октомври 2026): старите записи остават в колоната, но не се четат. При първото
  отваряне модулът идва попълнен: стойностите на празния модул (`predefinito`) < огледът и човекът
  (`prefill`: датата, препратката към асансьора, фирмата, отметките на картата като думи; имейлът на човека — не,
  от 21 октомври; на фирмата — да, от 3 ноември) < свързаните данни (`prefill.ts`); скрито поле на картата не попълва. После полетата с
  `prefill` следват картата (`public/js/moduli.js`, същите правила; еднакво `prefill` следва първото
  писано), докато човекът не пише в тях (`data-auto`); изпразненото в записан модул остава (`data-scritto`).
- **GEAT** (`assets/moduli/geat-modulo-quadro.*`; собственикът, 12 ноември 2026 — „добави и тази опция в избора на
  табла“): „Marca quadro“ GEAT + „Sì“ на въпроса на таблото → техният „Modulo quadro“ (префикс `gt`, колона
  `ordineQuadro`, PDF `/schede/:id/ordine-quadro-geat`; миграция `20261112230000_quadro_geat` — само добавя стойността
  на enum-а). Формулярът им е непроменен (Acrobat, две страници, 200 полета): радио групите са с имената на
  състоянията си (`stato`), бутонът „Ripulisci i campi“ не излиза на листа (`pulizia`). Картата — `npm run
moduli:geat` (`scripts/moduli/geat.mjs` проверява всяко име, вид и състояние срещу PDF-а; поле без място в картата
  спира скрипта); текстовите полета приемат поне 40 знака (кутийките са малки, свързана дълга матрикула не се отказва
  — на листа се съкращава с „…“). Във връзките (39 от 101): клиентът — фирмата, препратката, датата (`prefill`);
  матрикула, № на асансьора, товар, хора, спирки, скорост, достъпи, мотор (kW, HP, ток, марка), спирачка, клапани,
  оператор (марка, напрежение), шейна, фотоклетка, вид на уредбата (само хидравлична и MRL — „Funi“/„Geared“ би се
  гадало), машинното (горе/долу), вратите на етажа и на кабината, пускането на централата, маневрата, нормите, A3,
  предварителното окабеляване, синтеза на глас, претоварването и бутоните на кабината.
- **MoviLift** (`assets/moduli/movilift-*`): идва шифрован (RC4, без парола за отваряне; авторът
  разрешава попълване) — в репото е копието без шифъра (pypdf), същото до пиксел; DA низовете са с „\057“
  вместо „/“ и `pdf-form.ts` ги декодира. Радио групите се избират по реда на бутона в PDF-а (`widget` в
  картата — имената на състоянията са неравни), падащите списъци — по опция (`vuoto` = „нищо“), с
  избор от текста на картата по дума или по числата („24 V DC“ → „24Vcc“). Стойностите на празния модул
  (отметки, избори, „-“) се махат от листа, ако човекът ги е махнал. Капани на оригинала: Fossa, Testata,
  Corsa и Dist. имат втори бутон в кутийките на „Piano Corto“ (`widget` на текстово поле → излиза само
  своят), два бутона без надпис не са в картата, Testo78/79 са надписи, „Fotocellula … V“ е без поле
  (`crea`: създава се при попълването, като Testo77). Отметката/изборът — наш облик с линии (✔/■), не
  невграденият ZapfDingbats. flatten оставя в /Annots връзки към изтритите бутони — `pulisciAnnots`.
- **DMG** (`assets/moduli/dmg-*`, картите — `npm run moduli:dmg`: скриптът чете полетата от PDF-а и спира
  при име, състояние или опция, които ги няма, и при поле с данни без място в картата). Формулярите на
  CorelDRAW са с JavaScript и слоеве за езика (италианският е включен). Изборът е група отметки с ЕДНО
  име, не радио: опцията сочи бутона по името на „включеното“ му състояние (`stato`; MoviLift — по реда,
  `widget`); `selectRadio` слага V и облика на избрания, на другите „Off“. Бутоните на Pitagora нямат облик
  „Off“ (кутийките са в страницата) — неизбраните излизат, без да се рисуват (`togliSenzaAspetto`), а
  избраният получава само нашия знак. `pulizia` в картата → `pdf-form-pulizia.ts` преди flatten:
  JavaScript-ът на документа и страниците се маха; бутоните за действие (Salva, Invia, Reset, езиците,
  стрелките, корицата „00-Home“ на Fixtures) и „кръпките“ (`nonStampare: ["-TOPPA$"]`, сивото, с което
  скриптът закрива недостъпното) не излизат; скритите полета (енкодерите при затворен контур,
  „Sovraeccitazione“…) излизат само попълнени. Моделът на бутониерите (Flat standard, Elise, Silverlight,
  Gilda TM, Luna, Cut, Greta) се избира на корицата от скрипта — в картата е избор без поле (`acro`
  липсва), който показва картинките и ширините на модела (`mostra`: „00-Piastra-X“, „02/10/11-Dim.X“ и
  „-IMG“). Ширините на всички модели са във формата с името на модела в етикета. Pitagora: стр. 3–4
  (бутониерите към таблото) също са в картата; трите кутийки „Flush_0060/0080/0090“ на стр. 4 са вързани
  от автора към полето на кабината — не се предлагат. „Corsa“ на Pitagora е сумата на интерпиановете в
  Acrobat — у нас се пише на ръка (без връзка: мерките на листа не са в метри).
  **Един език на листа** (собственикът, 13 ноември 2026 — „Controlla la modalità di stampa Dmg“: на хартия и
  на екрана му италианските, френските и английските надписи се застъпваха; `pdf-livelli.ts`): трите езика са
  слоеве на една страница (`/OC /MCn BDC … EMC`, по страница: Dati, Italiano, English, Français), а кой се
  вижда казва само `/OCProperties /D` — четец или принтер, който не чете настройката, рисува всичките.
  `togliLivelliSpenti` (преди попълването) маха от съдържанието на всяка страница рисуването на изключените
  слоеве (текст, пътища, XObject, преливки; шрифтът, цветът, матриците и изрязването, зададени там, остават —
  ISO 32000-1, 8.11.3.2), обвивките на включените и `/OCProperties`; старите потоци ги чисти `togliOrfani`.
  Каквото не може да се махне сигурно спира с грешка, преди да се пише каквото и да е (картинка в
  съдържанието, OCMD, `/AS` или `/Usage` — състояние само за печат, изключен слой върху XObject или
  анотация или в ресурсите на XObject, XObject без свои ресурси, текст като изрязване — `Tr` ≥ 4, видим
  текст, който продължава от мястото на скрит) — файловете са закрепени по SHA-256, вижда се в тестовете.
  Слоят „Livello 1“ в облиците на полетата не е в настройката и остава. Тестовете
  (`tests/pdf-livelli-contenuto.test.ts` — операторите; `tests/pdf-livelli.test.ts`) сверяват с pdftoppm,
  че страниците без слоевете са същите до пиксел като оригиналните за четец със слоеве, и че „всички слоеве
  наведнъж“ е друга картинка (проверката може да се провали). **Картинките с ширините** („90 160 200“,
  `NN-Dim.<модел>-IMG`): във файла на DMG стоят 3,4 pt под отметките си на 14 от 18 места, а четирите на
  раздел 2 (Flat standard, Silverlight, Luna, Cut) — 20–24 pt по-ниско, върху заглавието на раздел 3 (скриптът
  им само показва и скрива); `pulizia.sposta` в картата (смята го `scripts/moduli/dmg.mjs`) ги слага на реда
  на отметките им (`tests/dmg-larghezze.test.ts`).
- **Текстът в поле на формуляр не се реже от кутийката си** (собственикът, 13 ноември 2026 — датата на QF
  Fixtures излезе срязана наполовина: „Искам да бъде перфектен“; `pdf-form-testo.ts`): pdf-lib реди
  многоредовото поле от горния ръб надолу със стъпка 1,2 × височината на шрифта. Поле, което авторът е
  отбелязал като многоредово, а е високо един ред („Data“ — 11 pt; под `DUE_RIGHE` = 18 pt), се пише като
  един ред в средата (`disableMultiline`); бележка и поле за няколко реда, в което два реда влизат
  („Progetto / Indirizzo“, 11 полета на GEAT) — блок: редовете се мерят със същата стъпка (`altoNelCampo`,
  подадена на `fitBlock`), иначе последните редове на дълга бележка падаха под кутийката. Блок, който не
  влиза и при 5 pt, свършва с „…“ (и на плоските листове). Тестът `tests/moduli-campi-testo.test.ts` чете
  облика на всяко текстово поле на MoviLift, DMG и GEAT (кратка и дълга стойност) и сверява мастилото на
  всеки ред (fontkit) с правоъгълника, който го реже.
- **Свързаните данни** (`ordini/collegamenti-elenco.ts` + `collegamenti-aggiunti.ts` + `-scheda`, `-quadri`,
  `-pulsantiere` — ЕДИНСТВЕНИЯТ списък, другите файлове са продължението му: новите връзки са в края; видовете места и
  проверката при старт — `collegamenti.ts`; правилата — `collegati.ts`): едно и също нещо от уредбата
  в картата и/или в модулите. Решени със собственика: спирки („Piani n°“ на листа за аргано), скорост
  m/s и видът ѝ (табло 1V/2V/VVVF ↔ аргано AC1/AC2/Inverter), ход, товар, капацитет и № на асансьора
  (MoviLift, листът за аргано), напрежение на мотора (таблата) и на спирачката, врати, достъпи
  („Accessi 1/2“ ↔ „N° Accessi“ на Pelazza и „Operatore Unico / Doppio Ingresso“ на MoviLift), място
  на машината (MoviLift; на листа за аргано е текст — само попълване), въжета (брой, диаметър,
  снопове). После („всички полета с еднакви параметри“, октомври 2026): адрес, матрикула и марка
  (листът за аргано), вид на уредбата (Pelazza „Idraulico“), вратите на 2SG (Automatico,
  Semiautomatico), ток и обороти на мотора.
  DMG (2 ноември 2026) — в досегашните връзки: Pitagora — спирки, скорост, товар/хора/№ на дисплея,
  мотор (V, A, kW, полюси, обороти), спирачка, етажни врати, мястото на машинното, окачване, шейна,
  марка на централата и на вратите (само попълване); Fixtures — спирки, kg, хора, №, матрикула, адрес. Операторът на картата е махнат (17 октомври): марката му
  остава връзка само между таблата (Pelazza „Modello“, MoviLift — падащ списък, QI Touch; само
  попълване, при смяна на марката), напрежението и светлият отвор — без връзка.
  После (централата и Mastech): марката на централата (картата ↔ MoviLift „Idraulico“, само попълване;
  скоростта, ходът, мощността и пускането ѝ — махнати от картата на 21 октомври); NG120 и QI Touch —
  в досегашните връзки и в нови (полюси, мощност в kW, окачване 1:1/2:1, шайба, предавателно число);
  „Corsa [mm]“ на QI Touch не е в хода (метри). Таблата помежду си (сервизи, напрежение на шейната) — само
  за смяната на марката или модела: никога не са отворени заедно. Elettroquadri (30 октомври) — в
  същите връзки (спирки, скорост, ход, 2V/VVVF на geared, спирачка, достъпи 1/2, „MRL gearless“ от вида,
  мястото на централата на oleodinamico, оператор, ток, kW, сервизи, шейна, марка на централата; „Con
  Locale macchina: Alto/Basso“ на gearless — не, листът е за MRL); вратите им са
  етажни и на кабината поотделно (полуавтоматичните са две отметки) — не са във връзката на вратите. Място може да е поле на
  картата (текст, цифри, число; `valori` превежда „Sì/No“: „si“ → „2“), ред или падащ списък на модул
  (опцията — по дума или по числата, `opzioni.ts`), отметки, „Sì/No“ или радио група (`campo`; при
  една категория отсреща — първата ѝ опция, без нищо — стойността на празния модул). Сървърът попълва
  празните полета на модула при първото отваряне (от картата, иначе от другия модул; таблото на
  другата марка — скрито, но с „Sì“ на въпроса — дава стойностите си само за попълване в браузъра,
  никога като разминаване). В браузъра (`public/js/collegati.js`) всяко място, в което човекът не е
  писал (празно или още със сложеното му — `data-auto`), следва другите в реално време, във всяка
  посока: модулите — картата, картата — модулите („480 kg“ → 480 в товара, „1.000“ → 1000; каквото
  полето на картата не приема — нищо), модулът — другия модул; източник е първото място, което казва
  нещо (писаното преди попълненото), и стойността минава през картата към следваща връзка (N° Accessi
  → „Accessi: 2“ → Doppio Ingresso). Попълненото поле на картата се обажда като писане (`input`/`change`)
  — app.js показва условните полета и редовете на спирките, moduli.js — препратката. Писаното от човека
  не се презаписва; записаното в картата е писано. При запис браузърът праща кои полета (на картата и
  на модулите) още следват (`collegati-auto`, проверени по `NOMI_SEGUACI`), за да не замръзнат, ако
  формата се върне. Две места с различни стойности
  (числата по италиански: „1,0“ = „1“, „1.000“ = 1000, мерните единици не броят; отметките — без обща
  категория) → списък под групата в модула и при запис потвърждение на ТОЧНО тези разлики (отпечатък
  SHA-256, пази се в `discrepanzeConfermate`: същите разлики не се питат пак, нови или променени — да).
  „Salva comunque“ стои в лентата СЛЕД „Salva“: Enter в поле натиска първия бутон на формата и никога не
  потвърждава. Записаните разлики стоят на страницата на картата. Скритото (поле с условие, затворен
  модул), празното и връзките „само попълване“ (`confronto: false`) не се сравняват; преводът на
  отговор („si“ → „2“) гледа само собствените ключове. Свързано поле на модул няма свое `prefill` в
  картата на модула, а място на модул е най-много едно във връзка (проверка при старт). Новите връзки са
  в края на списъка — редът е редът на разминаванията и на отпечатъка.
  **3 ноември 2026 — всичко еднакво** (собственикът: „tutti i dati possibili vengono compilati
  automaticamente … in tutti i campi che hanno voci identiche … dobbiamo essere perfetti“; инвентар на
  картата и 13-те модула поле по поле): 101 връзки. Продължението на списъка, в този ред:
  `collegamenti-scheda.ts` (картата: новата централа — V на мотора, HP („Cv“ на листа за аргано е
  същото число от табелата — собственикът го потвърди), ход, пускане, електроклапани; „Installare kit A3?“ ↔ „Emendamento A3“;
  „Testata/Fossa ridotta?“ ↔ Pitagora и „Se EN81.21“ на Elettroquadri; престилката ↔ „Gestione grembiule“
  на Pitagora; вратите на етажа и на кабината (`portePiano`/`porteCabina`: полуавтоматичните са ръчни
  на етажа, автоматични в кабината — „Porte di piano“ на Pitagora излезе от `porte`, където „Manuali“
  спореше с полуавтоматичните); „Tipo argano esistente“; инверторът (kW); напрежението на оператора с
  2SG; „MRL“ ↔ „per MRL“ на Pelazza и „Armadio MRL“ на MoviLift), `collegamenti-quadri.ts` (таблата
  помежду си — норми, маневра, simplex/duplex, прекабелиране, кабели, вентилация, сигнали: служат при
  смяна на марката), `collegamenti-pulsantiere.ts` (Pitagora ↔ QF Fixtures: материал, бутони,
  осветление, сервизните бутони, ключовете, Smart Key, № CE, бутониерите на етажите); `spunta()` —
  връзка с една отметка (`collegamenti-spunta.ts`). Място с `idraulico` (Pitagora „VVVF“/„HYDRO“,
  MoviLift „Fune“/„Idraulico“) е другото поле при хидравлична уредба на картата — сървърът и браузърът
  избират по вида, а полето, което вече не е мястото, губи поставеното за него. Само стойност (не
  поле с данни) от картата — `prefill` на Pitagora: „Portata (kg/pers.)“ = „630/8“ (`portataPersone`),
  „Con pattino elettronico“ при шейна за смяна (като MoviLift). Не са свързани нарочно: различна мерна
  единица (kW ↔ HP, ход в mm ↔ m), поле без единица („Pot. Mot.“, „ElettroValv.“ на MoviLift), избор, в
  който едната страна е по-подробна и би се гадало (Display „Matisse 7″/10,1″“ ↔ „Matisse“, „Dardo“
  квадратен/кръгъл, Geared/Gearless на Pitagora ↔ „Elettrico“), имената на етажите (редът им не е
  един и същ). „Dati cliente“ на MoviLift — от данните на фирмата в настройките ѝ (`societa*` в
  `prefill`: наименование — вписаното, иначе името в портала; адрес, CAP, град, провинция, телефон,
  имейл — на фирмата, не на човека; всяко поле се пише отгоре и написаното остава; при нова карта —
  на избраната фирма, `datiDelleAziende` в `aziende/intestazione.ts`). Проверката: `tests/collegati-tutti.test.ts`
  — всяка двойка места на всяка връзка в 30 вида карти (6 марки × електрическа/MRL/хидравлична с
  аргано, 2SG, AMI 100 и бутониерите DMG), сървърът попълва и сравнява; e2e `collegati-tutti.mjs` —
  същото в Chromium в реално време (~2000 двойки) и смяната на марката между таблата.
- **Редът на разделите е на фирмата** (`Azienda.ordineSezioni`, `schede/ordine.ts` + `aziende/sezioni.ts`):
  подрежда го ADMIN на фирмата (и MASTER) в `/impostazioni` (`aziende:settings`), без JavaScript —
  стрелките пращат целия ред и страницата се връща с новия ред незаписан, „Salva ordine“ го пази (един
  запис в одита, `AZIENDA_SEZIONI`), „Ripristina“ — по подразбиране (пази се празно). „Impianto“ е
  винаги първи; пратеният ред се приема само ако съдържа всеки подвижен раздел точно
  веднъж. Важи за формата, страницата, печата и PDF-а; записаният ред се чете с недоверие (непознатото
  се маха, липсващото е накрая).
- **Листът (печат и PDF)**: горе логото (без лого — името на фирмата) и кой е попълнил; заглавието в
  средата; под него вляво адресът — удебелен, колкото заглавието, вдясно „Buono di lavoro“. Табелата
  — матрикулата вляво, № вдясно, без адреса. „Impianto“ не се печата като раздел — всичко от
  него е в лентата и в табелата. Кои раздели влизат — изборът в края на формата (`stampa`,
  `schede/stampa.ts`): пазят се изключените (`sezioniEscluse`), затова нов раздел влиза сам; подправен
  ключ → грешка. Шрифтовете на листа са с 2 px (1,5 pt) над екрана; квадратчетата — с линии и плътна
  отметка, избраното — получер (print.css, `pdf-spunte.ts`); долният ред на PDF-а е на два реда и стои под
  долното поле (иначе pdfkit отваря празна страница).
- **Търсенето** пише `searchText` (нормализиран: малки букви, без ударения) само в `schede/service.ts`;
  триграмен GIN индекс (`pg_trgm`). Всяка дума трябва да се намери; пълното съвпадение на номера е първо.
  Заявката отива като параметри (`Prisma.sql`), никога в текста на SQL.
- **Записът е само върху отворената версия** (`base` = updatedAt): промяна от друг междувременно → 409,
  въведеното остава на екрана.
- **Изтриване = кошче** (`deletedAt`); окончателно — само ADMIN+ от кошчето. Всичко пише в одита
  (`audit.ts`, само добавяне, без съдържание на схемите и без IP).
- **PDF:** DejaVu Sans от `PDF_FONT_DIR` (в образа: `fonts-dejavu-core`); без шрифта процесът не тръгва.
  Никога Helvetica/Times — нямат кирилица.
- **Индексира се само витрината:** `/`, `/privacy`, `/novita`, `/condizioni` и `/esportazione` (износът и смяната
  на доставчика — чл. 26 и 28 Data Act: файлът, полетата от кода, стъпките, цената, юрисдикцията; HowTo + FAQPage)
  (`seo/paths.ts`, един език — без hreflang) —
  `index, follow`, canonical, Open Graph/Twitter, geo, JSON-LD (Organization+LocalBusiness, WebSite,
  WebPage със speakable, BreadcrumbList, SoftwareApplication, HowTo, FAQPage — текстовете дума по дума
  от екрана; `sameAs` — само проверените профили от `COMPANY.profiles`: YouTube „Carbon Stealth VCC“),
  sitemap.xml, llms.txt, ключ за IndexNow. Порталът (вход, карти, хора…) остава
  `noindex, nofollow`; robots.txt разрешава точно публичните адреси (`$`), входа (за да се види
  noindex) и статиката, а забранява всичко друго. Разделите и ролите на витрината идват от `fields.ts`
  и `roles.ts` — тя не може да обещае поле или право, което порталът няма. Данните на фирмата
  (`company.ts`) са копие от korpora — същите вписани данни; телефоните — италианският +39 379 29 69 699
  първи (главният в JSON-LD), после българският на седалището (собственикът, 30 октомври 2026).
  Раздел „Dopo il rilievo: assistenza e cantiere“ (`SERVIZI` в `site/landing.ts`, чифт брой — две колони): листът за
  интервенция, бонът и протоколът, табелите, изчисленията, снимките и скиците, ролите и правата, данните (износ, CSV,
  API), цветовете — и във `featureList`, и в llms.txt. Текстовете (собственикът, 12 ноември 2026 — „на разбираем
  професионален италиански без трудни думи и без клиширани AI изречения“): „tu“ навсякъде, кратки изречения, само
  каквото порталът наистина прави (входът с Microsoft/Google — не, докато приложенията не са регистрирани; офертите —
  не, изключени са по подразбиране); FAQ — и цената, изтичането, без мрежа, износът, изчислението. Keywords ≥5 с „Carbon Stealth“; футърът
  носи „Created and Designed by Carbon Stealth VCC“. Промяна на витрината → `CONTENT_UPDATED` и след
  деплой IndexNow (`node tools/seo/indexnow.mjs https://rilievi.carbonstealth.eu`).
- **Новините на портала** (`src/novita/`, `routes/novita.ts`; собственикът, 10 ноември 2026 — „Fai una pagina sul
  nostro sito web con tutte queste cose. Al primo accesso di ogni utente dopo ogni aggiornamento fai uscire messaggio
  popup con descrizione degli aggiornamenti fatti dal suo ultimo accesso“; страницата — публична, по негов избор):
  ЕДИНСТВЕНИЯТ списък е `VOCI` в `novita/voci.ts` (най-новите отгоре; id `<ден>-<дума>` — котва и ключ, не се сменя
  никога), текстовете — `locales/it/novita.json` (`novita.voci.<id>`: раздел, заглавие, описание за външен читател;
  тестът пази двете страни). **Всяко видимо за хората обновяване = ред най-отгоре + текстовете му.** Страницата
  `/novita` (по дни, `index, follow`, canonical, OG, свои ключови думи с „Carbon Stealth“, видим път, „Ultimo
  aggiornamento“; JSON-LD WebPage + BreadcrumbList + ItemList; стиловете — `site-novita.css` само там), емисия RSS
  `/novita.xml` (`seo/feed.ts`), sitemap (`lastmod` — последната новина, weekly), robots, llms.txt (връзка и
  последните 5) и долната лента на витрината. Прозорецът в портала (`novita/popup.ts`,
  `views/partials/novita.ejs`, `public/js/novita.js`, `novita.css`): на вписан човек, само на цяла страница (GET с
  `Accept: text/html`, без `X-Partial`), новините, излезли след `User.novitaLetteAt` — до 6 (`MAX_POPUP`), после
  „E altre N“ и връзка към страницата. Стои, докато не се затвори: с JavaScript е модален и всяко затваряне („Ho
  capito“, Esc, „Tutte le novità“) праща `POST /novita/lette` във фонов режим (204); без него е отворен в
  страницата, а формата връща на същата страница (`safeNext`); CSRF. Прочитането е директен UPDATE —
  `updatedAt` на акаунта остава. Кога е излязла новина — таблица `Novita` (id, `pubblicataAt`), попълвана при
  първата страница на процес, който знае новината (`registro.ts`; после в паметта): празна таблица (нова
  инсталация, тестова база) — денят на новината (няма обновяване за обявяване), иначе — сега (самото обновяване:
  денят на новината може да е преди деплоя). Нов акаунт — `novitaLetteAt` от създаването (по-старото не е новост
  за него); миграцията `20261110200000_novita` даде на досегашните хора началото на деня на последния им вход
  минус 1 ms („dal suo ultimo accesso“, по деня), а на никога невлезлите — момента на миграцията. Грешка при
  четенето — без прозорец, страницата върви. e2e: `readUpdates` (helpers.mjs) след всеки вход — модален, axe,
  „Ho capito“ записано и не се връща; `/novita` — в обиколката на витрината.
- **Визията** е от заданието: бяло/черно, сивите са само линии и тихи повърхности, червеното — само за
  грешки. Витрината (собственикът, 30 октомври 2026 — „landing fotorealistica, professionale e con gli
  stessi colori bianco e nero“) е със **снимки, които сме направили сами**: черно-бели 3D рендери
  (`scripts/render/` — Mitsuba 3, `llvm_ad_mono`, процедурни бетон и стомана, без чужд модел или
  текстура): шахтата от ямата нагоре (първият екран — широка и отвесна за изправен телефон, LCP:
  `fetchpriority="high"`), бутониерата в кабината и таблетът с портала (истинска снимка на екрана на
  „Nuova scheda“, `assets/schermo.png`). Описани са като „Rendering 3D …“ — не се представят като
  снимки на истински обект. `src/site/immagini.ts` е списъкът (ширини, пропорция, описание);
  `npm run render:encode` прави от 16-битовите оригинали AVIF и WebP за всяка ширина в
  `public/img/site` (едноканални — без цвят); unit тестът пази, че всеки файл от `srcset` съществува в
  размера си и няма излишни, e2e — че всяка снимка се зарежда. Нов рендер: `render.py final <кадър>`
  (около час за четирите кадъра на 4 ядра — командите са в началото на render.py), после encode.
  Чертежът на шахтата (`views/site/_shaft.ejs`) остава — до легендата на картата и на входа: маркерите
  са номерата на разделите на картата (всеки раздел сочи своята част — `spots` по ключ). Витрината е
  без движение (и без JavaScript).
- **Логата** (собственикът, 1 ноември 2026 — свои две картинки: „Използвай ги като лого където мислиш, че
  ще паснат най-добре. Искам да са четливи и да се виждат добре“; заменят табелата „Targa nera“ от 31
  октомври). Оригиналите стоят както са дошли в `scripts/logo/originals` (извън образа): `mark.png` —
  шестоъгълникът „RI“ с шахтата, `logo.png` — марката с „RILIEVI IMPIANTI“ и „PIATTAFORMA TECNICA
  ASCENSORI“. `npm run brand:logo` ги изрязва до нарисуваното и пише `public/img/brand` (WebP с
  прозрачност; малките размери — леко изострени, иначе детайлите на шахтата стават сиво) и
  `favicon-32/192.png`. Марката — където логото е малко: черните ленти на портала и на витрината
  (`views/partials/brandmark.ejs`, 44 px, 1x/2x/3x; името до нея остава текст — следва темите и
  „Personalizzato“), иконките на раздела (`/favicon.ico` → 32) и apple-touch-icon.png. Пълното лого
  (`views/partials/logo.ejs`, `srcset` 360…1320w) — само където е поне 320 px широко, за да се чете и
  последният ред (той е ~6,5 % от височината): горе в черния панел на входа (400 px, на телефон 340),
  над заглавието на първия екран на витрината (440/340 px; тъмен ореол по очертанието и потъмнен таван
  на снимката отгоре), в долната част на витрината (320 px върху черна табела — на бяло последният ред
  избледнява) и в og.png. Картинки, не SVG. Нови лога: заменят се файловете в `originals`, после
  `npm run brand:logo` и `npm run brand:images`; unit тестът пази всеки файл от `srcset` в размера и
  пропорциите си, с прозрачност, и че в `public/img/brand` няма излишни.
- **Подредбата на всяко устройство** (собственикът, 31 октомври 2026 — „Искам да сме подредени … визуално
  перфектни на всякакъв вид устройство“): в един ред от полета етикетите, полетата и подсказките стоят на
  три общи линии — `grid--righe` (`public/css/righe.css`, CSS subgrid): полето носи етикет, контрола и
  подножие `field__piede` (и празно), етикет на два реда или подсказка под едно поле не местят съседите;
  дълъг падащ списък е сам на реда на телефон (`field--riga-telefono`), а от 720 px взима две колони
  (`field--doppia` — „Tipo di gola“, „Fune“): възможността не се реже до стрелката; филтърът по фирма на
  телефон — списъкът сам на реда, бутонът под него. Надпис и стойност („N° impianto 12“, „1 : 50“) — с
  твърд интервал. Страницата не излиза встрани до
  320 px: колоните на `stack-gap` и на картите в таблиците се свиват (`minmax(0, 1fr)`), дългият имейл се
  пренася. e2e го пази: `aligned()` (helpers.mjs) — на всяка страница от обиколката, на страницата за
  аргано на 360/768/1280 px и на телефона на 390 и 320 px, заедно с проверката за хоризонтален скрол;
  в нея и `selectsFit` — най-дългата възможност на всеки видим падащ списък се събира до стрелката (~28
  px); не се брои списък, който вече е цял ред на формата си (името на фирмата е нейно). Визуалната проверка
  на всички страници (10 ноември 2026 — компютър, таблет и телефон, светла и тъмна тема): проверката за
  хоризонтален скрол сравнява с `clientWidth` (на емулиран телефон `innerWidth` расте с преливащото) и
  обхожда и 810 px (таблет — таблиците още не са карти); таблица в `.table-scorre` (`tabelle-strette.css`)
  превърта себе си, не страницата; имейлът (`td.email`) се пренася където трябва, адресът и матрикулата —
  само между думите; мерките на спирка — на един ред по ширината на формата (`@container`), не на
  прозореца; в черната лента със „Salva“ бутоните са `btn--inverse` и `btn--bar` (тестът
  `barra-azioni`); страницата на картата на телефон — действията в две колони (`toolbar--griglia`).
- **Темата „Personalizzato“** (`http/colori.ts`, `routes/account-colori.ts`; собственикът, 30 октомври
  2026): всеки вписан човек избира в профила шест цвята (фон, текст, лента на менюто и текстът ѝ, акцент
  за главните бутони и избраното, линии) — `User.colori`, `Theme.CUSTOM`. Двойките, които се четат,
  се проверяват на сървъра (WCAG 2.1 AA: текст 4,5:1, акцентът спрямо фона 3:1) — нечетимата не се
  записва; останалите токени на base.css се извеждат така, че също да се четат (вторичен текст, рамки на
  полета, точките на менюто, текстът на бутона, червеното за грешки). Стилът е отделен файл от сесията
  (`/account/colori.css?v=<sha>`, частен кеш за година — нов цвят, нов адрес; без inline стил, CSP-то
  остава) върху светла или тъмна основа по яркостта на фона (`data-theme`). „Personalizzato“ има само
  човек със свои цветове; „Torna ai colori del portale“ ги трие и връща AUTO. Твърд цвят в CSS на
  портала = токен в base.css, иначе темата не го стига (`--bar-hover`, `--bar-current`, `--primary-*`).
- **Снимки и клипове** (`src/allegati/`, `src/routes/allegati.ts`, решение на собственика, 21 октомври
  2026): качват се във всеки раздел на записана карта (нова — след първия запис), до 10 файла наведнъж,
  с общ надпис; само хората, които пишат във фирмата, и не в кошчето. На сензорен екран (телефон, таблет —
  `any-pointer: coarse`) до „Aggiungi foto o video“ стои „Scatta foto“ (собственикът, 10 ноември 2026 —
  „dammi la possibilità di fare la foto istantanea e non solo di caricarla“): второ поле за файл на
  същата форма с `capture="environment"` — отваря камерата, а снимката тръгва веднага (`carica.js`,
  `requestSubmit`; без JavaScript — с „Carica“; празното поле multer прескача). На компютър бутонът го няма. Формите са ИЗВЪН формата на картата
  (`form=…`, `_allegati-forms.ejs`): качването не праща картата, а app.js не брои техните полета за
  промяна. Преди тялото: вход, Origin, таван (клип + 16 MB; без Content-Length — 411), картата в
  обхвата, свободно място (`MEDIA_MIN_FREE_MB`, запазено за текущите качвания); тялото — право в тома
  (`arrivi/`), после CSRF; видът — по байтовете (JPEG/PNG/WebP/AVIF; MP4/MOV/3GP/WebM/AVI; HEIC — отказ
  с подсказка). Файлът отива на мястото си ПРЕДИ реда (id-тата са от приложението, във времеви ред), а
  картата се проверява пак в транзакцията (`FOR SHARE` — не в кошчето). Редът е в опашката (`Allegato`,
  `IN_CODA`); компресира го `worker` (един наведнъж, `SKIP LOCKED`, до 3 опита): снимка — изправена, до
  2560 px, JPEG q82, без метаданни; клип — H.264 до 1080p/30 fps, AAC, `faststart`, HDR → SDR, без
  метаданни, най-много `MEDIA_MAX_VIDEO_MIN` (`-t` — и без дължина в контейнера); миниатюра до 960 px
  (печатът и PDF-ът) и плочка 490 × 368 покрити (`?riquadro=1` — галерията и кадърът на клипа; файл
  отпреди плочките — миниатюрата); оригиналът се трие. Снимка над 2560 px браузърът умалява до 2560 px
  и прекодира в JPEG 0,9 още преди качването (`carica.js`, само ако сам изправя снимките — проверка с
  малък JPEG с EXIF ориентация; иначе — оригиналът): от телефона тръгва ~0,8 вместо ~3 MB, без
  метаданните. Галерията се опреснява сама, докато има файл в
  обработка (allegati.js пази плочките, чието състояние не е сменено, а в сменената — надписа, който
  се пише, и фокуса).
  Надписът се записва само ако е сменен спрямо отворената страница (`prima-…`, `modificheDi`) — не
  връща чужд по-нов; изтриването е окончателно, с потвърждение (диалог или страница без JavaScript).
  Файлът се сервира само на виждащите картата, с `nosniff` и Range. Снимките в края на печата и PDF-а
  (решение на собственика, 21 октомври 2026) — избрани една по една като малки иконки в края на
  формата (`_foto-stampa.ejs`, `Allegato.inStampa`): нова снимка не е избрана; „Seleziona tutte“ /
  „Deseleziona tutte“ и броят — stampa-foto.js; без иконките (стара страница) записът не пипа избора, а
  с тях пипа само показаните (`fotoMostrate`) — качената междувременно остава каквато е; и върнатата
  форма (409/422) взима пратеното само за тогава показаните, а другите — от базата. Отметнатата
  излиза и от раздел извън листа (изключен или скрит от условие — иконките го белязват на живо), под
  името на раздела, по разделите в реда на фирмата; клиповете — само в портала. Подредбата пести хартия
  (собственикът, 5 ноември 2026 — „да се икономиса някой лист“): НЕ от нова страница — под листа, ако
  заглавието и първият ред се побират; „подравнени“ редове — снимките в реда са с една височина и
  заедно запълват ширината (~3 хоризонтални, ~4 вертикални на ред, без рязане и разтягане; последният
  ред остава с желаната височина); всички раздели са ЕДИН поток — снимки от различни раздели стоят една
  до друга, а разделът е удебелен в надписа на всяка („Quadro — надписът“; собственикът, 5 ноември 2026
  — „anche se sono di sezioni diverse, così risparmiamo il foglio“). PDF — `schede/pdf-foto.ts` (`righeFoto`, ~49 mm ред, ≤ 4 на ред; 12
  хоризонтални с надписи на страница, бяха 6); печатът от браузъра — `print.css` (flex с основа и
  растеж по формата: класът `paper__figura--v|q|o|l` от print.ejs; без inline style — CSP).
  **Големината и редът** (собственикът, 10 ноември 2026 — „facciamo scegliere all'utente nelle impostazioni
  di stampa con un'anteprima la dimensione e l'ordine delle foto“): под иконките — „Dimensione delle foto“
  (радио, и без JavaScript): Piccole · Medie (досегашното, по подразбиране) · Grandi · Una per riga —
  `Scheda.fotoDimensione` (enum `FotoDimensione`), `DIMENSIONI` в `pdf-foto.ts` (височина на реда, най-много
  на ред, таван на височината на пълния ред; печатът — `paper__foto-grid--<големина>`, мащабът `--foto` в
  print.css); и „Ordine nella stampa“ — отметнатите като списък с „↑“/„↓“ и преглед на страниците A4 до
  него (`public/js/foto-ordine.js`; редовете — `public/js/foto-righe.js`, пренесени от `righeFoto` —
  unit тестът го пуска в node:vm и сравнява за всяка големина; прегледът е само за снимките — в PDF-а те
  продължават под листа). Редът пътува в скритото `fotoOrdine` (id-тата) и се пази в `Allegato.ordineStampa`
  (1…n; снимка, махната от печата, губи мястото си); печатът и PDF-ът подреждат първо снимките с място, по
  него, после другите — по разделите и качването (`inOrdine` в `allegati/stampa.ts`); групите са
  последователните снимки от един раздел. Подправен ред или големина — 422; страница без тях (стара) не ги
  пипа. Иконките се взимат пак от `/schede/:id/foto-stampa`, когато галерия се смени (allegati.js
  праща `rilievi:galleria`), и пазят отметнатото, но незаписано. `Scheda.fotoStampate` остава за
  предишния код — „поне една снимка в печата“, без да мести `updatedAt`; миграцията отметна всички
  снимки на картите с досегашната отметка „Includi le foto“.
  Окончателно изтритата карта взима и папката си. Снимките са съдържание, не украса — правилото за
  визията по-долу не ги засяга.
- **Листът за интервенция** (`src/interventi/`, `routes/interventi.ts` + `interventi-firma.ts` +
  `interventi-invio.ts`, решение на собственика, 30 октомври 2026 — по снимката на хартиения блок „Servizio
  assistenza elevatori · Modulo di pronto intervento“): главата („Effettuato il“, Matt./Pom., адрес, град,
  техници, матрикула), точките 01–97 в петте групи с номерата и празните места на блока („n. …“, „lt …“,
  „piano …“; 84 — и „C“/„P“), „Altro“, пробите и часовете, подписите на техника (вляво) и на клиента
  (вдясно) с пръст (`public/js/firma.js` — щрихи в поле 600 × 200, проверени на сървъра; рисуват се
  еднакво в страницата като SVG и в PDF-а). Номерът е на фирмата, от 1, без дупки и без повторения:
  `Azienda.interventiNumero` се увеличава в транзакцията на листа (UPDATE … RETURNING заключва реда на
  фирмата); лист не се трие. Черновата се пише от OPERATORE нагоре (`interventi:write`), чете се от
  CLIENTE нагоре; записът е само върху отворената версия (`base`).
- **Подписът е обвързан със съдържанието** (собственикът, 30 октомври 2026 — „сигурността на максимално
  ниво“, без 2FA засега): черновата НИКОГА не носи подпис или име — формата ги няма, сървърът не ги чете, а
  базата ги отказва (`Intervento_firme_check`). Подписват се на „Firma e conferma“ (`/interventi/:id/firma`):
  окончателният лист само за четене, отпечатъкът му (`impronta` — SHA-256 на фирмата, номера, главата,
  точките, „Altro“, пробите и часовете в постоянен ред, `sigillo.ts`) и двата подписа с имената под него.
  Формата връща версията и отпечатъка, които е показала; различни от записаните (колега е записал
  междувременно, подправена форма) → 409, листът наново, подписите — празни. Еднакви щрихи в двете полета —
  грешка (клиентът не е подписал); щрихи, които вече стоят на друг лист (която и да е фирма, което и да е
  поле — `firmaTecnicoHash`/`firmaClienteHash`, SHA-256 с индекс; потвържденията се редят с
  `pg_advisory_xact_lock`), — също: копирани са от страницата, PDF-а или прихванати. Подписите, имената,
  отпечатъкът, печатът (`sigillo` — HMAC-SHA256 с `INTERVENTI_SEAL_KEY` над отпечатъка, подписите,
  имената, часа и кой е потвърдил) и `confermatoAt` влизат с ЕДИН UPDATE с условията (`confermatoAt`
  празно, същата версия); одитът пази отпечатъка. Канонът на отпечатъка и печата е част от формата —
  тестът с еталонните стойности го пази; нов канон = нов етикет (`v2`) и старият за проверка. След това нищо не пише листа
  (формата пренасочва, POST-ът не променя нищо). Печатът се проверява при всяко показване, PDF и имейл
  (`sigilloIntatto`): несъвпадение (промяна в базата на ръка, лист отпреди печата, друг ключ) → страницата
  казва „il sigillo non corrisponde“, PDF и имейл спират, в лога — `intervento.sigillo` (само id). PDF
  (`/interventi/:id/pdf`, отпечатъкът е под реда за потвърждението) и имейл (`/invia`, адресът се пише при
  изпращането, PDF-ът е прикачен; `mailLimiter` 20/час на акаунт; в одита без адреса) — само за потвърден
  лист с непокътнат печат. Ключът не се сменя никога (DEPLOY.md, т. 1; липсва ли, а има запечатани листове,
  `deploy.sh` спира, не създава нов). Граница: печатът доказва „нищо не е пипано след подписа“, не „клиентът
  е видял точно това“ — подпис, пренесен с малко отместване от друг лист или нарисуван от друг, минава, както
  на хартия. Самоличността на клиента би искала код до него (OTP), което собственикът отложи.
  PDF-ът е винаги една страница: текстовете на главата се съкращават с „…“ по мярка (`unaRiga`, `inRighe` —
  pdfkit не го прави при `continued`), а при много попълнени редове размерът на точките намалява на стъпки
  (`fineFoglio` ≤ `FONDO_PAGINA`, тестът проверява най-пълния лист). Листът се рисува веднъж, преливащият —
  още веднъж: размерът идва от височината на колоните, мерена без рисуване (`misuraColonna` — същата
  формула като `drawColonna`); DejaVu се чете веднъж за процеса.
- **Табелата „Avviso di fermo impianto“** (`src/cartelli/`, `routes/cartelli.ts` +
  `impostazioni-cartello.ts`; собственикът, 30 октомври 2026 — пет готови табели без лого, „usa questi come
  bozze“): в „Assistenza elevatori“ → „Cartelli fermo impianto“. Табелата пази само датата, адреса, града,
  мястото на уредбата и текста към хората (задължителен); правата са тези на листа за интервенция (пише
  OPERATORE нагоре, чете CLIENTE нагоре), обхватът — по фирма, чужда табела — 404; записът е върху
  отворената версия (`base`), изтриването е окончателно (одитът остава). Облеклото е шаблонът, избран от
  фирмата в настройките (`Azienda.cartelloModello`; непознат — първият), а главата горе — логото на фирмата
  и данните ѝ (`Azienda.datiSocietari`, попълва ги ADMIN/MASTER в `/impostazioni`; празно име — името в
  портала), взети при всяко рисуване на PDF-а. Шаблоните са JPEG-ите на собственика (`assets/cartelli/`,
  закрепени по SHA-256 — друга картинка значи други координати, процесът не тръгва) с карта в пиксели на
  оригинала. Картинките са увеличени за печат (собственикът, 31 октомври 2026 — „фотореалистични 1 към 1 …
  с по-високо качество“): Real-ESRGAN x4plus (BSD-3), смесен 3:1 с обикновено увеличение (Lanczos — сам
  моделът размазва ситните детайли на снимките в плоски щрихи), после Lanczos до най-малкия цял множител
  `scala` с поне 3000 px по дългата страна (~260–310 dpi на A4) — същата картинка, нищо не е дорисувано;
  `scripts/cartelli/upscale.py` пише JPEG-а и `scala`/`sha256` в картата, координатите остават на
  оригинала, а `modelli.ts` ги умножава по `scala`. Примерните данни (дата, адрес, град, място, текстът,
  редът с дейността и червената линия над него) се изчистват в паметта — всяка
  колона на полето се запълва по права между средния цвят на трите реда над него и трите под него (по
  `scala` реда на увеличената картинка), така и
  преливането към снимката остава; полето не застъпва линия от шаблона (редът над и под е фон). Надписите,
  отрязани в картинката („Blu tecnico“), се пишат наново (`scritte`). Ред с дейността няма нито на
  табелата, нито в настройките, а червената линия до логото („Giallo e nero“, „Blu tecnico“) се изчиства с
  него (собственикът, 30 октомври 2026; тестът търси червен ред под логото на всеки шаблон). PDF-ът е A4 — хоризонтален за широк
  шаблон, вертикален за висок; Fira Sans Condensed (WOFF, като надписите на шаблоните), знак извън латиницата
  — DejaVu; всеки текст се смалява до 55 % и чак тогава се реже с „…“ (при текста към хората — на последния
  ред с текст). Мястото на рязане на дълга дума и размерът на текста се търсят двоично: PDF-ът се рисува в
  единствената нишка на портала, а дума от 600 знака знак по знак беше 2–3 s (тестът пази под 1,5 s).
  **Табелата от картата** (`cartelli/da-scheda.ts`, `cartelli/scheda.ts`, `routes/cartelli-nuovo.ts`;
  собственикът, 30 октомври 2026 — „usare le schede per auto compilare cartello … lasciando la possibilità
  di creare anche cartelli per impianti che non hanno schede“): бутон „Cartello di fermo impianto“ на
  страницата на картата (`/cartelli/nuovo?scheda=<id>`) или търсене във формата (`?cerca=` — търсачката на
  „Schede“; едно попадение — направо попълнената форма). Попълва се: датата (днес); адресът и градът —
  от последната табела на същата уредба (поправеното на ръка), иначе адресът на картата, разделен на
  последната запетая (CAP и „(MI)“ отпадат; опашка с цифри не е град; „Scala B“, „Palazzina 2“ отзад —
  мястото на уредбата); текстът към хората — от работите по картата (само видимите полета със „Sì“:
  табло, аргано, централа, механизмите на вратите, бутониери, осветление; телесокорсо и устройства за
  безопасност се „монтират“), без работа — празен (причина не се измисля); всичко остава за проверка.
  Табелата пази връзката (`Cartello.schedaId`, окончателно изтритата карта я нулира); картата се взима
  само ако човекът я вижда (`schede:read`) И пише табели в нейната фирма, не е в кошчето (и в
  транзакцията на записа — `FOR SHARE`); иначе 422 и написаното остава. Табела без карта — както досега.
  Страницата на табелата сочи картата, страницата на картата — табелите си.
  Логото и данните на фирмата стоят горе на ВСЯКА табела (собственикът, 30 октомври 2026 — „nella parte
  superiore di tutti i cartelli deve comparire il logo e i dati societari“) — и в това, което порталът
  показва: картинката на страницата на табелата (`/cartelli/:id/anteprima.webp`) и петте шаблона в
  настройките (`/impostazioni/cartello/anteprima/<шаблон>.webp?azienda=`, само `aziende:settings` на
  фирмата) са самият PDF, превърнат в WebP (`cartelli/vista.ts`: pdftoppm → суров PPM → sharp; PNG-то
  през pdftoppm беше 1,2 s, PPM-ът — 45 ms), помнени по входа (шаблон, данни, лого — до 80). Свой таван
  `vistaLimiter` (120/мин. на акаунт) — настройките са пет картинки, не бива да изяждат PDF-ите. Без
  лого или без данни страницата и настройките го казват (логото слага само MASTER). Без pdftoppm (машина
  за разработка) — голият шаблон и едно предупреждение в лога; в образа и в CI го има. Ново поле на табелата = нова колона в
  картата на всеки шаблон и поглед в PDF-а на петте.
- **„Verbale di chiusura cantiere“** (`src/verbali/`, `routes/verbali*.ts`; собственикът, 5 ноември 2026, по
  хартиения лист: „свързано със Scheda … да се попълва автоматично само indirizzo, Nº Buono и дата. Всичко
  друго трябва да попълним и да изберем ние. След подписа на двете места трябва да се генерират 2 pdf с
  надпис Copia Azienda и Copia Installatore“): в „Assistenza elevatori“ → „Verbali chiusura cantiere“ и бутон
  „Verbale di chiusura“ на картата. От картата (`/verbali/nuovo?scheda=<id>`, търсенето `?cerca=` — като
  при табелата, общите части от `routes/cartelli-nuovo.ts` и `views/cartelli/_da-scheda.ejs`) или без карта;
  от картата идват САМО адресът и `buonoLavoro`, датата е днешната (може да се смени). Редовете —
  `verbali/voci.ts`: „Locale macchina“ (Quadro, Argano/centralina, Funi/tubazione, Impianto elettrico,
  Limitatore, Varie), „Vano corsa“ (Linee elettriche, Cavi, Serrature/sospensioni, Luce vano, Varie),
  „Cabina“ (Circuito cabina, Bottoniera, Tetto cabina, Varie), „Finiture“ (Bottoniere, Imbotti, Varie);
  „Certificato“ SÌ/NO само на Quadro, Argano, Funi, Limitatore и Serrature — другите клетки вдясно са
  празни (собственикът: „само текст“). „Verbale positivo“ SÌ/NO — без него протоколът не се подписва.
  PDF-ът е „uguale identico“ на хартиения лист (собственикът, 5 ноември 2026; `verbali/pdf*.ts`): две
  страници A4 в рамка, логото на фирмата горе в средата на всяка, DejaVu Serif (в образа —
  `fonts-dejavu-core`; без него — Sans). Стр. 1: заглавието, „Indirizzo“ / „N° buono“, „Locale macchina“,
  „Vano corsa“; стр. 2 (винаги от „Cabina“): „Cabina“, „Finiture“, „Verbale positivo SI NO“, подписите над
  черта, „Data:“ долу вляво, копието долу в средата. Редът е една клетка „Quadro: <текст>“; „Certificato /
  Si No“ — в дясната клетка на реда. Под рамката, дребно — потвърждението и отпечатъкът (на хартия ги
  няма). Страницата на протокола (`views/verbali/_foglio.ejs`) е същата подредба.
  Подписите — като листа за интервенция (собственикът: „като листа за интервенция“): „Firma tecnico
  esecutore“ и „Firma supervisore“ на отделна страница върху окончателния протокол, отпечатък
  (`rilievi/verbale/v1` — без връзката с картата, за да оцелее окончателното ѝ изтриване) и печат HMAC
  със същия ключ и свой етикет; CHECK `Verbale_firme_check`. Повторен подпис се търси и в листовете, и в
  протоколите (`interventi/conferma.ts`, `firmeGiaUsate`, същото заключване `LOCK_FIRME`). След
  потвърждението — два PDF-а от едно съдържание: `/verbali/:id/pdf/azienda` и `/pdf/installatore`
  („COPIA AZIENDA“ / „COPIA INSTALLATORE“ долу на всяка страница и в заглавието на файла), само при
  непокътнат печат. Права — тези на асистенцията (`interventi:read`/`interventi:write`). Без номер и без
  изтриване (както листа за интервенция); в износа и в изтриването на фирмата.
- **„Buono di lavoro“** (`src/buoni/`, `routes/buoni*.ts`, `views/buoni/`; собственикът, 12 ноември 2026 — „una voce
  nuovo buono di lavoro che ha queste caratteristiche e questi campi“, по хартиения лист; „Alcune firme possono essere
  lasciate vuote per poi farle a mano sul foglio“; „da scheda o libero“; кодът и клаузата — „impostabili per
  azienda“): „Documenti“ → „Buoni di lavoro“, „Nuovo“ и бутон на картата. Общите данни (дата на потвърждение,
  геометър, поръчка, оферта, предвидените дни, матрикула, място, P.O.S. SÌ/NO с бележката, бележки) — колони;
  редовете с работа — `sequenze` (JSON, до 30, всеки с постоянен id `[0-9a-f]{8}`: описание, OK / NON OK, ден,
  доставчик); шестте проверки — `controlli` (ЕДИН списък, `CONTROLLI` в `voci.ts`, трите при смяна на таблото —
  група); отчетът (начало и край с часа `HH:MM`, спиранията), фамилиите на техниците. JSON-ът се чете с недоверие
  (`dati.ts`). От картата (`?scheda=`, търсенето `?cerca=` — общото с табелата и протокола): номерът на бона,
  матрикулата, адресът и редовете с работите, които картата казва (`lavoriDi`); без карта — празен. Права — на
  асистенцията (`interventi:read`/`write`), обхват по фирма, чужд — 404; записът — върху отворената версия (`base`).
  **Подписите — всеки по избор и вързан за подписаното** (`buoni/firme.ts`, модел `BuonoFirma`, място `s-<ред>` /
  `c-<проверка>` / `f-<долу>`): по реда и проверката — във формата (`firma.js`; подписан ред се чете само, стойностите
  пътуват скрити, „Togli la firma“ е бутон `togli` — записва и маха); долу (пазачът, главният техник, геометърът,
  началникът на работилницата) — на страницата на листа, върху записаното. Отпечатъкът: на реда — редът, на
  проверката — изходът и денят, долу — целият лист с подписите по редовете (без тези долу). Променен подписан ред
  без „Togli“ — 422 `modificata`, махнат — `tolta`; има ли подпис долу, листът е `chiuso` (формата пренасочва, POST-ът
  не пише). Еднакви щрихи на две места — `uguale`, вече на който и да е документ на портала — `ripetuta`
  (`firmeGiaUsate` гледа и `BuonoFirma`, под `LOCK_FIRME`). Всеки подпис носи печат HMAC (`INTERVENTI_SEAL_KEY`,
  етикет `rilievi/buono/firma/v1`) над листа, мястото, щрихите, подписаното, часа и кой е бил вписан; валиден е само
  при същия печат, щрихи и подписано днес (`statoFirme`) — невалидният се казва с думи, никога с щрихите. Празен подпис
  е празно място на PDF-а (на ръка). PDF/A A4 като хартията (`pdf.ts` + `pdf-foglio.ts` + `pdf-sezioni.ts`): логото,
  заглавието, кодът на модула горе вдясно, поне 8 реда, проверките, отчетът, подписите, клаузата; дълъг лист —
  следваща страница с главата на таблицата; долу на всяка страница — „Generato con…“, броят на подписите,
  отпечатъкът на листа под подписите долу и „Pagina n di N“. Кодът и клаузата — `Azienda.buonoCodice`/`buonoClausola`
  (до 80 / 1000 знака, празно — нищо), раздел „Buono di lavoro“ на настройките, одит `AZIENDA_BUONO` без текста.
  Имейл с PDF-а (`mailLimiter`, адресът не се пази, одит `BUONO_EMAIL`); изтриване — само на лист без подписи
  (`BUONO_DELETE`). В износа (`buoni` с `firme` в `dati.json`, PDF/A в `documenti/buoni/`) и в изтриването на фирмата.
  Миграция `20261112210000_buono_lavoro` (само добавя; CHECK-ове за JSON-а, часовете, мястото и отпечатъците; GIN
  индекс за търсенето).
- **Офертите („Preventivi“)** (`src/preventivi/`, `routes/preventivi*.ts`, `views/preventivi/`; собственикът, 12
  ноември 2026 — точка C1: „disattivato di default e attivabile dalle impostazioni master“): **изключени по
  подразбиране** (`Azienda.preventiviAttivi`); включва и изключва ги САМО MASTER — раздел „Preventivi“ на страницата
  на фирмата (`POST /aziende/:id/preventivi`, одит `AZIENDA_PREVENTIVI`). Изключени, ги няма за никого във фирмата:
  `preventivi:read/write` минават само при `MembershipView.preventivi` (`scope.ts`, `puoMembro`; членството носи
  флага от `memberships.ts`), заявките за MASTER филтрират `azienda.preventiviAttivi` (`elenco.ts`), менюто, бутонът
  на картата, разделът на настройките (`sezioniDi`) и отметките в „Ruoli e permessi“ изчезват — а запис на ролите
  при изключени оферти пази правата им каквито са (`capacitaNascoste`, `parseRuoli`). Нищо не се трие: включени
  наново, офертите и ценоразписът са там; износът ги носи винаги. Права по подразбиране — от RESPONSABILE нагоре
  (цените са търговска информация), сменят се в ролите; писането води четенето. Офертата: клиентът (име, адрес,
  P. IVA/CF — 11 цифри с „IT“ или 16 знака, имейл), ден, валидност 1–365 (30), предмет, уредба, до 100 реда (код,
  описание, мерна единица, количество, цена, отстъпка %, ставка 22/10/4), бележки, условия (идват от настройките на
  фирмата — `Azienda.preventivoCondizioni`, раздел „Preventivi“, ADMIN, одит без текста). **Парите — само цели
  числа** (`importi.ts`): центове, хилядни, стотни от процента; закръгляне математическо (BigInt, половината
  нагоре) веднъж на стъпка — ред, после отстъпката; ДДС на сбора по ставка („riepilogo IVA“). Сборовете в
  колоните (`imponibile/imposta/totale`, CHECK) смята само сървърът от прочетените редове — пратена сума се
  пренебрегва (тестът го пази); браузърът (`public/js/preventivo.js`) показва същата аритметика само за ориентир.
  Номерът — на фирмата, от 1 (`Azienda.preventiviNumero`, UPDATE … RETURNING в транзакцията и САМО при включени
  оферти и активна фирма). Състояния: Bozza → Inviato → Accettato/Rifiutato (и обратно към Inviato — грешно
  отбелязан изход); промяна само в Bozza/Inviato и върху отворената версия (`base`); трие се само чернова (одитът
  пази номера — дупка в номерацията е допустима, офертата не е фискален документ). От картата (`?scheda=`):
  уредбата, предметът и ред за всяка работа от картата — без цена (не се измисля); „Duplica“ (`?da=`); търсенето
  `?cerca=` — общото с табелата. Ценоразписът (`/preventivi/listino`, `VoceListino`, до 1000 на фирма — броят под
  заключен ред на фирмата; кодът — единствен; одит `LISTINO_UPDATE` без цените): „Aggiungi dal listino“ и кодът
  в реда попълват празните полета (`/preventivi/listino.json` — само за пишещите във фирмата); цената на вече
  направена оферта не следва ценоразписа. PDF/A A4 като писмо (логото, данните на фирмата, „Spett.le“, таблицата
  с главата на всяка страница, обобщението по ставки, бележки, условия, „Per accettazione“, долу номер и „Pagina n
  di N“). Писмо до клиента с PDF-а (`mailLimiter`, отговорът — до пратилия, адресът не се пази, черновата става
  „Inviato“ само при тръгнало писмо; одит `PREVENTIVO_EMAIL` без адреса). В износа (`preventivi`, `listino`,
  `documenti/preventivi/`) и в изтриването на фирмата. Миграция `20261113090000_preventivi` (само добавя; CHECK за
  сумите, ценоразписа и брояча; GIN индекс за търсенето).
- **Всеки лист с изчисление казва кой, с какво и кой трябва да го провери** (собственикът, 10 ноември 2026 —
  „Su ogni foglio dobbiamo scrivere che è stato generato dal nostro software, che non abbiamo nessuna
  responsabilità perché deve essere comunque controllato e firmato da persona istruita e da chi è stato
  generato“; правният преглед — Правният Разбирач, същия ден). PDF-ът (`argano/pdf-testata.ts`, общото на
  изчисленията): долу на ВСЯКА страница (`disegnaPiede`, три реда, всеки се събира — шрифтът пада до 5,6 pt,
  после „…“) — „Generato con Rilievi Impianti (Carbon Stealth VCC), build <код>, da <който тегли PDF-а> il
  <кога> · Rif. <XXXX-XXXX-XXXX>“, „privo di validità senza verifica e firma di un tecnico abilitato“, кога и
  от кого е записано изчислението и номерът; в края — „Avvertenza“ и „Verifica del tecnico abilitato“
  (квадратче „Dati di ingresso verificati“, име, квалификация и № в регистъра, дата, подпис —
  `disegnaAvvertenza`, цяло на една страница). Build-ът е отпечатъкът на работещия код (`src/build.ts` —
  `dist/` или `src/` и `locales/`; на сървъра няма `.git`), Rif. — SHA-256 на вида изчисление, build-а и
  входа (`improntaCalcolo`, ключовете подредени): същият вход и същият софтуер дават същия Rif., така
  отпечатан лист се сверява със записаното изчисление. Страницата на изчислението — същото предупреждение
  (`views/partials/avvertenza-calcolo.ejs`). Текстовете — `locales/it/calcoli.json`. **Ограничението на
  отговорността е „nei limiti consentiti dalla legge applicabile“ и изрично оставя неизключимото — никога
  „nessuna responsabilità“:** пълно изключване е нищожно при умисъл и груба небрежност (чл. 1229 c.c.; чл. 94
  ЗЗД), а от 9 декември 2026 отговорността към физически лица за дефектен продукт — и софтуер, и SaaS — не
  се изключва с договор (Дир. (ЕС) 2024/2853); листът е предупреждение и доказателство (съпричиняване — чл.
  1227 c.c., чл. 83 ЗЗД), не освобождаване. Тестът пази формулировката. Договорът с
  клиента — условията за услугата (по-долу, „Условията и доказателствата“). **Нов калкулатор**: PDF с
  `disegnaTestata` ⇒ `disegnaAvvertenza` + `disegnaPiede(doc, t, { generato, … })` с build и Rif., а изгледът
  `calcolo*.ejs` включва предупреждението — `tests/calcoli-avvertenza.test.ts` проверява всеки такъв файл и
  всяка страница на PDF-ите — и записва всеки изтеглен PDF с `registraEmissione` (`src/legale/emissioni.ts`)
  ПРЕДИ да го прати.
- **Условията и доказателствата** (`src/legale/`, `routes/condizioni*.ts`, `legale/*.json`; собственикът, 10
  ноември 2026 — „Fai tutto in modo tale da essere legalmente coperti e minimamente esposti, l'assicurazione ce
  l'abbiamo di già contro terzi“; текстовете и механизмът — Правният Разбирач, същия ден, не е правен съвет).
  Никой не ползва портала без тях (`requireUser` → `/condizioni/accetta`; MASTER — не, той е доставчикът):
  условията за услугата с Приложение A (DPA по чл. 28 GDPR) приема за фирмата САМО неин ADMIN, на две стъпки —
  данните на фирмата (ragione sociale, sede, P. IVA — декларирани, чл. 3.3) и отметката, после **на своя
  страница** специалното одобрение на клаузите от чл. 24 (чл. 1341–1342 c.c.), всяка с номер, описание и
  пълния си текст, **подписано с 6-цифрен код по имейл** (FES; Cass. 20945/2026 — една или две отметки не
  стигат): CSPRNG, в базата само HMAC, 30 мин (`CODICE_MINUTI`; до 4.2 — 10; собственикът, 13 ноември 2026: писмото
  дойде след 5 минути), веднъж, 5 опита, нов код след минута, до 5 на час
  (`legale/firma.ts`). Без отметката формата на подписа не тръгва (`public/js/condizioni-firma.js`: съобщението
  излиза под нея, написаният код остава; отметне ли се — изчезва; без JavaScript — 422 от сървъра, както досега).
  Писмата понякога се бавят: страницата на подписа (`legale.firma.codiceRitardo` — и че важи
  само последният код), „Password dimenticata“ (`auth.forgot.sent`) и бележката „Email inviata“ при покана и връзка
  за парола (`users.mail.sent`) казват „a volte servono 5–10 minuti“. Без поща в продукция кодът не тръгва = грешка;
  в среда за проба без SMTP се показва в съобщението. Другите хора на фирмата чакат (страницата назовава администраторите). Правилата за ползване
  (`REGOLE`, вкл. предупреждението за изчисленията дума по дума) — всеки сам, с отметка. Отметките никога не
  идват отметнати. Копието (PDF: обобщение + целият текст) — по имейл веднага и за сваляне от „Account“
  (`/condizioni/copia`, само ADMIN). **Текстът на версия не се пипа никога:** `legale/<вид>-<версия>.json`,
  хешът на всеки файл е закован в `tests/legale-testi.test.ts`; нов текст = нов файл + ред в `STORIA`
  (`legale/versioni.ts`) + нов ред в теста — и всички приемат наново. **Нова версия влиза САМО обявена**
  (чл. 18.1): MASTER → „Contratti“ → „Annuncia agli amministratori“ (`legale/annunci.ts`: ред в `AnnuncioTesto`
  — не се трие, одит `CONDIZIONI_ANNUNCIATE`, съобщение до всички фирми с лента до деня и писмо до всеки
  ADMIN); в сила е в полунощ по Рим на по-късния от двата дни — своя ден или 30 дни след обявата. Без обява
  остава досегашната (fail closed). `VERSIONE` е getter — сменя се сам, без деплой в деня; обявите се зареждат
  при старта и всеки час. `/condizioni/prossima` (`noindex`) — следващата версия с това, което се сменя
  (`modifiche`, по алинея). **Версия `2026-11-12`** — в сила от своя ден БЕЗ обява (`SENZA_PREAVVISO` в
  versioni.ts; собственикът, 12 ноември 2026: „Акаунтите са мои на всичките тестови фирми, не ми трябва да
  обявявам нищо … Новите условия влизат в сила днес“ — външни клиенти още няма): текстът на `2027-01-12`
  (Allegato B — Data Act; 1.10, 2.1, 2.4, 3.1, 3.2, 4.6, 5.4, 5.5, 15.4, 17.3, 17.4, 23.1, A.2–A.4, A.11, A.13,
  S.1) + абонаментът (1.11; чл. 12 „Prova gratuita, Piani e corrispettivi“ — 12.1–12.9; 15.2; 16.1; 19.1; A.9;
  чл. 24 и `clausoleSpecifiche` — нова клауза 12.5, затова всички подписват наново с код). `2027-01-12` излезе
  от `STORIA` и не влиза никога (файлът и хешът му остават). Всичко, което текстът обещава (`/stato`, вход с
  Microsoft/Google, PDF/A, оферти, поръчки, страницата на подписа, пробата, само четенето), е в портала. Нова
  версия оттук нататък — само обявена. Текстовете — Правният Разбирач (не е правен съвет). Промяна
  на `calcoli.avvertenza.testo` ⇒ нова версия на правилата (тестът го хваща). Регистрите (чл. 19):
  `Accettazione` (кой, кога, версия + SHA-256 на текста, клаузи, код — до кой адрес, кога пратен/въведен, IP и
  браузър, отпечатък на копието) и `EmissioneCalcolo` (всеки PDF с изчисление: вход, отпечатани редове,
  build, Rif., SHA-256 на файла, кой) — **запечатани с HMAC** (`legale/sigillo.ts`, ключ от
  INTERVENTI_SEAL_KEY, етикет `prove-legali-v1`), без връзки към човека и фирмата: надживяват ги. Срок —
  приеманията: докато фирмата съществува и 10 години след изтриването ѝ (`eliminaAzienda` мести
  `conservaFino`); изчисленията: 10 години от изтеглянето; трие ги само поддръжката. Точният текст на
  приетата версия е и в `TestoLegale`. Без запис PDF-ът на изчислението не излиза (500). Право — българско,
  съд — София (чл. 21–22); таван 1.000 € (чл. 9.3). Privacy-то казва за регистрите и IP. Фирмите и хората отпреди
  условията (тестовите на собственика — „fai risultare come se avessero firmato“) брои за приели миграцията
  `20261110230000_condizioni_esistenti` — **без ред в регистъра**: подпис, който не е бил, не се измисля (регистърът е
  доказателство). Такава фирма, станала клиент: `condizioniVersione = NULL` (DEPLOY.md) и ADMIN подписва наистина.
- **Изчислението за аргано** (`src/argano/`, `routes/calcolo-argano.ts`; собственикът, 31 октомври 2026 — от
  своя „RT-E MOD 10411-1“ (Excel по UNI 10411-1): изчисление и проверки, отделна страница и PDF, по метода
  на файла, без мощност на мотора): бутон „Calcolo argano“ на картата (не при хидравлична), страница
  `/schede/:id/calcolo-argano` и PDF `…/calcolo-argano.pdf`. Формулите са на листовете „Macchina“
  (скоростта v = n·π·D / (i·60000·taglia), разликата до 5 % спрямо досегашната; при VVVF — нужните обороти
  и честотата за мотор 1000/1500) и „Funi“ (въжетата: сигурност > 16 при 2 / > 12 при 3+, D/d ≥ 40;
  компенсацията D/d ≥ 30; сцеплението (T1/T2)·C1·C2 ≤ e^(f·α) с кабина долу и 125 % товар и кабина горе
  празна; специфичният натиск ≤ (12,5 + 4v)/(1 + v)·0,981) — едно към едно, и с особеностите на файла:
  „a“ е минималното C1 на EN 81-1 (1,10…1,25 по скоростта), взето като забавяне (C1 ≈ 1,25–1,29);
  кабелите влизат в T'1 в kg без × g; при полукръгъл канал без подрез и „solo verifica“ f = 0. Имената са
  от листа „Funi“ (собственикът, 4 ноември 2026): T1/T'1 — страната на кабината, T2/T'2 — на
  противотежестта, при кабина горе отношението е T'2 / T'1 (числото е същото като преди); скоростта след
  промяната — с 2 знака; мярката на компенсацията на ръка е „Diametro fune o catena (mm)“. Въжетата —
  таблиците TELCAL и DONATI от файла (въже без данни не е в списъка; другото — `altro`, на ръка), не по
  номер на ред (във файла DONATI има два реда „8“ и VLOOKUP взима 12 mm вместо 11). Unit тестът
  (`tests/argano-rt.json`) пази пет случая, сметнати в самия Excel (LibreOffice, без макросите): 1:1, 1:2,
  1:4, две скорости и VVVF, клиновиден и полукръгли канали, вериги и въжета за компенсация, машина горе
  и долу — до 9 знака. Първото отваряне се попълва от „Modulo rilievi dati argani“ (`da-scheda.ts` —
  огледаното аргано: товар, маси, скорост, ход, окачване, ролка, ъгли, въжета, „1:50“/„2:53“, мотор,
  полюси); после — записаното. Записът е в `CalcoloArgano` (едно на карта, `dati` JSON, четен с недоверие;
  миграция `20261031100000_calcolo_argano`, само добавя) върху отворената версия (`base`; празно — още
  няма), с одит `ARGANO_CALCOLO`; не мести версията на картата. Чете всеки, който вижда картата (формата
  — заключена); пише, който пише карти в нейната фирма, не в кошчето; чужда — 404. Резултатите се
  смятат при всяко показване; редовете са едни и същи на страницата и в PDF-а (`righe.ts`).
  **Въжетата и компенсацията** (собственикът, 2 ноември 2026 — „manca la cordatura, classe e formazione …
  migliorare anche nella funzione di scelta“; „funi e catene … una scelta manuale“): изборът на въжето е
  по производител (`optgroup` TELCAL / DONATI), надписът — диаметър и формация („Ø 10 mm · 6×19 + FC“), а
  под него карта с данните на избраното от таблиците на файла (формация, нишки, клас 1370/1770, сечение,
  разрушително усилие, линейна маса — `fune.ts`; възможността ги носи като `data-*`, `public/js/argano.js`
  сменя картата на живо, без JavaScript — каквото е дошло от сървъра). „Cordatura“ — избор за всяко въже
  по EN 12385-2 (crociata destra sZ / sinistra zS, parallela (Lang) destra zZ / sinistra sS); таблиците на
  файла я нямат, затова е по избор и празна не се пази. Въже на ръка (`altro`) — и нишки, формация (до 40
  знака) и клас („1570“ или „1370/1770“, `CLASSE`), по избор. Компенсация извън таблиците — „Altra misura
  (dati a mano)“ в мерките: мярка (3–40 mm) и линейна маса (0,05–20 kg/m) в `compAltro`; тежи точно като
  същата мярка от таблиците (тестът сравнява). Полетата на ръка се виждат само при „altro“ (`data-solo`,
  argano.js; без JavaScript — винаги). Резултатите и PDF-ът показват производителя, формацията, нишките,
  класа, cordatura и сечението („—“ за непопълненото на ръка). Новото в `dati` е по избор и липсва, когато
  е празно — записаното преди него се чете и смята както е.
  **Страницата в менюто и изчислението без карта** (собственикът, 31 октомври 2026 — „cercare il numero di
  matricola o la via e precompilare il calcolo se ho già la scheda impianto“; избра „calcolo libero“):
  „Rilievi“ → „Calcolo argano“ (`/calcolo-argano`, `routes/calcolo-argano-elenco.ts`) — търсене по
  матрикула, номер или улица: картите (търсачката на „Schede“; всяка води към изчислението си, попълнено
  от картата, с „Calcolo salvato il …“ или „Nessun calcolo“; хидравличната — без връзка) и изчисленията
  без карта; една карта и нищо друго — направо изчислението ѝ (303). Без търсене — записаните
  изчисления (на карта и без), най-новите отгоре, с филтъра по фирма. Ненамереното предлага ново
  изчисление без карта с написаното (`?da=` — само цифри = матрикула, иначе адрес). Изчислението без
  карта (`routes/calcolo-argano-libero.ts`: `/calcolo-argano/nuovo`, POST `/calcolo-argano`,
  `/calcolo-argano/:id`, `/pdf`, `/elimina`) носи адреса (задължителен), матрикулата и номера (само
  цифри) и фирмата — избрана при новото между тези, в които човекът пише карти; чете, който вижда
  картите ѝ; пише, който ги пише; трие окончателно (одит `ARGANO_CALCOLO_DELETE`), който трие карти
  (`schede:delete`); чуждо — 404. Страницата и PDF-ът са общи с изчислението на карта
  (`routes/calcolo-argano-vista.ts`). В базата (миграция `20261031120000_calcolo_argano_libero`, само
  добавя): `schedaId` по избор, `aziendaId` на всяко изчисление (досегашните — от картата си),
  `indirizzo`/`matricola`/`numeroImpianto`/`searchText` и `CalcoloArgano_impianto_check` — без карта
  не се пази без адрес.
- **Изчислението за ограничителя** (`src/limitatore/`, `routes/calcolo-limitatore*.ts`; собственикът, 5
  ноември 2026 — „таб calcolo limitatore … следвайки досегашната логика“, по своя
  „Limitatore_velocita_EN81-20-2020.xlsx“): като изчислението за аргано във всичко — бутон „Calcolo
  limitatore“ на картата (не при хидравлична: там картата няма раздела „Limitatore“), страница
  `/schede/:id/calcolo-limitatore` и PDF `…/calcolo-limitatore.pdf`, „Rilievi“ → „Calcolo limitatore“
  (`/calcolo-limitatore` — търсенето и списъкът са общата страница `routes/calcolo-elenco.ts` +
  `views/argano/elenco.ejs` с `calcolo` на изчислението), изчисление без карта (`/nuovo`, `/:id`, `/pdf`,
  `/elimina`), същите права, `base`, одит `LIMITATORE_CALCOLO`/`LIMITATORE_CALCOLO_DELETE`, износ и
  изтриване на фирмата. Модел `CalcoloLimitatore` (миграция `20261105180000_calcolo_limitatore`, само
  добавя; `CalcoloLimitatore_impianto_check`). **Само скоростта и видът на парашута** (собственикът, 7
  ноември 2026 — „Il limitatore non si capisce. Troppi dati da inserire … far inserire la velocità
  dell'impianto e il tipo di paracadute, da lì estrarre il risultato senza troppe spiegazioni“; първата
  версия беше целият лист — 9 полета, 4 раздела, бележка под всеки ред и листът „Riferimenti“): две
  задължителни полета (Vn 0,01–20 m/s; Progressivo / Istantaneo / Istantaneo a rulli / Istantaneo con effetto
  ammortizzato) и резултатът —
  „Tarare V1 da 1,84 a 2,15 m/s“ (с 2 знака — по тях се настройва), „Limite di norma“ (точните прагове) и
  „Contatto elettrico“ (преди V1 / най-късно при V1); при моментален парашут над 0,63 m/s — само защо
  („serve il progressivo“). PDF-ът — същите редове, една страница (числото и „m/s“ не се делят:
  твърд интервал и U+2060 около „/“ — `inRiga`). **Нормата на уредбата** (собственикът, 7 ноември 2026 —
  UNI 10411-1:2024, т. 18 и 15.17, `../norme-ascensori/uni-10411-1-2024.md:365`, `:324`): трето задължително поле — EN 81-20:2020 · EN 81-1:1999/2008 · EN 81-1:1987
  (DM 587/87) · D.P.R. 1497/1963 · D.Lgt. 600/1945 (в менюто кратките имена — събират се на 320 px; в
  резултата и PDF-а — цялото, `limitatore.nomeNorma`). Стойностите — само от бележките на
  Асансьорчика в частното репо `norme-ascensori` (в този публичен репо: само точка, стойност и
  `../norme-ascensori/<файл>.md:<ред>`, никога текст или парафраза — правилото на онова репо): при трите
  EN 81 праговете на прогресивния, моменталния и този с ролки са едни и същи (EN 81-20:2020 5.6.2.1.2.1,
  5.6.2.2.1.1 a); EN 81-1:2008 9.8.2.1, 9.9.1; EN 81-1:1987 B 9.8.2.1, B 9.9.1); само EN 81-1 има и
  „Istantaneo con effetto ammortizzato“ (Vn ≤ 1 m/s, V1 < 1,5 m/s; при EN 81-20:2020 — „non prevede“).
  **„Cosa si modifica“** (собственикът, 7 ноември 2026 — „провери за sostituzione всички файлове с
  нормативи“): четвърто задължително поле, без предварителен избор — „Solo il limitatore“ · „Limitatore e
  paracadute“ · „Vn aumentata oltre il 5 %“. Уредба отпреди CE (UNI 10411-1:2024): само ограничителят —
  нормата при монтажа (т. 18, `uni-10411-1-2024.md:365`); и парашутът — UNI EN 81-20:2020 по аналогия с т. 6.7
  (`:105`, раздел 6 — `:78`; приложимостта я преценява техникът — листът го казва; одитът от 12 ноември 2026);
  Vn нагоре над 5 % — UNI EN 81-20:2020 (т. 15.1 и 15.13, `:298`, `:317`); Vn надолу над 5 % — пак нормата
  при монтажа (т. 15.17, `:324`), затова отделен избор няма. CE уредба (UNI 10411-11:2024): границите на
  оригинала при трите (т. 18 за ограничителя и за ограничител с парашут, т. 15 f) — `uni-10411-11-2024.md:288`,
  `:252`; т. 6.7, `:117`, е в раздел 6 и не се цитира). Контактът на нов
  ограничител — винаги по UNI EN 81-20:2020, 5.6.2.2.1.6 a) (т. 18; = EN 81-1:1999/2008, 9.9.11.1): преди V1
  при Vn > 1, иначе най-късно при V1 — и при EN 81-1:1987 (правилото B 9.9.11.1 за VVVF не важи за нов
  ограничител) и при D.P.R. 1497/1963. Резултатът и PDF-ът казват по коя норма и точка са границите
  („Limiti secondo“, `limitatore.riferimento`); означенията на нормите не се делят на два реда (твърд
  интервал след „UNI“/„EN“, U+2060 след тирето между цифри). Хидравличните уредби остават извън
  изчислението (решението от октомври — картата им няма „Limitatore“); точките им за смяната са в
  `uni-10411-2-2024.md` и `uni-10411-12-2024.md`. **D.P.R. 1497/1963** (собственикът, 9 ноември 2026 —
  квадерното на ANACAM, 2017, научено от Асансьорчика: `../norme-ascensori/anacam-quaderno-dpr1497-en8120-parte1.md`;
  преди него — „+40 %“ на собственика само за 0,6–1,5 m/s): art. 32.2 — V ≤ 0,60 m/s: V1 < 0,85 m/s (изключен,
  „sotto 0,85 m/s“); до 1,50 m/s — +40 %, до 2,50 — +33 %, над — +25 % (включен, „fino a … m/s (140 % della
  velocità di esercizio, incluso)“, с 2 знака `ROUNDDOWN`; `:258`–`:261`); долен праг няма (`:262`); art. 32.3
  — над 0,85 m/s моменталният парашут (и с ролки, и с амортизиран ефект) не е допустим, „serve il
  progressivo“ (`:238`), а при моментален над 0,50 m/s — ред „Attenzione“ за montalettighe кат. A (картата не
  знае категорията); V е скоростта на експлоатация (art. 3, `:245`) — затова текстът на прага я назовава.
  Стойностите са сверени и по образа на стр. 22–23; D.M. 587/1987 в същото квадерно (стр. 26, 29) дава
  стойностите на EN 81-1, които изчислението вече има. Сравнението с UNI 10411-1:2024 (по думите на
  собственика „in alcuni casi va in contrasto“) прави той. За D.Lgt. 600/1945 стойности няма — изчисление няма, страницата го казва. 0,63 m/s е
  границата на **номиналната** скорост за моментален парашут, 0,80 m/s — на **V1** (въпросът на
  собственика от 6 ноември; затова съобщението казва „velocità nominale“). Формулите са клетките B5, B6, B9, B10
  и B13 на листа „Limitatore“ една към една (`limitatore/calcolo.ts`): долният праг 115 % от Vn
  (включен), горният (изключен) — 0,80 моментален, 1 с ролки, 1,5 прогресивен при Vn ≤ 1 и **1,25·v +
  0,25/v** прогресивен при Vn > 1 (UNI EN 81-20:2020, 5.6.2.2.1.1 a) 4) — собственикът го провери по
  нормата, 6 ноември 2026), моментален и с ролки само до 0,63 m/s; с 2 знака — `ROUNDUP(ROUND(x;10);2)`
  и `ROUND(ROUNDUP(ROUND(x;10);2)−0,01;2)`, с 15 значещи цифри като електронната таблица. Записаното е
  `{vn, tipo, norma, intervento}` (запис без норма е от времето само с EN 81-20:2020, без `intervento` — от
  времето само с т. 18, и се четат така). Първото отваряне от картата: Vn — от „Modulo rilievi dati
  argani“; видът, нормата и смяната се избират (картата няма годината на монтажа). Проверката: unit — 16-те случая на праговете от листа „Test“, клетките
  B5/B6/B9/B10/B13 на 28 случая, преизчислени в самия файл (LibreOffice, без макроси;
  `tests/limitatore-excel.json` пази всички клетки B5–B27), формулата 1,25·v + 0,25/v на 900 стойности;
  нормите и смяната — `tests/limitatore-norme.test.ts` (5 норми × 3 смени); PDF-ът; integration и e2e —
  като при аргано. Самият Excel не е в репото („USO INTERNO …
  Non pubblicare“).
- **Менюто** (`src/http/menu.ts` — ЕДИНСТВЕНИЯТ списък, `menuPer(can, nuoveRichieste)`; `views/partials/header.ejs`,
  `public/css/sidenav.css` + `navigazione.css`, `public/js/menu.js`; собственикът, 10 ноември 2026 — проучването на
  менюто, варианти A+B+C: NN/g „Hamburger Menus and Hidden Navigation Hurt UX Metrics“ (2016), „Menu-Design
  Checklist“ (2024), Android и Apple HIG за лентата долу): групи Impianti · Calcoli · Documenti · Amministrazione (на
  фирмата: Utenti, Impostazioni, Registro, Cestino) · Master (нашето — Console, Aziende, Richieste, Contratti,
  Comunicazioni, Verifica documenti; само за собственика на портала), само точките, които човекът може; текуща е
  най-дългата пасваща точка. В групите НЯМА „нова …“ — всичко за създаване е в един „Nuovo“ над тях (`<details>`, и
  без JavaScript; `/nuovo` — същото като страница с карти). Над него — търсенето (по-долу). От 1100 px лентата стои
  вляво; 768–1099 px — колона с иконите на главното (88 px, `nav.rapida`) и „Menu“, което отваря цялата лента; до
  767 px — лента долу (до четири места: Schede, Interventi, Nuovo, Cerca — по правата — и „Menu“), която отстъпва
  на страниците с черната лента „Salva“ (`body:has(.actions)` — тогава горе е ☰). Отворената лента: останалото е
  `inert`, Esc и фонът я затварят, фокусът се връща на отворилия. Без JavaScript лентата е над съдържанието, отворена.
  `--chrome-top` е височината на горната лента (0 от 1100 px). Unit тестът (`tests/menu.test.ts`) пази групите по
  роля, че в групите няма връзки за създаване, лентата долу и текущата точка.
- **Търсенето** (`src/cerca/service.ts`, `routes/navigazione.ts`, `public/js/cerca.js`; собственикът, 10 ноември
  2026): `/cerca?q=` — уредбите (търсачката на „Schede“: матрикула, номер, адрес), изчисленията без карта (аргано и
  ограничител), фирмите (само MASTER) и страниците/действията на менюто — всеки вид в обхвата на своята способност,
  до 8 от вид (`PER_GRUPPO`) с връзка към всички. Ctrl K / ⌘ K или полето в лентата отварят палитрата (`<dialog>`;
  частта идва с `X-Partial: 1`, стрелките и Enter); без JavaScript полето е обикновена форма към `/cerca`.
- **Настройките на малки страници** (`routes/impostazioni.ts` + `impostazioni-vista.ts`; собственикът, 10 ноември
  2026 — „Riordina anche /impostazioni e fai piccole directory dentro per le cose separate“): `/impostazioni` —
  карти на разделите със състоянието им; `/impostazioni/<раздел>` (`azienda`, `scheda`, `cartelli`, `ruoli`,
  `condizioni` — `SEZIONI_IMPOSTAZIONI`) със своята навигация; записите (`/impostazioni/dati`, `/cartello`, `/ruoli`,
  `/sezioni`) връщат на своя раздел (`pathSezione`). „Condizioni di servizio“: версията, кой и кога е подписал,
  колко души са приели правилата, копието.
- **Конзолата на MASTER** (`src/master/`, `routes/master*.ts`, `views/master/`; собственикът, 10 ноември 2026 —
  „Espandi le funzioni di master con tutto quello che ti viene in mente … Super High Enterprise Premium“). Само
  `aziende:manage`. `/master` — числата на портала, дейността по седмици от одита (12 седмици, SVG без цвят —
  `panoramica.ts`, `SERIE`), най-активните фирми за 30 дни, здравето на системата като светлини (`sistema.ts`:
  build, процесът, отговорът и размерът на базата, последната миграция, свободното място за снимките спрямо
  `MEDIA_MIN_FREE_MB`, опашката — работникът е в свой контейнер и се познава по най-стария чакащ файл, пощата;
  само числа — без пътища, адреси и тайни), последните изтеглени изчисления с проверката на печата и последните
  действия без входовете. `/master/contratti` (`contratti.ts`) — договорът на всяка фирма: `firmate` (ред в
  регистъра за текущата версия), `esistente` (приета от миграцията без подпис), `attesa`; печатът на подписа,
  копието, правилата; „Richiedi la firma“ — само при `esistente`: `condizioniVersione = NULL` в една транзакция с
  одита `CONDIZIONI_RICHIESTE` (ADMIN-ът подписва наистина при следващата заявка). **Подписва се
  `versioneDaFirmare`** (`legale/versioni.ts`; собственикът, 13 ноември 2026 — „se chiedo di firmare non succede
  niente“: 4.1 отказваше до деня на версията): действащата, а в навечерието на версия, която влиза сама
  (`SENZA_PREAVVISO`) — тя, веднъж; страницата за приемане, кодът, клаузите и регистърът са за нея, текстът се
  чете на `/condizioni/prossima` (`percorsoDaFirmare`), а PDF-ът за запазване там е на СЪЩАТА версия
  (`/condizioni/prossima.pdf`, `noindex`; `/condizioni.pdf` остава действащата). Обявена версия (чл. 18.1) не се
  подписва предварително. Код, който не е тръгнал по имейл, не е чакащ подпис и не брои в тавана на час — и при
  „Invia un nuovo codice“ (пада само ТОЗИ опит — по id; човекът се връща на първата стъпка;
  `tests/integration/firma-posta.test.ts`). `/master/verifica`
  (`verifica.ts`) — по кода от листа (Rif. от 12 знака — `EmissioneCalcolo.impronta`; 64 знака — SHA-256 на PDF,
  копието на условията или отпечатъкът на лист за интервенция/протокол) или по самия PDF (до 25 MB, в паметта, не
  се пази — SHA-256 срещу `pdfHash`/`copiaHash`); всяко намерено — с проверката на печата си; одит
  `PROVA_VERIFICA` само с начина и броя, никога кода. `/master/comunicazioni` (`comunicazioni.ts`, модели
  `Comunicazione` + `ComunicazioneChiusa`, миграция `20261111090000_comunicazioni`, само добавя; CHECK за прозореца
  и празния текст) — съобщение до всички или избрани активни фирми, от ден до ден по Рим (`tempo.ts`,
  `mezzanotteRoma`: от полунощ на първия до полунощ след последния, до година), вид INFO/AVVISO/URGENTE, по избор
  писмо до всеки ADMIN поотделно (в базата — само броят на тръгналите); спиране по всяко време; одит без текста.
  Лентите (`master/banner.ts`, `views/partials/comunicazioni.ejs`, `avvisi.css`, `public/js/comunicazioni.js`): на
  вписан човек от фирма-получател, на цяла страница, след паролата и условията, до 3 наведнъж (спешните първи);
  „Chiudi“ — за себе си (`POST /comunicazioni/:id/chiudi`, 204 във фонов режим, без JavaScript — обратно на
  страницата); MASTER не ги вижда над страниците. Текстът — само текст (`white-space: pre-line`, без HTML).
- **Анотациите върху снимка** (`src/allegati/annotazioni.ts`, `routes/allegati-annotazioni.ts`,
  `public/js/annotazioni.js`; собственикът, 12 ноември 2026 — точка C5): „Annota“ на готова снимка във формата на
  картата отваря редактора на скицника на цял екран със снимката под листа (същите инструменти и проверки —
  `foglioDa`, таваните на скицника). Листът е 1400 × 1000, снимката — цяла и в средата (`rettangoloFoto`; в
  редактора — `sfondo` в `schizzo-tratti.js`, без мрежата), затова едни и същи числа дават наслагването: плочката на
  галерията — изрязаното 4:3 в средата (`finestraRiquadro`, SVG над снимката), печатът — SVG със снимката и
  анотациите, PDF-ът — `drawAnnotazioni` (pdf-schizzi.ts) в кутията на снимката. Записва се отделно от формата
  (`fetch` — написаното в картата остава, формата не става „променена“): POST `/schede/:id/allegati/:aid/
annotazioni`, само който пише във фирмата, само на готова снимка на карта извън кошчето; неверен лист — 422,
  празен — маха ги. `Allegato.annotazioni` (JSON `{e: [...]}`, CHECK — само на снимка), одит `ALLEGATO_ANNOTAZIONI`
  само с броя; в износа (`allegati[].annotazioni`). Бутонът е в галерията за пишещите, видим само където е
  редакторът (`html.annota`). Миграция `20261113100000_annotazioni_foto` (само добавя).
- **Страницата на състоянието `/stato`** (`src/stato/`, `routes/stato.ts`; условията 2026-11-12, чл. 2.4 — точка D3):
  публична, `noindex` (robots я пуска, за да се види), връзка в долните ленти на витрината и портала. Общото
  (`statoGenerale`: прекъсване в ход или червена проверка — „interruzione“; поддръжка в ход; жълто — „parziale“),
  частите сега само с думи (порталът, базата, опашката на снимките, пощата — `componenti`, помнени 30 s; никакви
  числа, пътища и имена отвътре), прекъсванията и поддръжката в ход, планираната, историята от 90 дни и целите —
  RPO 24 ч (ежедневното копие) и RTO `RTO_ORE` (8 ч; организационни, не гарантирани — чл. 8). Съобщенията пише само
  MASTER в `/master/stato` (модел `AvvisoStato`: прекъсване — краят празен, докато трае; поддръжка — с край; CHECK;
  не се трият; часовете по Рим; одит `STATO_AVVISO` без текста). Миграция `20261113110000_avvisi_stato`.
- **CSV и API само за четене** (точка D2). CSV (`src/http/csv.ts`, `routes/esporta-csv.ts`): „Scarica in Excel (CSV)“
  на списъка на картите и на офертите — същото, което човекът вижда (обхват, фирма, търсене), до 10 000 реда; точка
  и запетая, всяка клетка в кавички, CRLF, BOM; клетка, която започва като формула (`= + - @`, таб, CR), получава
  апостроф (CSV injection). API (`src/api/chiavi.ts`, `routes/api.ts`, раздел „Chiavi API“ на настройките —
  `routes/impostazioni-api.ts`, ADMIN): ключ `rk_<префикс 12>_<тайна 32 байта>`, показан веднъж; в базата —
  префиксът и HMAC (`hmacChiaveApi`, HKDF етикет `api-key-v1`), сверка в постоянно време (и без ред — фиктивен
  отпечатък); изтича след година, отменя се, до 10 живи на фирма (`ChiaveApi`, CHECK; одит `API_CHIAVE_*` без
  ключа; не влиза в износа — B.7). `GET /api/v1/schede?q=&p=` (100 на страница, търсенето на портала) и
  `/api/v1/schede/:id` (полетата от fields.ts; Decimal — текст) — само картите на фирмата на ключа, без кошчето;
  без бисквитки и CORS, `no-store`, 600 заявки в час на ключ (`apiLimiter`), грешен ключ — 401 + `WWW-Authenticate`.
  Монтиран най-напред (`montaggio.ts`). Миграция `20261113120000_chiavi_api`.
- **Абонаментът на фирмата** (#31, #33 — собственикът, 12 ноември 2026: „При регистрация на нова фирма тя получава
  автоматично 1 месец пробен период безплатно“, „При изтичане на Premium цялата Azienda може само и единствено да
  чете“, нивата „1-10, 5-25, 25+“ — разбрани като до 10, до 25, над 25 души; условията 2026-11-12, чл. 12;
  `src/abbonamenti/`): `Azienda.abbonamentoLivello` (1/2/3), `abbonamentoFino` (полунощ по Рим; null — без срок:
  фирмите отпреди, докато MASTER реши — чл. 12.8), `abbonamentoProva`. Нова фирма (`insertAzienda`) — пробен месец;
  при ПЪРВОТО приемане на условията (сключването, чл. 3.1) краят се смята наново от този момент (`avviaProva` в
  `legale/accettazioni.ts`; страницата за приемане казва деня). Датите — `regole.ts` (`aggiungiMesi`,
  `scadenzaDopoMesi`: започнат посред деня период покрива и последния ден; удължаването — от досегашния край, ако е
  напред). **Изтекъл — само четене** (`MembershipView.solaLettura` от `memberships.ts`, `puoMembro` в `scope.ts`):
  остават `CAPACITA_IN_SOLA_LETTURA` — четенето, изтриването на данни (A.9), управлението на хората (деактивиране,
  чл. 4.1) — но не и поканите (`createInvite` → `solaLettura`); износът и смяната на доставчика — по роля; НЕ
  докато тече смяната на доставчика (чл. 12.7). Отказ по способност на изтекла фирма казва защо (`requireCapability`
  → „Abbonamento scaduto“). Таванът на хората по нивото (`persone.ts`): активните членове + живите покани (чл. 12.4),
  броени в транзакцията на поканата с реда на фирмата `FOR UPDATE`; пробата и „без срок“ — без таван; MASTER — без.
  Ленти над страниците (`avvisi.ts`): изтекъл; пробата/планът свършва до 14 дни (за ADMIN — връзката). Писма до
  администраторите 14 и 3 дни преди и в деня (`scadenze.ts`, поддръжката всеки час; `avvisoScadenzaPer/Soglia` —
  всяка граница веднъж за даден край). „Impostazioni → Abbonamento“ (`routes/impostazioni-abbonamento.ts`) — по роля
  ADMIN (изтеклата фирма вижда само него и износа). MASTER задава на ръка ниво и последен ден на страницата на фирмата
  (`routes/aziende-abbonamento.ts`, одит `AZIENDA_ABBONAMENTO`). Тестове: `tests/abbonamenti.test.ts`,
  `tests/integration/abbonamenti.test.ts`.
- **Пощата на портала от конзолата** (#32 — собственикът, 12 ноември 2026: „конфигурирам brevo сървъра за емайлите
  от Master Account“; `src/mail/posta.ts`, `posta-form.ts`, `prova.ts`, `routes/master-posta.ts`, `/master/posta`):
  сървър (в продукция само име на хост — никога IP или localhost), порт 587/2525/465, логин, ключ, подател (името —
  без `<>"` и нови редове). Ключът само се пише: в базата — AES-256-GCM (`cifraSmtp`, HKDF етикет `smtp-pass-v1`),
  никога в страницата, в одита и в лога; празно поле — остава записаният. `PostaPortale` — един ред (CHECK); докато
  е включен, е над `SMTP_*` от средата, иначе важи средата, иначе — без поща. Настройката е в паметта на процеса
  (`assicuraPosta` при първата заявка и първото писмо; при запис — веднага, транспортът се прави наново), затова
  `mailEnabled()` (вече от `mail/posta.ts`, не от config) остава синхронна; базата не отговаря — важи средата.
  Пробното писмо — до самия MASTER, `verify` + писмо. **Защо не е тръгнало** (`mail/diagnosi.ts`; собственикът, 13
  ноември 2026 — „le email non partono“: страницата казваше само `ETIMEDOUT`): от грешката на nodemailer — стъпката
  (`connessione`, `tls`, `accesso`, `mittente`, `destinatario`, `messaggio`, `altro`), кодовете и отговорът на SMTP
  сървъра; страницата показва последната проба и последното неуспешно истинско писмо с думи какво да се направи
  (`posta.esito.fase.*`) и отговора на сървъра. Отговорът с думи е САМО в паметта и на страницата на MASTER —
  никога в лога, одита или бисквитка (цитира адреси); в лога (`posta.fallita`) и одита — стъпката и кодовете.
  Всеки изход помни настройката (`versionePosta`) и сървъра, с които е пращано: след смяна на порта старата
  грешка не се показва като грешка на новия. Успешната проба брои като тръгнало писмо (`segnaInvio` — `/stato` и
  здравето светват веднага). ETIMEDOUT на
  587/465 = изходящите пощенски портове са спрени от доставчика на сървъра (netcup: политиката „netcup Mail
  block“ в SCP) — порт 2525 (DEPLOY.md, „Пощата не тръгва“). Одит `POSTA_IMPOSTATA` (порт, нов ли е ключът),
  `POSTA_DISATTIVATA`, `POSTA_PROVA` (изходът, стъпката, кодовете). Тест: `tests/posta.test.ts`,
  `tests/posta-diagnosi.test.ts` (истинските грешки на nodemailer срещу фалшив SMTP сървър — `tests/smtp-finto.ts`),
  `tests/integration/posta.test.ts`.
- **Плащанията с Revolut Business** (#31 — собственикът, 12 ноември 2026: „системата за плащания … да мога да
  конфигурирам напълно от настройките на мастър акаунта по най-лесния възможен начин, както и да включвам и
  изключвам плащанията“; избра Revolut Business — Revolut Pro няма Merchant API; условията 2026-11-12, чл. 12;
  `src/pagamenti/`, `routes/master-pagamenti.ts`, `routes/abbonamento-pagamento.ts`, `routes/webhook-revolut.ts`).
  **Конзолата** `/master/pagamenti` (`aziende:manage`): вкл./изкл., Sandbox/Produzione, ключът на Merchant API (само
  се пише; AES-256-GCM, HKDF етикет `revolut-v1`; празно — остава), „Registra il webhook“ (POST /api/webhooks →
  signing secret-ът шифрован), плановете `PianoAbbonamento` (ниво 1–3, 1–36 месеца, цена БЕЗ ДДС в цели центове,
  „1.290,50“ се чете; изключват се, не се трият), последните 50 плащания с „Verifica su Revolut“. Одит
  `PAGAMENTI_IMPOSTATI` (без ключа), `PIANO_*`, `PAGAMENTO_*`. Една таблица `ConfigPagamenti` (id `revolut`, CHECK:
  включени ⇒ ключ). **Фирмата**: „Impostazioni → Abbonamento“ показва плановете само на ADMIN на фирмата, при
  включени плащания и фирма със срок (`abbonamentoFino`; „без срок“ не купува — чл. 12.8); план под заетите места
  (`personeOccupate`) не се предлага. Офертата (`/impostazioni/abbonamento/offerta`, `offerta.ts` — текстът от
  `locales/it/pagamenti.json`, Правният Разбирач, не е правен съвет): доставчикът, клиентът (данните на фирмата —
  поправими), планът, срокът от–до (започва от края на пробата/плана — `scadenzaDopoMesi`), цената, ДДС (`importi.ts`:
  БГ ДДС-номер — 20 %, иначе обратно начисляване чл. 196 Дир. 2006/112; само ЕС ДДС-номер — `partitaIvaDa`), без
  подновяване, само четенето, връщането (12.9), фактурата до `GIORNI_FATTURA` (5) дни, „Revolut, ние не виждаме
  картата“. Отметката — никога отметната; „Accetta e paga {totale} €“. **Записът преди Revolut**: `Pagamento`
  (IN_ATTESA, сумите — от плана, никога от формата) + `AccettazioneOfferta` (текстът, SHA-256, IP, браузър, печат HMAC
  `sigilloDi` по `CAMPI_OFFERTA` — като регистъра на приеманията, без връзки — надживява фирмата) в една транзакция;
  после POST /api/orders (сума, EUR, `merchant_order_data.reference` = нашият id, `redirect_url` — страницата за
  връщане, `expire_pending_after` PT1H); `checkout_url` се приема само от произхода на Revolut (`originiCheckout`),
  който е и във `form-action` на CSP. **Периодът се дава САМО** за поръчка, прочетена обратно от Revolut като
  `completed` със същата сума, валута и id (`riconcilia.ts`) — от връщането (`/esito/:id`, `ritornoLimiter`), от
  webhook-а или от поддръжката; веднъж (`applica`: редът на плащането, после на фирмата `FOR UPDATE`, само от
  IN_ATTESA), одит `AZIENDA_ABBONAMENTO` с `origine: revolut`, писмо с копието на офертата (след отговора).
  **Периодът** (`pagamenti/periodo.ts`, чл. 12.3–12.4; ревюто на Продавача и Кодаджията, 12 ноември 2026): по
  време на пробата или на платен план купеният чака края им — `Azienda.abbonamentoCambioAt/Livello` (CHECK): до
  тогава пробата пази хората си и платеното ниво остава (`abbonamentoAdesso`, `statoAbbonamento.poi`; поддръжката
  ги подрежда — `avviaPianiInCoda`); изтекла фирма — веднага; по-високо ниво при платен план — веднага, а
  платените и неизползвани дни на веригата от плащания до края (`situazioneDi`, всяко започва където свършва
  предишното) стават дни на новото ниво със същата стойност (`creditoCent`, редът „Giorni già pagati“ в офертата);
  период, даден на ръка — не се смята онлайн (`manuale`, „scrivi a …“); един план в опашка наведнъж: същото или
  по-ниско ниво чака началото му (`inCoda`), по-високо го ЗАМЕСТВА (3.1) — в пробата пак от края ѝ, цялата стойност
  на плана в опашка става дни; при платен план — веднага. Кредитът се смята от полунощ по Рим на днешния ден
  (офертата и отпечатъкът ѝ са едни през целия ден) и помни от кои плащания идва (`Pagamento.creditoDa`). Таванът
  на хората на купен план важи от покупката (`statoAbbonamento.maxPersone` — по-ниското от сега и от опашката).
  Периодът е този от офертата (`Pagamento.inizio/fine`), освен ако абонаментът е сменен междувременно
  (`baseFino`/`baseLivello`/`baseCambioAt`) — тогава се смята наново (`pagamenti/applica.ts`). **Платено, което не
  може да стане период** (фирма без срок, спряна или изтрита; несмятаем период; поръчка, която Revolut не чете 30
  дни) НЕ дава нищо само и НЕ изчезва: `DA_VERIFICARE` с `verificaMotivo`, одит `PAGAMENTO_DA_VERIFICARE`, писмо до
  всеки MASTER и до платилия („non devi pagare di nuovo“), раздел „Pagamenti da verificare“ в конзолата.
  **Една отворена поръчка на фирма** (`avviaPagamento`: първо сверка на отворените от последния час, после под
  `FOR UPDATE` на фирмата): същата оферта → същата поръчка; друга → 409 с „Continua il pagamento aperto“.
  **Счетоводството в конзолата** (`routes/master-pagamenti-registro.ts`, `pagamenti/rimborsi.ts`,
  `pagamenti/avvisi.ts`): всяко завършено плащане — писмо до всеки MASTER с данните за фактурата и раздел „Da
  fatturare“ до отметката `fatturataAt`; CSV на плащанията; „Rimborsi dovuti“ — платеното и неизползвано време на
  спряна или изтрита фирма по чл. 12.9 (цели дни, с ДДС ако е начислен; превърнатото в кредит плащане не се брои
  втори път — `convertiti`), писмо до MASTER при спирането; MASTER отбелязва върнатото (`RIMBORSATO`,
  `rimborsoCent`) — самото връщане и кредитното известие са извън портала. Италианският P. IVA — с контролната
  цифра (`partitaIvaItValida`). Ръчното задаване от MASTER върху платен план или със срок под 30 дни — само с
  изрично потвърждение (`confermo`; `impostaAbbonamento` → `pagato`/`preavviso`).
  **Запечатва се само видяната оферта**: скритото `hash` — друг (сменени данни, ДДС, ден) → 409 с новата оферта,
  нищо не тръгва; второ „Accetta e paga“ на същата оферта до 50 мин. → същата поръчка (`offertaHash`).
  **Sandbox на живия сървър** (`daPeriodo`) — проба: завършва, период не дава (тестова карта ≠ Premium), страницата
  на офертата го казва. **Конзолата**: нов ключ или друга среда — само с паролата (`reauthPassword`) и писмо до
  всеки MASTER; преди нов webhook старият се маха (`DELETE /api/webhooks/{id}`, Revolut пази до 10). Ръчното
  задаване от MASTER — с `base` (краят, който е видял; друг → нищо не се пише) и маха плана в опашка.
  **Webhook-ът** `/webhook/revolut` е монтиран в server.ts ПРЕДИ парсерите и сесията (суровото тяло, до 64 KB,
  `webhookLimiter` 120/мин.): `Revolut-Signature` `v1=` HMAC-SHA256 над `v1.{timestamp}.{тяло}`, допуск 5 мин.,
  сравнение в постоянно време (`firma.ts`); грешен — 401 и нищо; верен — сверката (известието само казва „питай“).
  Поддръжката (всеки час): висящите от последните 7 дни — сверка; по-старите — SCADUTO само ако Revolut отговори
  „pending“ (непрочетена поръчка — друг ключ, срив — остава „In attesa“ за проверка на ръка).
  Задържане: `AccettazioneOfferta` и плащането ѝ — като приеманията (докато фирмата я има и 10 години след
  изтриването ѝ — `eliminaAzienda` мести `conservaFino`, `pulisciProve` трие двете заедно). Фактурата се издава
  извън портала. Настройката — DEPLOY.md, „Плащанията с Revolut Business“. Тестове: `tests/pagamenti.test.ts`
  (подписът, ДДС, цената, офертата), `tests/pagamenti-periodo.test.ts` (периодът, опашката, кредитът),
  `tests/pagamenti-rimborsi.test.ts`, `tests/integration/pagamenti*.test.ts` с фалшив Revolut (`revolut-finto.ts`
  — по официалния OpenAPI 2026-08-17; `pagamenti-verifica.test.ts` — двете поръчки, замяната на плана в опашка,
  връщане + webhook заедно, „da verificare“, фактурирането, връщанията).
- **Версия 4.0 — ДДС, връщания, спорове** (собственикът, 12 ноември 2026: „Оправи точка 2 … точка 7 чрез
  револют“; условията 2026-11-13, чл. 12.9–12.10; Данъчника — не е данъчен съвет):
  - **VIES** (`pagamenti/vies.ts`, `vies-ordine.ts`): регистрацията по ЗДДС е по избор (чл. 100, ал. 1) — ставките
    остават (20 % за български номер; обратно начисляване за друга държава от ЕС). При приемане на офертата
    номерът на фирма извън България се проверява във VIES (официалният REST договор `swagger_publicVAT.yaml`:
    `POST /check-vat-number` с нашия номер като заявител; грешките идват и с HTTP 200). Невалиден или VIES не
    отговаря → нищо не се записва и нищо не тръгва към Revolut (`vies.errore.*`); валиден → `Pagamento.vies*`
    (номерът на консултацията, часът, името и адресът от VIES), в CSV-то и на реда „Da fatturare“. Същата оферта,
    приета втори път, не пита пак. `VIES_API_BASE` — само за тестовете и разработката (фалшивият VIES).
  - **Връщане през Revolut** (`rimborso-revolut.ts`, `rimborsi-riparto.ts`, `rimborsi-riconcilia.ts`,
    `routes/master-pagamenti-rimborsi.ts`, `views/master/rimborso.ejs`): страницата на връщането
    (`/master/pagamenti/:id/rimborso`) показва дължимото, колко най-много може да отиде през Revolut и върху кои
    поръчки; нареждането — само с паролата. `POST /api/orders/{id}/refund`; сумата отива върху поръчката на
    плащането, остатъкът (надграждане с кредит) — върху поръчките от `creditoDa`; над платеното — отказ, нищо не
    тръгва. Всяка част е ред `Rimborso`, чийто id е Idempotency-Key. Плащането става `RIMBORSATO` едва когато
    поръчката за връщане се прочете `completed` (веднага, от webhook-а или от поддръжката); `rimborsoCent` е
    върнатото върху поръчката на ТОВА плащане (кредитното известие следва фактурата). Изгубен отговор —
    „Riprova“ със същия ключ или известието, познато по нашия id в `reference`; отказ — `FALLITO` с кода, нищо
    не се променя, писмо и аларма. Ръчното отбелязване остава (върнато с превод).
  - **Спорове** (`contestazioni.ts`, модел `Contestazione`): `DISPUTE_*` носи само `dispute_id` → `GET
/api/disputes/{id}` (само в продукция на Revolut) → ред, вързан с плащането по поръчката; раздел
    „Contestazioni“ със срока за отговор, писмо до MASTER, аларма. Порталът не решава нищо сам (изгубен спор не
    пипа плащането и абонамента). Webhook-ът се регистрира и за споровете; при отказ от Revolut (400/422) — само
    за поръчките, и го казва. **След деплой на 4.0: „Registra il webhook“ наново** (старият е без споровете).
- **Алармите в Discord** (`src/allarmi/`, `routes/master-allarmi.ts`; собственикът, 12 ноември 2026): MASTER →
  „Allarmi“ — адресът на webhook-а (само discord.com; шифрован, HKDF етикет `discord-webhook-v1`; само се пише),
  вкл./изкл., пробно съобщение; всяка промяна — с паролата; одит без адреса. `allarme(вид, брой)` не се чака и не
  хвърля; видовете — `TIPI_ALLARME` (паднала стъпка на поддръжката, плащане за проверка, спор, неуспешно връщане,
  поща, нов сигнал), текстовете — `locales/it/allarmi.json`: САМО вид, брой и връзка — никога име, имейл, фирма
  (затова Discord не е получател на лични данни; влезе ли такова поле — ред в политиката и DPA). Пауза на вид
  (`PAUSA_MS`). Сървърните скриптове пращат към същия вид адрес през `deploy/alert.sh` (`RILIEVI_ALERT_URL`).
- **Публичните `/prezzi` и `/segnalazioni`** (собственикът, 12 ноември 2026 — „Направи публична страница, назначи
  мен като член за модерирането“; условията 2026-11-13, чл. 25; текстовете — Правният Разбирач, не е правен съвет):
  - `/prezzi` (`routes/site-prezzi.ts`): активните планове от конзолата, без ДДС, само докато плащанията са
    включени в среда, която дава период; цена не се измисля. Пълният SEO набор, FAQPage и `Offer` на план
    (`seo/structured-pagine.ts`); в sitemap, robots, llms.txt и долната лента.
  - `/segnalazioni` (`routes/segnalazioni.ts`, `segnalazioni/form.ts`): формулярът по чл. 16 от Рег. (ЕС)
    2022/2065 — къде, защо, име и имейл (по избор само при отметката за чл. 16(2)(c)), добросъвестност; двойна
    бисквитка, капан, 10/ч. на мрежа, 200 на денонощие. Потвърждението по имейл носи само номера (адресът не е
    проверен — чужд текст не се праща на трети лица). Точката за контакт (чл. 11–12): `CONTACT_EMAIL`, it/bg/en.
  - Модерирането (`routes/master-segnalazioni.ts`): отговорникът е РОЛЯ — MASTER, без име („il responsabile della
    moderazione di Carbon Stealth VCC“). Решение веднъж, с мотиви до подателя (чл. 16(5)); при премахване или
    ограничаване — фирмата, мярката, фактите и основанието (чл. 17(3), CHECK в базата) и писмо до нейните
    администратори без самоличността на подателя; самото премахване MASTER прави в портала. Преглед (чл. 25.7)
    и уведомяване на органите (чл. 18) се записват. Пазене: 5 години от решението или прегледа, 1 година за
    неразгледаем сигнал (избор, не закон) — трие поддръжката; нерешен сигнал няма срок. Одит без текста.
- **Условията 2026-11-13** — в сила от своя ден без обява (`SENZA_PREAVVISO`; собственикът: „Веднага“): 12.9
  (връщането върху същото платежно средство; спорът), 12.10 (VIES), 15.2, нов чл. 25 (сигнали и модериране).
  Чл. 24 и `clausoleSpecifiche` не са променени. Политиката: ред за сигналите, VIES като получател; регистърът
  по чл. 30(1) — C5 (VIES, спорове) и новият C8.
- **Версия 4.1 — без VIES, кредитни известия, условията 2026-11-14** (собственикът, 12 ноември 2026: „Направи
  алтернативата за без VIES. Кредитно известие при връщане и спор. … Довърши и това с Юридта … Направи външен монитор
  за /health. Сегашните фирми ги остави активни без подпис докато не оправим Brevo“; Данъчника и Правният Разбирач
  — не е данъчен, нито правен съвет):
  - **Номер извън VIES → 20 % български ДДС** (режим `iva-bg-ue`, `REGIMI` в `importi.ts`; условията, чл. 12.10 b):
    VIES не потвърждава номера → първото „Accetta e paga“ НЕ продава, а връща офертата с ДДС, сбора и причината
    (`vies.cambiata`, 409, нов отпечатък) — нищо не се записва; приета, ТАЗИ оферта отваря поръчката за сумата с
    ДДС, а при плащането остава моментът (и номерът на консултацията, ако VIES го даде) на отговора „невалиден“.
    Само под прага от 10 000 € без ДДС за календарната година (чл. 59в Дир. 2006/112, `soglia.ts`): порталът брои
    своите такива продажби и добавя въведените от MASTER продажби извън него — за текущата и за предходната година
    (`ConfigPagamenti.altreVenditeUeCent`/`…PrecCent`/`…Anno`, `altreVendite()`: след Нова година числото за „тази
    година“ само става „миналата“; прагът е на цялата фирма); над прага — отказ (`vies.errore.soglia`) и аларма
    `sogliaIva` (и от 80 %). Проверката се повтаря в транзакцията на поръчката под `pg_advisory_xact_lock` — две
    фирми едновременно не го прескачат заедно. Офертата цитира версията на условията на договора на фирмата
    (`versioneContratto`: приетата, ако важи, иначе действащата). Ключът
    `ConfigPagamenti.senzaVies` (по подразбиране включен; „Pagamenti“ → „IVA con partita IVA non valida nel VIES“):
    изключен — както до 4.0, покупката не се сключва. VIES не отговаря — пак нищо не се продава. Основанието
    (чл. 18 Регл. 282/2011 за клиент, съобщил номер) Данъчника отбеляза като неясно — въпрос към консултанта.
  - **Кредитни известия** (`note-credito.ts`, модел `NotaCredito`, чл. 12.9; чл. 115 ЗДДС): порталът НЕ издава
    документи — записва, че известие се дължи: за всяко завършено връщане през Revolut (към плащането, върху чиято
    поръчка са върнати парите), за ръчно отбелязано връщане и за спор, решен срещу нас (`PERSA`); сумата с ДДС се
    разделя на основа и данък по режима на фактурата (`scomponiRimborso`), срок 5 дни (`GIORNI_NOTA_CREDITO`);
    известията към едно плащане никога не надхвърлят фактурата му (редът на плащането е заключен, сборът се гледа).
    Пробите в Sandbox на живия сървър — не. Раздел „Note di credito“ в конзолата: MASTER записва номера и деня
    (веднъж, не в бъдещето; одит `NOTA_CREDITO_EMESSA`), CSV, аларма `notaCredito` (при ново и от поддръжката при
    срок до ден). Номерът на фактурата — по избор при отметката „фактурирано“ (`Pagamento.fatturaNumero`).
  - **Условията 2026-11-14** (12.1, 12.9, 12.10, 17.4, 25.6; чл. 24 и `clausoleSpecifiche` непроменени) — в сила от
    своя ден без обява. **Фирма е „приела“ с действащата версия ИЛИ с по-нова от `STORIA`** (`condizioniValide`,
    `versioniValide` в versioni.ts — вратата, „Contratti“, настройките): миграцията
    `20261114091000_condizioni_2026_11_14_esistenti` отбеляза всички съществуващи фирми с 2026-11-14 **без ред в
    регистъра** (подпис не се измисля) — активни са и на 13-и, и след това, без подпис. „Richiedi la firma“ за
    такава фирма работи веднага (от 4.2; в 4.1 чакаше деня на версията): подписва се версията, която влиза сама
    (`versioneDaFirmare`), веднъж.
  - **Решение по собствена инициатива** (чл. 25.6; чл. 17 DSA): „Segnalazioni“ → „Verifica di nostra iniziativa“
    отваря случай без подател (`Segnalazione.iniziativa`), решава се като сигнал; мотивите до фирмата казват, че
    идват от наша проверка. Така се мотивира и спиране на акаунт заради съдържанието му (мярката се пише на ръка).
  - **Външният монитор** — `.github/workflows/rilievi-health.yml` + `deploy/monitor-health.sh` (DEPLOY.md).
  - **Поправки, намерени от тестовете в часа след полунощ по Рим:** `rimborsoDovuto` — план, който още не е започнал,
    се връща ИЗЦЯЛО (чл. 12.9), а при започнал целите дни се смятат с един час допуск (денят с 23 часа при смяната към
    лятно време струваше ден на клиента); новина на нова инсталация не излиза „в бъдещето“ (`daRegistrare` — най-късно
    началото на днешния ден по UTC).
- **Входът с Microsoft / Google** (точка D1; условията 2026-11-12, чл. 4.6, A.3, A.13, B.8 b): OpenID Connect,
  authorization code + PKCE S256, поверителен клиент (`src/auth/oidc.ts` — откриването, страницата за вход, обменът,
  проверката на ID токена: RS256 от `jwks_uri`, издател — на Microsoft този на подписалата директория
  `<authority>/<tid>/v2.0`, аудитория, срок, nonce; `oidc-stato.ts` — state, nonce и verifier в шифрована бисквитка
  `__Host-rilievi_oidc`, SameSite=Lax, 10 мин, веднъж; `oidc-valori.ts` — tenant ID като GUID, домейн на Workspace,
  без личните на Microsoft и Gmail). Приложението при доставчика — от средата (`OIDC_*`, DEPLOY.md); без него
  бутоните, разделът и маршрутите ги няма. ADMIN включва фирмата в „Impostazioni → Accesso con Microsoft o Google“
  (`Azienda.accessoMicrosoft`/`accessoGoogle`, CHECK, одит `AZIENDA_ACCESSO_ESTERNO` без стойностите); всеки човек
  свързва СВОЯ акаунт от „Account“ с паролата си (`reauthPassword`), а връщането трябва да е в същата сесия (`uid`/`sid`
  в състоянието); самоличността — `IdentitaEsterna` (`<tid>:<oid>` / `sub`, единствена; одит `ACCESSO_ESTERNO_*` без
  нея; писмо при свързване и откачане). Входът намира акаунта САМО по самоличността — никога по имейл; пуска само
  докато активна фирма на човека позволява същата директория/домейн, акаунтът е активен и не е заключен; MASTER —
  никога; включена 2FA — кодът се иска и тогава (доставчикът замества само паролата). `LOGIN` с `meta.fornitore`.
  `form-action` на CSP пуска и произхода на доставчиците (формата пренасочва там); страницата за вход на доставчика —
  само на произхода от настройката. Паролата остава валидна: ADMIN деактивира човека и тук (текстът на раздела го
  казва). Не влиза в износа. Тест: `tests/oidc.test.ts`, `tests/integration/accesso-esterno.test.ts` с фалшив доставчик
  (`oidc-finto.ts` — Microsoft с много директории и Google на един локален сървър).
- **Скицникът** (`src/schizzi/`, решение на собственика, 22 октомври 2026): **за всички фирми, винаги
  включен** (собственикът, 10 ноември 2026 — „attiva gli schizzi per tutti gli utenti e togli l'opzione per
  disattivarli … Gli schizzi diventano attivi di default“; до тогава — функция по фирма, която включваше
  само MASTER): превключвателят на страницата на фирмата и `POST /aziende/:id/schizzi` са махнати,
  `Azienda.schizzi` — `true` за всички и по подразбиране, кодът вече не го чете (`AZIENDA_SCHIZZI_ON/OFF`
  остават в одита за старите записи). В края на формата,
  преди „Riepilogo“: листове (до 10) с преглед; рисуват се в редактор на цял екран (`<dialog>`, платно
  1400 × 1000 единици с мрежа на 50). Листът е JSON в скрито поле и се записва С КАРТАТА (същата
  транзакция, след успешния ѝ запис — 409 не пипа нищо). Записва се само ако блокът е на страницата
  (`schizzi-_`) — стара страница не пипа листовете. В печата и PDF-а — след модулите, преди снимките, по два листа на страница
  A4, векторно, при отметката `Scheda.schizziStampati` (по подразбиране да). Само формата на картата
  (`POST /schede`, `/schede/<id>`) приема тяло до 4 MB (приложение и nginx), всичко друго — до 1 MB.
  Докосване на съществуващ лист го отваря на цял екран (24 октомври 2026): във формата прегледът е бутон
  към редактора, на страницата на картата — изглед на цял екран (`<dialog>`, `public/js/schizzo-intero.js`;
  Esc или „Chiudi“ — обратно; при изправен телефон — подсказка да се завърти).
  **v2 (23 октомври 2026, „коти по лесен начин, кръгове и прочие“):** елементите (`elementi.ts`, zod
  `.strict()`) — път `p` (молив, права, правоъгълник, начупена линия, многоъгълник: „M x y“, относителни
  „l“, „z“), надпис `x`, елипса/кръг `e`, стрелка и надпис със стрелка `a`, кота `q` (две точки,
  отместване, написаното число до 40 знака; `m: 'r'` — радиус), символ `s` (9 за шахтата — `simboli.ts`:
  кабина, противотежест, водач, врата, централа, хармоника, крило, бутониера, бутало; център, размер,
  завъртане на 90°, огледало), `k: 1` — пунктир (не и за коти и надписи). Котата е по ISO 129-1:
  тънки линии, стрелки 30°, текстът над линията и четим отдолу или отдясно, при къса кота стрелките са
  отвън. Формите (права, правоъгълник, кръг, елипса, стрелка), надписът със стрелка и двете точки на
  котата се слагат с влачене или с две щраквания/докосвания (собственикът на компютър, 24 октомври 2026 —
  „non vedo le linee“: щракване с мишката не рисуваше нищо): първото слага началото (кръстче, подсказка
  „Ora indica il secondo punto“), формата следва мишката, второто я завършва; Annulla (активен и на празен
  лист, и докато котата се отмества), Esc, друг инструмент или затварянето махат началото (`undo`,
  `flush`), а два пръста за мащаб между докосванията — не (`cancel` го пази); щракване, прихванато към
  точка на рисунката, започва нова кота/надпис (верига от коти), не редактира стария; влаченето е както
  преди. Котата се слага в 3 стъпки: от точка до точка, отместване (плъзгане или докосване — 50 встрани
  от рисунката), числото — написано на ръка (решение на собственика) в лентата за стойност над листа
  (цифрова клавиатура, „Ø“/„R“; празно — „?“, за мерене после). Тежест на лист (каквото рисува елементът:
  кота 6, символ — частите му, стрелка 2, с надпис 3, другите 1) — до 6000 (`MAX_PESO`, zod и браузърът);
  до 3000 елемента, 4000 отсечки на път, 200 KB на лист. Едно разгъване в примитиви: `forme.ts` за SVG
  (`_schizzo.ejs`) и PDF, `public/js/schizzo-forme.js` за платното — unit тестът пуска браузърния файл
  (node:vm) и сравнява изхода, а `schizzo-regole.js` ≡ `elementi.ts` — на хиляди генерирани елементи.
  Редакторът: инструменти (избор, молив, права, кота, текст, гума; „Forme“ — правоъгълник, кръг,
  елипса, начупена линия/многоъгълник, стрелка, надпис със стрелка; „Simboli“), „Stile“ (3 цвята, 2
  дебелини, пунктир — при избрано го сменя), прихващане (точки на нарисуваното > 0/45/90° в 7° >
  мрежа 25), мащаб 1–8 (два пръста, колелото с Ctrl, бутоните при мишка) и местене на листа (два пръста,
  един пръст след писалка, интервал или средният бутон), избор (докосване, рамка, „Seleziona più“/Shift) с местене, дръжки,
  копие, изтриване, завъртане, огледало, диаметър/радиус на кръг, редакция на текст; Ctrl+Z/Y/D/C/V,
  Delete, стрелките, +/−/0. Пръст, писалка и мишка: втори пръст отменя започнатото и мащабира, след
  писалка пръстите не рисуват, допуските са в px на екрана по вид указател. Менютата и от клавиатурата
  (фокусът влиза в отвореното, стрелките минават през него, Enter/Esc го затварят към лицето му; Esc
  първо затваря менюто, после всичко друго); „Fatto“ взима и написаното в лентата за стойност. Подправен
  елемент отказва записа (422), а върнатата форма пази валидните елементи на листа (`foglioSalvato` —
  един проход, до 20 отпаднали, до тавана на тежестта). Проверката на листа е с таван на броя ПРЕДИ zod и
  елемент по елемент до първия грешен — иначе zod описва всеки грешен поотделно и подправена форма държи
  сървъра секунди. Ред, който тази
  версия не чете (записан от по-нова — след връщане назад), не се показва и остава след пратените
  (`salvaSchizzi`). Надписите в PDF-а — Fira Sans 500 като **WOFF** (`public/fonts`, `scripts/fonts.mjs`):
  fontkit-ът на pdfkit чупи съставните глифове на WOFF2 („i“, ударенията) → 500; знак извън латиницата
  пише надписа с DejaVu.
- **Бързината на формата на картата** (хиляди полета с модулите, телефон в шахтата; октомври 2026):
  полетата на всеки раздел (`.form > .section > .grid`) и модулите са с `content-visibility: auto` —
  извън екрана не се подреждат и не се рисуват. Затова вътре в `.grid` няма CSS броячи (номерът на
  раздела е в легендата, извън него) и нищо не излиза извън кутията му повече от отстъпа ѝ (6 px — за
  рамката на фокуса): изрязва се. app.js чете условията (`data-when`) от полетата, събрани веднъж, и
  само при промяна на поле, от което условие зависи; collegati.js и moduli.js търсят полетата по име в
  събран веднъж индекс — без заявки по целия документ при всяко натискане. Шрифтовете се теглят
  предварително само на витрината (400 и Condensed 600 — иначе текстът се пренарежда); на портала
  отлагат първото рисуване, а текстът там не се мести.
- **Приложението на началния екран** (собственикът, 4 ноември 2026 — „add to home screen for PC, iOS and
  Android … raggiungibile facilmente e a schermo intero“): порталът е инсталируемо уеб приложение (PWA).
  `/manifest.webmanifest` (`src/pwa/manifest.ts`, `routes/pwa.ts` — преди сесията, без бисквитки и база,
  `no-cache`): „Rilievi Impianti“ / „Rilievi“, `start_url` `/schede` (без сесия — входът), обхват `/`,
  `display: fullscreen` — на Android целият екран без лентите на системата; Chrome/Edge на компютър и
  Safari на iPhone/iPad нямат този режим и отварят приложението в негов прозорец без лентите на браузъра
  (crbug 40650429; на компютър F11 / зеленият бутон на Mac — в стъпките), черен фон и тема, преки пътища
  (задържане върху иконата: Nuova scheda, Schede, Interventi, Calcolo argano). Иконите — марката върху
  черно от `npm run brand:logo` (`icon-192/512` — цяла, `icon-maskable-192/512` — в кръга от 80 %, който
  Android запазва при всяка маска); на iPhone — `apple-touch-icon.png` и мета таговете
  (`apple-mobile-web-app-capable`, заглавие „Rilievi“, лента `black`) в главата и на портала, и на
  витрината. Service worker-ът (`public/js/sw.js`, сервиран като `/sw.js` от корена — обхватът е целият
  сайт; регистрира го app.js на всяка страница на портала, витрината остава без JavaScript) НЕ пази
  страници — те носят лични данни и картата трябва да е винаги последната от сървъра: всяка заявка
  отива към мрежата както без него; само страница (GET навигация), която не се зарежда, защото няма
  мрежа, получава кратка страница „Nessuna connessione“ (503, `no-store`, без данни и без скрипт).
  **Изключението — изпратена без мрежа форма** (собственикът, 12 ноември 2026 — точка C3): POST навигация
  към форма на документ от терена (`MODULI` в sw.js: нова или променена карта, лист за интервенция, бон,
  протокол, табела, оферта — никога изтриване, подпис, вход), която не стига до сървъра, чака на
  устройството (IndexedDB `rilievi-bozze`) такава, каквато е пратена, а човекът вижда „Salvato su questo
  dispositivo“. Само за акаунта, който е имал формата отворена: страницата казва на работника кой е
  (`public/js/bozze.js`, псевдоним `utenteBozze` — SHA-256 на id-то, `auth/sessions.ts`; пази се и той на
  устройството, работникът се спира от браузъра) — без него нищо не се пази. Копието изчезва при „Invia
  ora“, при „Elimina“, когато същата форма стигне до сървъра, при излизане от акаунта (POST `/esci` първо
  изпразва устройството) и след 7 дни. На всяка страница на портала — списъкът „Moduli salvati su questo
  dispositivo“: „Invia ora“ праща тялото с токена на текущата страница (`fetch`): записано → страницата
  му; изтекла сесия → копието остава, входът; върнато с грешки/конфликт → същото пращане по обичайния
  начин (сървърът показва формата с данните); `base` остава от пратеното — промяна междувременно е 409.
  Тест: `tests/bozze-sw.test.ts` (работникът в node:vm с IndexedDB в паметта), e2e `tests/e2e/bozze.mjs`
  (Chromium без мрежа → „Invia ora“). Всичко друго минава покрай него. Fetch обработчикът е и каквото Chromium
  иска, за да предложи инсталиране. „Installa l'app“ (`/app`, публична, `noindex`; точка в менюто след
  групите и връзка на входа — скрити с `display-mode`, когато порталът вече е приложението): бутонът
  „Installa l'app“, щом браузърът го предлага (`beforeinstallprompt`, `public/js/installa.js`), и стъпките
  за Android, iPhone/iPad (Condividi → „Aggiungi alla schermata Home“), компютър с Chrome/Edge и Mac със
  Safari („Archivio → Aggiungi al Dock“) — отворени само тези на устройството (без JavaScript — всички).
  Менюто и лентата долу пазят изреза и лентата за жестове (`env(safe-area-inset-*)`). Проверката: unit
  (`tests/pwa.test.ts` — полетата на манифеста, иконите в размера си, непрозрачни, марката в безопасния
  кръг; работникът в node:vm — нищо освен GET навигации, страницата при липса на мрежа, без кеш),
  integration (`tests/integration/installa.test.ts`) и e2e (`tests/e2e/installa.mjs`: самият Chrome казва,
  че е инсталируем — `Page.getInstallabilityErrors` е празно, манифестът и иконите през CDP,
  работникът контролира страницата, без мрежа — „Nessuna connessione“; Playwright вижда мрежата на
  работника само с `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS`, затова — в свой контекст; на телефон
  с Android — стъпките на Android и без хоризонтален скрол на 360 px).
  **PDF в приложението на iPhone** (собственикът, 5 ноември 2026 — „è aperto un pdf non ho modo di
  chiuderlo“): в приложението от началния екран на iOS PDF-ът (и `attachment`, и `inline`) заема
  прозореца без изход — WebKit bug 290847, без решение от Apple. Затова ВСЕКИ линк към PDF носи
  `data-pdf` (`tests/pdf-app.test.ts` го пази във всички изгледи), а `public/js/pdf-app.js` — само при
  `navigator.standalone` — тегли файла и го подава на „Condividi“ на системата (отвори, запази във
  „File“, печат, изпрати), която се затваря сама; не-PDF отговор (вход, блокиран печат) се отваря като
  страница. В браузъра, на Android и на компютър линковете са както винаги. Текстовете — `pdfApp.*` в
  `data-pdf-*` на `<body>`. На iPhone `/app` казва, че Apple инсталира само от „Condividi“, с бутон към
  стъпките (бутон, който да инсталира, на iOS няма). Предупреждението „non sicura“ на Android идва от
  Samsung Internet (собственикът, 5 ноември 2026 — потвърдено на телефона му; конфигурацията ни е
  чиста: HTTPS/HSTS, манифест, икони, работник). Затова там (`samsungInternet`, src/pwa/sistema.ts)
  `/app` не предлага бутона за инсталиране, а казва защо и дава „Apri in Chrome“ — Android intent към
  същата страница в Chrome (`apriInChrome`; без Chrome — Google Play); стъпките препоръчват Chrome.
- Коментарите в `src/`, `views/`, `deploy/` — на български; тестовете и `scripts/` — на английски. В
  изгледите коментарите са EJS (`<%# … %>`), никога HTML (`<!-- … -->`): страницата е само на италиански и
  няма кирилица дори в изходния код (пазят го тестовете — unit, integration и e2e).
- Файл над 300 реда се разделя преди да се добавя.
- **Одит на целия продукт, 4 ноември 2026** (собственикът: „Искам да сме перфектни“ — 10 наши агента:
  Кодаджията ×3, Разбивача на живо, Качествения, VPS-аджията, Асансьорчика, Правният Разбирач,
  Скоростника, SEO). Червеният екип не намери пробив (IDOR 16/16 = 404, ескалация 18/18 = 403, CSRF,
  сесии, качване). Поправеното остава правило:
  - **Текст в PDF се реже двоично** (`ordini/pdf-testo.ts`, `cartelli/pdf.ts`, `interventi/pdf-parti.ts`):
    PDF-ът се рисува в единствената нишка на портала, а pdf-lib оформя целия низ при всяко мерене — 600
    знака без интервал, рязани знак по знак, държаха портала ~20 s за всички фирми. В `pdf-testo.ts`
    горната граница идва и от ширините на знаците един по един (кеш за шрифта): мерят се низове от около
    два реда. `tests/pdf-testo.test.ts` пази същите редове като рязането знак по знак и времето на всеки
    модул с всички полета пълни (под 3 s).
  - **Паметта на worker-а (1 GB)**: прогресивен JPEG (~6 B/px) и AVIF (~19 B/px) се декодират цели —
    таван 50 и 30 Mpx (`limitePixel`, проверка по главата на файла преди декодирането, `FotoTroppoGrande`
    → „troppo grande“); ffmpeg декодира на една нишка (`-threads 1 -filter_threads 1` ПРЕДИ `-i`).
  - **Опашката не трие чуждото готово** (`coda.ts`, `rimuoviSeNostro`): файловете на реда се трият само
    ако той е бил наш или го няма — втори worker, пуснат докато първият работи, оставяше ред „готов“ без
    файл. Качване, чиято транзакция падне, трие преместените оригинали (`allegati/service.ts`).
  - **Връзки, които спират с причината си** (`services/revoche.ts`): връзката за нова парола — и при
    смяна на паролата от самия човек и при деактивиране (активиран отново в същия ден, старата връзка го
    отваряше); поканите на човек — при деактивиране, при роля без `users:manage` във фирмата и при
    махане от нея.
  - **Върната форма за нова карта** носи само фирма на човека (`azienda?.id`, а `renderForm` приема
    `view.azienda` само от избора или от членствата му): чужд id носеше данните на чуждата фирма.
  - Страниците на „Calcolo argano“ — `?p=`, както навсякъде (pager.ejs).
  - CLS: листът за печат тегли предварително петте си шрифта; „Installa l'app“ идва с отворените стъпки
    на устройството (`pwa/sistema.ts`, `Vary: User-Agent`).
  - SEO: robots пуска `/app` (за да се види `noindex`), Organization носи `logo` (марката 512 × 512),
    `image` и `knowsAbout`. Политиката: редове за поканите, работните данни (с подписите на листа за
    интервенция) и бекъпите; правното основание е на фирмата (чл. 6), ние сме по чл. 28; Brevo — и
    листовете в PDF; регистърът на фирмата; връзка към политиката в долната лента на портала.
  - Деплой: първо `db app`, после worker (старият спира преди миграцията); докато миграция още тече
    (`_prisma_migrations` без край и без грешка), се чака до `RILIEVI_MIGRATION_WAIT` (30 мин.), вместо
    да се пусне откат посред нея.
  - После (собственикът: „Изчисленията ги остави така както са на pdf, другото го направи по
    най-добрият възможен начин“): MASTER не пипа друг MASTER и не си прави връзка за парола, а имейлът
    си сменя с паролата; краят на услугата за фирма (износ + изтриване); бекъпът на снимките, копието
    извън сървъра, провереното възстановяване и алармата; долният праг на неуспешния вход; `sameAs` —
    всяко в правилото си по-горе. **Изчислението за аргано остава точно по листа на собственика** („RT-E
    MOD 10411-1“, със особеностите му) — разлика от нормата се казва на собственика, не се „поправя“.
- **Одит преди пазара, 12 ноември 2026 — версия 3.1** (собственикът: „най-добрият и най-пълният преглед на всяка
  една част … да сме готови за пазара“ — 14 наши агента и Скоростника; пробив между фирми не е намерен).
  Плащанията — в правилото им по-горе. Останалото, което остава правило:
  - **Изтриване и отнемане при изтекъл абонамент** (условията, чл. 12.5 в), A.9, 4.1): `auth/scope.ts` —
    `canInPerTogliere` / `scopePerTogliere` / `requireCapabilityPerTogliere` гледат правото на ролята БЕЗ „само
    четене“ и се ползват САМО от маршрути, които трият: снимка (връзката е на страницата на картата), табела, бон
    без подписи, чернова на оферта. Отмяната на API ключ и изключването на входа с Microsoft/Google са по роля
    ADMIN (`aziendeDaAdmin`), не по `aziende:settings` — при изтекла фирма стоят на „Abbonamento“ („Accessi ancora
    attivi“). Връщането от кошчето е запис — при изтекъл абонамент не (`inSolaLettura`). Нов маршрут за изтриване
    = същите помощници, никога нова способност в `CAPACITA_IN_SOLA_LETTURA`.
  - **Повторното активиране заема място** (`services/users.ts`, `setActive` → `limitePersone`/`solaLettura`):
    брои се като покана, под `FOR UPDATE` на всяка активна фирма на човека; MASTER — без таван.
  - **Паролата преди действие, което откраднатата сесия не бива да може** (`routes/conferma-password.ts`,
    `confermaPassword` — брои се в заключването): износът на MASTER (вече POST + CSRF, не GET), искането за смяна
    на доставчика, записът на пощата (`passwordAccount`), както и досега износът на ADMIN и ключът на Revolut.
    Друг SMTP сървър или логин иска ключа наново (записаният ключ не отива при непознат сървър).
  - **Изтриването на фирма не чупи чужд печат** (`aziende/eliminazione.ts`): човек, потвърждавал или подписвал
    документи на друга фирма, остава като ред — без фирма, спрян, без сесии; другите „само тук“ се трият.
  - **Пазените без мрежа форми** (`public/js/sw.js`, `bozze.js`): подпис НИКОГА не чака на устройството —
    полетата `…firma` се изпразват преди записа (страницата казва „Le firme non sono state salvate“), форма с
    `togli` не се пази; „Invia ora“ маха копието само ако отговорът е страница на същия вид документ
    (пренасочване към условията или друга страница-пазач го оставя), а при 429/413 копието остава.
  - **Износът не държи фирмата в паметта** (`aziende/esportazione-dati.ts`, `esportazione-archivio.ts`):
    `dati.json` се пише на диска в тома (`arrivi/esportazione-*.json`, трие се след свалянето и от поддръжката)
    раздел по раздел, големите таблици на страници по 200 реда (`aPagine`); един ред JSON на запис. Нов голям
    раздел = източник на редове, не `findMany` на всичко.
  - **Поддръжката е от независими стъпки** (`manutenzione-passi.ts`, `maintenance.ts`): паднала стъпка се записва
    (`evento: 'manutenzione.passo'`) и не спира другите; последното пускане е в „Salute del sistema“
    („Ultima manutenzione oraria“ — червено при паднала стъпка или без пускане от два часа). Там са и пощата ПО
    ИЗХОД (`ultimoEsitoPosta` — настроена поща, чието последно писмо не е тръгнало, е червена; същото на
    `/stato`) и „Pagamenti da verificare“ с отказаните известия на Revolut. `/stato` се показва и при паднала
    база (и на вписан човек — като гост). Редът на pino-http е `error` за 5xx, `warn` за 429/413; обработчикът
    на грешки пише с `req.log` (номерът на заявката); нови логове носят ключ `evento` (алармите са по него, не
    по текста). „Жив съм“ на worker-а следва цикъла му (най-много 2 ч без завъртане).
  - **Всеки POST маршрут се обхожда от тест** (`tests/integration/rotte.test.ts`, списъкът идва от самия
    рутер): без сесия — нищо; без CSRF — 403; `/master`, `/aziende`, `/richieste` — само MASTER; изтекла фирма —
    403 навсякъде освен изброеното в `ANCHE_SCADUTA` с причината му. Нов маршрут, който пише, или минава тези
    проверки, или влиза в списъка нарочно.
  - **Новина с условие** (`VoceNovita.se`, `novita/attive.ts`): входът с Microsoft/Google се обявява само на
    портал, на който е включен (иначе е реклама на нещо, което го няма). Страницата, емисията, JSON-LD, llms.txt
    и прозорецът четат `vociAttive()`.
  - **Писмата носят пълните данни на изпращача** (`mail/mailer.ts`, `conFirma`): текстовете в речника завършват
    с краткия подпис, mailer-ът го заменя с правната форма, седалището, ЕИК и ДДС номера.
  - Политиката: редове за боновете, протоколите, офертите, анотациите, самоличността при Microsoft/Google,
    API ключовете, счетоводителя; бисквитката `__Host-rilievi_oidc`; пазеното на устройството; раздел
    „Segnalare un contenuto illegale e punti di contatto“ (Рег. (ЕС) 2022/2065, чл. 11, 12, 16 — `/privacy#segnalazioni`,
    връзка в долната лента). Регистърът по чл. 30(1) — C5–C7 (плащания, оферти, известия). Не е правен съвет.
  - SEO: заглавието и първият абзац казват какво е продуктът („software per ascensoristi“), FAQ — „Che cos'è“,
    марките на таблата, езикът; `speakable` — само първият абзац; видима дата в долната лента; llms.txt — описание,
    дата, `/stato`, емисията. Текстовете на изчисленията назовават изданията (UNI 10411-1:2024 / -11:2024,
    приложение D) и казват какво е резултатът („Campo di taratura di V1“) — формулите не са пипани.
  - Деплой (VPS-аджията): възстановяването е в празна схема и в една транзакция, с `gzip -t` преди това; ключът
    на печата не се създава наново, ако в базата има каквото и да е вързано за него; общ `flock` за деплоя и
    бекъпа; чистене на старите образи; страница за поддръжка при 502; IndexNow след здрав деплой при променен
    sitemap; раздел „Нов сървър“ в DEPLOY.md.
  - Дребни: таванът на API-то — първо по мрежа (1200/ч), после по ПРОВЕРЕН ключ (600/ч); състоянието на оферта
    се сменя само върху видяната версия (`base`); анотациите върху снимка — тяло до 4 MB; нова заявка за достъп
    от същия имейл поправя чакащата само 10 минути (`CORREZIONE_MS`), после е отделен ред.
- Миграциите се пишат на ръка (`prisma migrate diff`) и се прилагат само с `migrate deploy`; никога
  `db push` в продукция. `pg_trgm` е в първата миграция.

## Деплой

Docker Compose (db + app на 127.0.0.1:4330 + `worker` с ffmpeg; томовете `db-data` и `media`) + nginx на
хоста — `DEPLOY.md` (снимките не са в дъмпа на базата — бекъпът им е отделен, т. 6). Веднъж: `deploy/setup-env.sh`
(тайните в `/opt/few-few/shared/rilievi/.env`, 600), сертификат, после `deploy/create-master.sh`. Един
път за ръчния и автоматичния деплой: `deploy/deploy.sh` (вика го `deploy/autodeploy.sh`, проект
`rilievi`): бекъп преди миграция, сонда с маркер `"app":"rilievi"`, `last-good`, дневен бекъп
(`rilievi-backup.timer`), vhost-ът от репото. Изход 0/3/4/1 — като korpora.

Дневният бекъп (`deploy/backup.sh`; одит, 4 ноември 2026 — DEPLOY.md, т. 6): дъмпът на базата и
моментна снимка на снимките с твърди връзки (`cp -al` — без място; изтритото остава 14 дни, колкото
дъмповете), последните 14 от всяко; всеки дъмп се възстановява във временен PostgreSQL без мрежа
(`restore-test.sh`); по избор копие извън сървъра (rsync по SSH — САМО дъмповете и снимките; тайните
скриптът никога не изнася, копират се веднъж на ръка) и сигнал „жив съм“ — `RILIEVI_OFFSITE`,
`RILIEVI_HEARTBEAT_URL`, `RILIEVI_ALERT_URL` в `$SHARED/backup.env` (600). Провал →
`rilievi-backup-alert.service` (OnFailure): `ULTIMO_ERRORE`, критичен ред в журнала, сигнал. Тестът
(`tests/deploy-backup.test.ts`) пуска истинския скрипт със заместител на docker.
