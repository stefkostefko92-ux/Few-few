# Регистър на риска — Supreme AdBlock

Какво може да спре продукта за един ден, кой го пази и как проверяваме, че защитата е истинска.
Подредено по ефект. **Ключове, кодове за възстановяване и пароли никога не влизат в репото** —
тук е само процедурата. Последна редакция: 23 октомври 2026.

| # | Риск | Ефект | Пази го | Проверено, когато |
|---|------|-------|---------|-------------------|
| 1 | Загубен достъп до профила на издателя в CWS | ★★★★★ | собственикът | вторият Admin се вижда в Account; 2FA с хардуерен ключ; кодовете за възстановяване са изпробвани |
| 2 | Загубен или изтекъл подписващ ключ на `filters.json` | ★★★★☆ | собственикът + релийз | вторият публичен ключ е в пакета; офлайн копията са изпробвани |
| 3 | Сваляне или отказ в CWS | ★★★★☆ | шаблоните по-долу | всеки отказ има отговор до 48 ч, по шаблон |
| 4 | Чужда марка „AdBlock“ | ★★★☆☆ | собственикът + юрист | писмен отговор за EUIPO, TMview, USPTO |
| 5 | Сървърът или домейнът не отговаря | ★★☆☆☆ | VPS-аджията | разширението работи с вградените правила; ъпдейтите на филтрите чакат |

## 1. Профилът на издателя

Един Google акаунт = един единствен вход към листинга, оценките и Established Publisher.

- **Втори Admin.** Developer Dashboard → Account → групов издател / споделена собственост
  (<https://developer.chrome.com/docs/webstore/group-publishers>). Имената на ролите провери на живо
  в таблото — сменят се. Вторият човек е доверен и има собствен акаунт с 2FA.
- **2FA с хардуерен ключ** (FIDO2/passkey) на всеки акаунт с достъп, плюс **офлайн кодове за
  възстановяване** — разпечатани, на две места, не в облака на същия акаунт.
- **Публичният контакт е фирменият** (`info@carbonstealth.eu`), не личният адрес.
- Проверка веднъж на тримесечие: влез от втория акаунт; провери, че кодовете са на мястото си.

## 2. Подписващият ключ (Ed25519)

Chrome 137+ **изисква** валиден подпис на `filters.json` (`background.js`, `SIG_PUBKEYS_B64`).
Без ключа сървърът не може да подпише нов файл: разширенията остават на последната добра
конфигурация и на вградените правила, но поправка за часове (нова рекламна мрежа, YouTube) не
стига до никого, докато нов релийз с нов ключ не мине ревю.

- **Офлайн копие** на `/etc/caddy/adblock-signing.key` на две места извън сървъра (напр. шифрован
  USB + сейф). Проверка: `openssl pkey -in <копие> -pubout -outform DER | tail -c 32 | base64` дава
  същия публичен ключ като първия в `SIG_PUBKEYS_B64`.
- **Втори ключ, вграден предварително** — за смяна без „ден X“: `sudo bash
  /opt/few-few/current/adblock/tools/signing_key_next.sh` на сървъра създава
  `/etc/caddy/adblock-signing.next.key` (600) и печата само публичния ключ. Той става втори елемент на
  `SIG_PUBKEYS_B64` в следващия релийз. Сървърът продължава да подписва с текущия. Пълната ротация —
  `server/README.md` → *Signing key rotation*. И за двата частни ключа — офлайн копия.
- `tests/background.test.mjs` пази, че ключът, с който сървърът подписва днес (`SERVER_KEY_NOW`),
  е в пакета: релийз, който по погрешка го маха, не минава теста.

## 3. Отказ или сваляне в Chrome Web Store

Писмото на CWS носи код на нарушението и точката от политиката; кодовете са описани в
<https://developer.chrome.com/docs/webstore/troubleshooting>. Отговаряй само на посоченото, по
фактите, с път до файла. Не обещавай промени, които не са направени. Отговорът е на английски.

Факти, на които стъпва всеки отговор (`adblock/CLAUDE.md` → *Инварианти*):

- единствена цел: блокиране на реклами и тракери; всичко друго (бисквитки, анти-адблок, Фокус) е
  част от същото — досадни елементи на страницата;
- целият код е в пакета, без минифициране; няма `eval`, `new Function`, отдалечени скриптове;
- единствената автоматична заявка към нас е `filters.json` + `.sig` около два пъти на ден —
  само данни (домейни, CSS селектори, полета за YouTube), строго валидирани, нищо не се изпълнява;
- от 5.1.4 няма канал на живо за скриптлети: директивите се пекат при билда
  (`node tools/build_scriptlets.mjs` ги възпроизвежда байт по байт), а ключ `scriptlets` във
  `filters.json` се игнорира;
- обосновката на всяко разрешение е `docs/SUBMISSION.md` §5.

**Шаблон — „remote code“ / Manifest V3:**

> Thank you for the review. Supreme AdBlock executes no remotely hosted code. All JavaScript ships in
> the package, unminified. The only automatic request is `https://adblock.carbonstealth.eu/filters.json`
> and its Ed25519 signature: a data file of domain names, CSS selectors and YouTube response field
> names, validated against a strict schema and never evaluated (background.js, `fetchLiveConfig`).
> Since 5.1.4 no scriptlet directive comes from the network: they are compiled into the package at
> build time (scriptlets/main.js, reproducible with `node tools/build_scriptlets.mjs`), and a
> `scriptlets` key in filters.json is ignored. Please point us to the file and line you saw, and we
> will fix it in the next version.

**Шаблон — разрешения:**

> Every permission is used for the extension's single purpose, blocking ads and trackers; the use of
> each one is in the justification we submitted (and in docs/SUBMISSION.md §5 of our public repository).
> If one of them is not needed for a feature you tested, tell us which, and we will remove it or
> make it optional.

**Шаблон — описание, скрийншоти, твърдения:**

> We have removed the text you pointed out from [the description / screenshot N] and checked every
> language of the listing for the same wording. The listing makes no claims about price, speed or
> other products. The updated version is submitted.

Ако отказът е за нещо, което не разбираме: питай чрез формуляра за помощ на One Stop Support, със
скрийншот на писмото, преди да качиш нова версия.

## 4. Марката „AdBlock“

Думата „AdBlock“ е и име на чужд продукт. Дали е регистрирана марка за софтуер в ЕС или САЩ, не сме
проверили. Това не е правен съвет: решението е на собственика, с юрист.

1. Търсене по „ADBLOCK“ и „AD BLOCK“ в класове 9 и 42:
   [EUIPO eSearch](https://euipo.europa.eu/eSearch/), [TMview](https://www.tmdn.org/tmview/),
   [USPTO](https://tmsearch.uspto.gov/). Запиши номер, притежател, класове, статус и дата.
2. Със записа — при юрист по марки: може ли „Supreme AdBlock“ като име на разширение; има ли риск
   за домейна и листинга.
3. До отговора: нова употреба на „AdBlock“ отделно от „Supreme“ (напр. „AdBlock“ сам в заглавие) не
   правим. Родовите думи („ad blocker“, „блокер на реклами“) са свободни и са в името от 5.5.1.

Записът от проверката отива тук, с дата. Резервно име не избираме предварително.

## 5. Сървърът и домейнът

`adblock.carbonstealth.eu` дава сайта, `/privacy` (Privacy Policy URL на листинга) и `filters.json`.
Ако падне, разширението продължава с вградените правила; ъпдейтите на филтрите изчакват. Ако
падне за дни, листингът сочи политика, която не се отваря — това е причина за сваляне.

- Деплоят и мониторингът са при VPS-аджията (`deploy/README.md`); TLS се подновява сам.
- Домейнът е с автоматично подновяване и заключен за трансфер (провери в регистратора веднъж годишно).
