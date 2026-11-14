# Описание на базата данни — Carbon Stealth POS

Генерирано от `prisma/schema.prisma` с `npm run db:doc` — не се пипа на ръка. Изисква се по
чл. 52в, ал. 2, т. 3 от Наредба № Н-18 и Прил. № 31: всички таблици, полета и връзки.

- **Вид:** SQLite, един файл в профила на касата (`carbon-stealth-pos.db`); не е криптирана.
- **Пари:** цели числа в евроценти. **Количества:** цели числа в хилядни (1000 = 1 бр. или 1 кг).
- **Часове:** UTC в базата; справките показват местното време.
- **Без изтриване:** продажби, анулирания, складови движения и одиторският дневник са защитени с
  тригери в базата (Прил. № 29, т. 13) — виж `src/lib/integrity.ts`.
- **Структуриран експорт без лични данни:** справките по т. 18 (XLSX/CSV) от менюто „Справки“.

## Съдържание (25 таблици)

- [User](#user) — Оператор на касата: код за ФУ и УНП, ПИН (bcrypt), роля и одиторски профил (Прил. № 29, т. 6, т. 7, т. 19).
- [UserRoleGrant](#userrolegrant) — Прил. № 29, т. 6 и т. 18.9: период на активност за всяка присвоена роля.
- [Category](#category) — Категория на стоките — за подредба в каталога на касата и за промоции по категория.
- [Product](#product) — Данъчни групи по чл. 27 от Наредба Н-18 (ставките са в Setting, конфигурируеми)
- [Barcode](#barcode) — Баркод на стока (EAN-8/13 и др.); една стока може да има няколко.
- [Promotion](#promotion) — Промоция за конкретна стока ИЛИ за цяла категория, валидна в период (дати) и по избор в часови диапазон (happy hour), с опционален праг за…
- [Customer](#customer) — Клиент с клиентска карта: отстъпка, вересия (кредитен лимит) и салдо.
- [Shift](#shift) — Смяна на оператора: начална и крайна наличност в брой, разлика при закриване.
- [CashMovement](#cashmovement) — Служебно въведени и изведени суми в смяната (с бон от ФУ).
- [Sale](#sale) — Приключена продажба или сторно документ: УНП, суми, плащане, номер на фискалния бон и ИН на ФУ (Прил. № 29, т. 2, т. 9, т. 10).
- [Invoice](#invoice) — Издава се към приключена продажба; последователна възходяща номерация без пропуски.
- [SaleItem](#saleitem) — Ред от приключена продажба със снимка на името, цената и ДДС групата към момента на продажбата.
- [Supplier](#supplier) — Доставчик на стоки (ЕИК, ДДС номер, контакти).
- [Delivery](#delivery) — Доставка по документ от доставчик — увеличава наличностите.
- [DeliveryItem](#deliveryitem) — Ред от доставка: количество, доставна цена, партида и срок на годност.
- [Stocktake](#stocktake) — Ревизия (инвентаризация) на наличностите.
- [StocktakeItem](#stocktakeitem) — Ред от ревизия: очаквано и преброено количество.
- [WriteOff](#writeoff) — Брак или липса — намалява наличностите с причина.
- [WriteOffItem](#writeoffitem) — Ред от брак: количество и стойност.
- [StockMovement](#stockmovement) — Единна складова книга — всяка промяна на наличност минава оттук (одитна следа)
- [Setting](#setting) — key → JSON стойност: данни за търговеца (име, ЕИК, ЗДДС №, адрес, обект), ДДС ставки по групи, конфигурация на ФУ и ПОС терминал, двойно…
- [AuditLog](#auditlog) — Одиторска следа в стил СУПТО: без изтриване, само добавяне
- [SaleDraft](#saledraft) — Продажбата съществува в базата от първия въведен артикул: има УНП, час на откриване и оператор.
- [SaleDraftLine](#saledraftline) — Ред от открита продажба — изчислява се отново на сървъра при всяка промяна.
- [CancelledItem](#cancelleditem) — Анулиран артикул от открита, неприключена продажба (т. 12, т. 18.5).

## Потребители и сесии

### User

Оператор на касата: код за ФУ и УНП, ПИН (bcrypt), роля и одиторски профил (Прил. № 29, т. 6, т. 7, т. 19).

| Поле | Тип | Задължително | По подразбиране | Ключ / връзка | Описание |
|---|---|---|---|---|---|
| `id` | TEXT | да | генериран идентификатор | първичен ключ |  |
| `name` | TEXT | да |  |  |  |
| `operatorCode` | INTEGER | да |  | уникален | Код на оператора във фискалното устройство (1–30 по Н-18) и в УНП |
| `pinHash` | TEXT | да |  |  | bcrypt на 4–8 цифрен ПИН |
| `role` | TEXT | да | `"CASHIER"` |  | ADMIN \| MANAGER \| CASHIER |
| `readOnly` | BOOLEAN | да | `false` |  | Одиторски профил (Прил. № 29, т. 19): „аналог на администраторския, но САМО за четене“. Нарочно е ОТДЕЛЕН признак, а не четвърта роля: йерархията е линейна (CASHIER<MANAGER<ADMIN) и одиторът не се вписва в нея — където и да го сложиш, или получава правата за писане на MANAGER, или не вижда дневника. Флагът се наслагва ВЪРХУ ролята: MANAGER+readOnly вижда каквото MANAGER вижда, но всеки пишещ маршрут го отказва. |
| `mustChangePin` | BOOLEAN | да | `false` |  | Първи вход (шаблонната база) или ПИН, зададен от администратор: операторът вижда само екрана за смяна на ПИН, а API-то отказва всичко друго, докато не го смени (КП-П.2). |
| `active` | BOOLEAN | да | `true` |  |  |
| `deactivatedAt` | DATETIME | не |  |  | т. 18.9: дата на деактивиране |
| `createdAt` | DATETIME | да | часът на записа |  |  |
| `updatedAt` | DATETIME | да | часът на последната промяна |  |  |

**Връзки:**

- `shifts` → Shift (много)
- `sales` → Sale (много)
- `cashMovements` → CashMovement (много)
- `deliveries` → Delivery (много)
- `stocktakes` → Stocktake (много)
- `writeOffs` → WriteOff (много)
- `auditLogs` → AuditLog (много)
- `invoices` → Invoice (много)
- `roleGrants` → UserRoleGrant (много)
- `drafts` → SaleDraft (много)
- `cancelledItems` → CancelledItem (много)

### UserRoleGrant

Прил. № 29, т. 6 и т. 18.9: период на активност за всяка присвоена роля. Смяната на ролята затваря стария запис (validTo) и отваря нов — историята не се губи.

| Поле | Тип | Задължително | По подразбиране | Ключ / връзка | Описание |
|---|---|---|---|---|---|
| `id` | TEXT | да | генериран идентификатор | първичен ключ |  |
| `userId` | TEXT | да |  | → User.id |  |
| `role` | TEXT | да |  |  | ADMIN \| MANAGER \| CASHIER |
| `readOnly` | BOOLEAN | да | `false` |  | одиторски профил (т. 19) |
| `validFrom` | DATETIME | да | часът на записа |  |  |
| `validTo` | DATETIME | не |  |  |  |
| `grantedById` | TEXT | не |  |  |  |

**Връзки:**

- `user` → User (една) по `userId`

**Индекси:**

- индекс: `userId`

## Номенклатура

### Category

Категория на стоките — за подредба в каталога на касата и за промоции по категория.

| Поле | Тип | Задължително | По подразбиране | Ключ / връзка | Описание |
|---|---|---|---|---|---|
| `id` | TEXT | да | генериран идентификатор | първичен ключ |  |
| `name` | TEXT | да |  | уникален |  |
| `color` | TEXT | да | `"#4a5a7d"` |  | цвят на бързия бутон в POS екрана |
| `icon` | TEXT | да | `"Package"` |  | име на Phosphor икона |
| `sort` | INTEGER | да | `0` |  |  |
| `active` | BOOLEAN | да | `true` |  |  |

**Връзки:**

- `products` → Product (много)
- `promotions` → Promotion (много)

### Product

Данъчни групи по чл. 27 от Наредба Н-18 (ставките са в Setting, конфигурируеми)

| Поле | Тип | Задължително | По подразбиране | Ключ / връзка | Описание |
|---|---|---|---|---|---|
| `id` | TEXT | да | генериран идентификатор | първичен ключ |  |
| `plu` | INTEGER | да |  | уникален | кратък номер за бързо набиране и тегловни баркодове |
| `name` | TEXT | да |  |  |  |
| `categoryId` | TEXT | да |  | → Category.id |  |
| `unit` | TEXT | да | `"PCS"` |  | PCS (брой) \| KG (тегловна — везна) |
| `vatGroup` | TEXT | да | `"B"` |  | А/Б/В/Г по чл. 27 Н-18: A\|B\|C\|D |
| `priceCents` | INTEGER | да |  |  | продажна цена в евроценти (с ДДС) |
| `costCents` | INTEGER | да | `0` |  | последна доставна цена (без ДДС) |
| `stockMilli` | INTEGER | да | `0` |  | наличност в хилядни (бр./кг) |
| `minStockMilli` | INTEGER | да | `0` |  | праг за предупреждение „изчерпва се“ |
| `favorite` | BOOLEAN | да | `false` |  | бърз бутон на POS екрана |
| `active` | BOOLEAN | да | `true` |  |  |
| `deactivatedAt` | DATETIME | не |  |  | т. 18.9 |
| `createdAt` | DATETIME | да | часът на записа |  |  |
| `updatedAt` | DATETIME | да | часът на последната промяна |  |  |

**Връзки:**

- `category` → Category (една) по `categoryId`
- `barcodes` → Barcode (много)
- `saleItems` → SaleItem (много)
- `deliveryItems` → DeliveryItem (много)
- `stocktakeItems` → StocktakeItem (много)
- `writeOffItems` → WriteOffItem (много)
- `stockMovements` → StockMovement (много)
- `promotions` → Promotion (много)
- `draftLines` → SaleDraftLine (много)
- `cancelledItems` → CancelledItem (много)

**Индекси:**

- индекс: `categoryId`
- индекс: `name`

### Barcode

Баркод на стока (EAN-8/13 и др.); една стока може да има няколко.

| Поле | Тип | Задължително | По подразбиране | Ключ / връзка | Описание |
|---|---|---|---|---|---|
| `id` | TEXT | да | генериран идентификатор | първичен ключ |  |
| `code` | TEXT | да |  | уникален | EAN-13/EAN-8/произволен |
| `productId` | TEXT | да |  | → Product.id |  |

**Връзки:**

- `product` → Product (една) по `productId`

**Индекси:**

- индекс: `productId`

## Промоции (ценови листи)

### Promotion

Промоция за конкретна стока ИЛИ за цяла категория, валидна в период (дати) и по избор в часови диапазон (happy hour), с опционален праг за количество. POS автоматично прилага най-изгодната активна промоция за реда.

| Поле | Тип | Задължително | По подразбиране | Ключ / връзка | Описание |
|---|---|---|---|---|---|
| `id` | TEXT | да | генериран идентификатор | първичен ключ |  |
| `name` | TEXT | да |  |  |  |
| `productId` | TEXT | не |  | → Product.id | Обхват: точно едно от двете (стока или категория) |
| `categoryId` | TEXT | не |  | → Category.id |  |
| `kind` | TEXT | да |  |  | Тип: PERCENT (% отстъпка) \| PRICE (фиксирана промо цена) \| MXN (M за N) |
| `percent` | INTEGER | не |  |  | отстъпка в промили (150 = 15%) при kind=PERCENT |
| `priceCents` | INTEGER | не |  |  | промо цена (с ДДС) при kind=PRICE |
| `buyQty` | INTEGER | не |  |  | при kind=MXN: на всеки buyQty броя (напр. 3) |
| `payQty` | INTEGER | не |  |  | …плащаш само payQty (напр. 2) → „3 за 2“ |
| `startDate` | DATETIME | да |  |  | Период на валидност (по дата) |
| `endDate` | DATETIME | да |  |  |  |
| `startMinute` | INTEGER | не |  |  | Happy hour: минути от полунощ [startMinute, endMinute); null = цял ден |
| `endMinute` | INTEGER | не |  |  |  |
| `minQtyMilli` | INTEGER | да | `0` |  | Активира се само при поне толкова количество (millis); 0 = винаги |
| `active` | BOOLEAN | да | `true` |  |  |
| `createdAt` | DATETIME | да | часът на записа |  |  |
| `updatedAt` | DATETIME | да | часът на последната промяна |  |  |

**Връзки:**

- `product` → Product (една или нито една) по `productId`
- `category` → Category (една или нито една) по `categoryId`

**Индекси:**

- индекс: `productId`
- индекс: `categoryId`
- индекс: `active`

## Клиентски карти (лоялност)

### Customer

Клиент с клиентска карта: отстъпка, вересия (кредитен лимит) и салдо.

| Поле | Тип | Задължително | По подразбиране | Ключ / връзка | Описание |
|---|---|---|---|---|---|
| `id` | TEXT | да | генериран идентификатор | първичен ключ |  |
| `cardNumber` | TEXT | да |  | уникален |  |
| `name` | TEXT | да |  |  |  |
| `phone` | TEXT | не |  |  | по избор — минимизация на данните (GDPR) |
| `discountPermille` | INTEGER | да | `0` |  | отстъпка в промили (25 = 2.5%) |
| `balanceCents` | INTEGER | да | `0` |  | вересия: неплатено задължение в евроценти |
| `creditLimitCents` | INTEGER | да | `0` |  | таван на вересията (0 = без лимит) |
| `marketingConsent` | BOOLEAN | да | `false` |  | GDPR чл. 6(1)(a): съгласие за маркетинг |
| `consentAt` | DATETIME | не |  |  | кога е дадено съгласието |
| `anonymizedAt` | DATETIME | не |  |  | GDPR чл. 17: анонимизиран (данните за контакт са изтрити) |
| `eik` | TEXT | не |  |  | ЕИК при фирмен клиент (т. 18.9) |
| `active` | BOOLEAN | да | `true` |  |  |
| `deactivatedAt` | DATETIME | не |  |  | т. 18.9 |
| `createdAt` | DATETIME | да | часът на записа |  |  |
| `updatedAt` | DATETIME | да | часът на последната промяна |  |  |

**Връзки:**

- `sales` → Sale (много)

## Смени и каса

### Shift

Смяна на оператора: начална и крайна наличност в брой, разлика при закриване.

| Поле | Тип | Задължително | По подразбиране | Ключ / връзка | Описание |
|---|---|---|---|---|---|
| `id` | TEXT | да | генериран идентификатор | първичен ключ |  |
| `userId` | TEXT | да |  | → User.id |  |
| `openedAt` | DATETIME | да | часът на записа |  |  |
| `closedAt` | DATETIME | не |  |  |  |
| `openingCashCents` | INTEGER | да |  |  | начална касова наличност |
| `closingCashCents` | INTEGER | не |  |  | преброена при закриване |
| `expectedCashCents` | INTEGER | не |  |  | очаквана по системата при закриване |
| `zReportNumber` | TEXT | не |  |  | номер на дневния финансов отчет от ФУ |
| `note` | TEXT | не |  |  |  |

**Връзки:**

- `user` → User (една) по `userId`
- `sales` → Sale (много)
- `cashMovements` → CashMovement (много)

**Индекси:**

- индекс: `userId`
- индекс: `openedAt`

### CashMovement

Служебно въведени и изведени суми в смяната (с бон от ФУ).

| Поле | Тип | Задължително | По подразбиране | Ключ / връзка | Описание |
|---|---|---|---|---|---|
| `id` | TEXT | да | генериран идентификатор | първичен ключ |  |
| `shiftId` | TEXT | да |  | → Shift.id |  |
| `userId` | TEXT | да |  | → User.id |  |
| `type` | TEXT | да |  |  | IN (служебно въведени) \| OUT (служебно изведени) |
| `amountCents` | INTEGER | да |  |  |  |
| `reason` | TEXT | да |  |  |  |
| `fiscalDocNo` | TEXT | не |  |  | номер на служебния бон от ФУ |
| `createdAt` | DATETIME | да | часът на записа |  |  |

**Връзки:**

- `shift` → Shift (една) по `shiftId`
- `user` → User (една) по `userId`

**Индекси:**

- индекс: `shiftId`

## Продажби

### Sale

Приключена продажба или сторно документ: УНП, суми, плащане, номер на фискалния бон и ИН на ФУ (Прил. № 29, т. 2, т. 9, т. 10).

| Поле | Тип | Задължително | По подразбиране | Ключ / връзка | Описание |
|---|---|---|---|---|---|
| `id` | TEXT | да | генериран идентификатор | първичен ключ |  |
| `unp` | TEXT | да |  | уникален | УНП — уникален номер на продажбата: <инд. № ФУ>-<код оператор>-<7-цифрен пореден> |
| `number` | INTEGER | да |  | уникален | вътрешен пореден номер |
| `status` | TEXT | да | `"COMPLETED"` |  | COMPLETED \| STORNO |
| `shiftId` | TEXT | да |  | → Shift.id |  |
| `userId` | TEXT | да |  | → User.id |  |
| `customerId` | TEXT | не |  | → Customer.id |  |
| `subtotalCents` | INTEGER | да |  |  | сума преди отстъпка (с ДДС) |
| `discountCents` | INTEGER | да | `0` |  |  |
| `totalCents` | INTEGER | да |  |  | крайна сума (с ДДС) |
| `totalBgnCents` | INTEGER | да |  |  | информативно: сумата в лв. по курс 1.95583 (двойно обозначаване) |
| `paymentType` | TEXT | да |  |  | CASH \| CARD \| MIXED |
| `cashCents` | INTEGER | да | `0` |  | платено в брой |
| `cardCents` | INTEGER | да | `0` |  | платено с карта |
| `changeCents` | INTEGER | да | `0` |  | ресто |
| `fiscalReceiptNo` | TEXT | не |  |  | номер на фискалния бон от ФУ |
| `fiscalDeviceSn` | TEXT | не |  |  | сериен номер на ФУ, издало бона |
| `terminalRef` | TEXT | не |  |  | референция от ПОС терминала (RRN/Auth code) |
| `stornoOfId` | TEXT | не |  | уникален, → Sale.id | Сторно връзки |
| `stornoReason` | TEXT | не |  |  | OPERATOR_ERROR \| RETURN \| TAX_BASE_CUT (чл. 31 Н-18) |
| `draftId` | TEXT | не |  | уникален, → SaleDraft.id | Прил. № 29, т. 9 и 18.1: откритата продажба (УНП, час на откриване), обект и работно място |
| `openedAt` | DATETIME | не |  |  |  |
| `storeCode` | TEXT | да | `"1"` |  |  |
| `workplaceCode` | TEXT | да | `"1"` |  |  |
| `createdAt` | DATETIME | да | часът на записа |  |  |

**Връзки:**

- `shift` → Shift (една) по `shiftId`
- `user` → User (една) по `userId`
- `customer` → Customer (една или нито една) по `customerId`
- `stornoOf` → Sale (една или нито една) по `stornoOfId`
- `stornoBy` → Sale (една или нито една)
- `draft` → SaleDraft (една или нито една) по `draftId`
- `items` → SaleItem (много)
- `invoice` → Invoice (една или нито една)

**Индекси:**

- индекс: `shiftId`
- индекс: `createdAt`

## Фактури (чл. 114 ЗДДС)

### Invoice

Издава се към приключена продажба; последователна възходяща номерация без пропуски. Сумите се снемат от продажбата; купувачът се въвежда при издаване.

| Поле | Тип | Задължително | По подразбиране | Ключ / връзка | Описание |
|---|---|---|---|---|---|
| `id` | TEXT | да | генериран идентификатор | първичен ключ |  |
| `number` | INTEGER | да |  | уникален | 10-разряден пореден номер (чл. 114, ал. 1, т. 2) |
| `saleId` | TEXT | да |  | уникален, → Sale.id |  |
| `userId` | TEXT | да |  | → User.id |  |
| `buyerName` | TEXT | да |  |  | Получател (купувач) |
| `buyerEik` | TEXT | не |  |  | ЕИК/Булстат |
| `buyerVat` | TEXT | не |  |  | ЗДДС номер |
| `buyerAddress` | TEXT | не |  |  |  |
| `buyerMol` | TEXT | не |  |  | МОЛ / получил фактурата |
| `netCents` | INTEGER | да |  |  | Снимка на сумите към момента на издаване данъчна основа (без ДДС) |
| `vatCents` | INTEGER | да |  |  | начислен ДДС |
| `totalCents` | INTEGER | да |  |  | обща сума (с ДДС) |
| `totalBgnCents` | INTEGER | да |  |  | информативно в лева по курс 1.95583 |
| `createdAt` | DATETIME | да | часът на записа |  |  |

**Връзки:**

- `sale` → Sale (една) по `saleId`
- `user` → User (една) по `userId`

**Индекси:**

- индекс: `createdAt`

### SaleItem

Ред от приключена продажба със снимка на името, цената и ДДС групата към момента на продажбата.

| Поле | Тип | Задължително | По подразбиране | Ключ / връзка | Описание |
|---|---|---|---|---|---|
| `id` | TEXT | да | генериран идентификатор | първичен ключ |  |
| `saleId` | TEXT | да |  | → Sale.id |  |
| `productId` | TEXT | да |  | → Product.id |  |
| `pluSnapshot` | INTEGER | да | `0` |  | Снимка на момента на продажбата — цените в каталога се менят код на стоката към момента (т. 18.3) |
| `nameSnapshot` | TEXT | да |  |  |  |
| `unitPriceCents` | INTEGER | да |  |  |  |
| `qtyMilli` | INTEGER | да |  |  | 1000 = 1 бр. / 1.000 кг |
| `vatGroup` | TEXT | да |  |  | A\|B\|C\|D |
| `vatRatePermille` | INTEGER | да |  |  | ставка в промили към момента (200 = 20%) |
| `discountPermille` | INTEGER | да | `0` |  |  |
| `discountCents` | INTEGER | да | `0` |  | абсолютна отстъпка по реда (MxN), подава се към ФУ като сума |
| `priceLockedCents` | INTEGER | не |  |  | заключена редова сума (ценови баркод, свободна продажба) — към ФУ като 1 × сумата |
| `totalCents` | INTEGER | да |  |  | редова сума с ДДС след отстъпка |
| `vatCents` | INTEGER | да |  |  | включен ДДС в реда |

**Връзки:**

- `sale` → Sale (една) по `saleId`
- `product` → Product (една) по `productId`

**Индекси:**

- индекс: `saleId`
- индекс: `productId`

## Склад

### Supplier

Доставчик на стоки (ЕИК, ДДС номер, контакти).

| Поле | Тип | Задължително | По подразбиране | Ключ / връзка | Описание |
|---|---|---|---|---|---|
| `id` | TEXT | да | генериран идентификатор | първичен ключ |  |
| `name` | TEXT | да |  |  |  |
| `eik` | TEXT | не |  |  | ЕИК/Булстат |
| `vatNumber` | TEXT | не |  |  | ЗДДС номер |
| `phone` | TEXT | не |  |  |  |
| `email` | TEXT | не |  |  |  |
| `note` | TEXT | не |  |  |  |
| `active` | BOOLEAN | да | `true` |  |  |
| `deactivatedAt` | DATETIME | не |  |  | т. 18.9 |
| `createdAt` | DATETIME | да | часът на записа |  |  |
| `updatedAt` | DATETIME | да | часът на последната промяна |  |  |

**Връзки:**

- `deliveries` → Delivery (много)

### Delivery

Доставка по документ от доставчик — увеличава наличностите.

| Поле | Тип | Задължително | По подразбиране | Ключ / връзка | Описание |
|---|---|---|---|---|---|
| `id` | TEXT | да | генериран идентификатор | първичен ключ |  |
| `supplierId` | TEXT | да |  | → Supplier.id |  |
| `userId` | TEXT | да |  | → User.id |  |
| `docNumber` | TEXT | да |  |  | номер на фактура/стокова разписка |
| `docDate` | DATETIME | не |  |  | дата на фактурата за доставка (т. 18.6) |
| `totalCostCents` | INTEGER | да |  |  | общо доставна стойност (без ДДС, след отстъпка) |
| `discountCents` | INTEGER | да | `0` |  | отстъпка по доставката (без ДДС) |
| `vatCents` | INTEGER | да | `0` |  | ДДС по доставката |
| `paymentType` | TEXT | да | `"BANK"` |  | CASH \| BANK \| CARD \| DEFERRED |
| `note` | TEXT | не |  |  |  |
| `createdAt` | DATETIME | да | часът на записа |  |  |

**Връзки:**

- `supplier` → Supplier (една) по `supplierId`
- `user` → User (една) по `userId`
- `items` → DeliveryItem (много)

**Индекси:**

- индекс: `supplierId`
- индекс: `createdAt`

### DeliveryItem

Ред от доставка: количество, доставна цена, партида и срок на годност.

| Поле | Тип | Задължително | По подразбиране | Ключ / връзка | Описание |
|---|---|---|---|---|---|
| `id` | TEXT | да | генериран идентификатор | първичен ключ |  |
| `deliveryId` | TEXT | да |  | → Delivery.id |  |
| `productId` | TEXT | да |  | → Product.id |  |
| `qtyMilli` | INTEGER | да |  |  |  |
| `unitCostCents` | INTEGER | да |  |  | доставна цена за единица (без ДДС, без отстъпка) |
| `discountCents` | INTEGER | да | `0` |  | отстъпка по реда (без ДДС) |
| `vatCents` | INTEGER | да | `0` |  | ДДС по реда |
| `expiryDate` | DATETIME | не |  |  | срок на годност на партидата |
| `batchNumber` | TEXT | не |  |  |  |

**Връзки:**

- `delivery` → Delivery (една) по `deliveryId`
- `product` → Product (една) по `productId`

**Индекси:**

- индекс: `deliveryId`

### Stocktake

Ревизия (инвентаризация) на наличностите.

| Поле | Тип | Задължително | По подразбиране | Ключ / връзка | Описание |
|---|---|---|---|---|---|
| `id` | TEXT | да | генериран идентификатор | първичен ключ |  |
| `userId` | TEXT | да |  | → User.id |  |
| `startedAt` | DATETIME | да | часът на записа |  |  |
| `completedAt` | DATETIME | не |  |  |  |
| `note` | TEXT | не |  |  |  |

**Връзки:**

- `user` → User (една) по `userId`
- `items` → StocktakeItem (много)

### StocktakeItem

Ред от ревизия: очаквано и преброено количество.

| Поле | Тип | Задължително | По подразбиране | Ключ / връзка | Описание |
|---|---|---|---|---|---|
| `id` | TEXT | да | генериран идентификатор | първичен ключ |  |
| `stocktakeId` | TEXT | да |  | → Stocktake.id |  |
| `productId` | TEXT | да |  | → Product.id |  |
| `expectedMilli` | INTEGER | да |  |  | по системата |
| `countedMilli` | INTEGER | да |  |  | преброено |

**Връзки:**

- `stocktake` → Stocktake (една) по `stocktakeId`
- `product` → Product (една) по `productId`

**Индекси:**

- индекс: `stocktakeId`

### WriteOff

Брак или липса — намалява наличностите с причина.

| Поле | Тип | Задължително | По подразбиране | Ключ / връзка | Описание |
|---|---|---|---|---|---|
| `id` | TEXT | да | генериран идентификатор | първичен ключ |  |
| `userId` | TEXT | да |  | → User.id |  |
| `reason` | TEXT | да |  |  | изтекъл срок, повреда, липса… |
| `createdAt` | DATETIME | да | часът на записа |  |  |

**Връзки:**

- `user` → User (една) по `userId`
- `items` → WriteOffItem (много)

### WriteOffItem

Ред от брак: количество и стойност.

| Поле | Тип | Задължително | По подразбиране | Ключ / връзка | Описание |
|---|---|---|---|---|---|
| `id` | TEXT | да | генериран идентификатор | първичен ключ |  |
| `writeOffId` | TEXT | да |  | → WriteOff.id |  |
| `productId` | TEXT | да |  | → Product.id |  |
| `qtyMilli` | INTEGER | да |  |  |  |

**Връзки:**

- `writeOff` → WriteOff (една) по `writeOffId`
- `product` → Product (една) по `productId`

**Индекси:**

- индекс: `writeOffId`

### StockMovement

Единна складова книга — всяка промяна на наличност минава оттук (одитна следа)

| Поле | Тип | Задължително | По подразбиране | Ключ / връзка | Описание |
|---|---|---|---|---|---|
| `id` | TEXT | да | генериран идентификатор | първичен ключ |  |
| `productId` | TEXT | да |  | → Product.id |  |
| `type` | TEXT | да |  |  | SALE\|STORNO\|DELIVERY\|STOCKTAKE\|WRITEOFF\|MANUAL |
| `qtyMilliDelta` | INTEGER | да |  |  | +постъпление / −изписване |
| `refId` | TEXT | не |  |  | id на продажба/доставка/ревизия/брак |
| `note` | TEXT | не |  |  |  |
| `createdAt` | DATETIME | да | часът на записа |  |  |

**Връзки:**

- `product` → Product (една) по `productId`

**Индекси:**

- индекс: `productId`
- индекс: `createdAt`

## Настройки и одит

### Setting

key → JSON стойност: данни за търговеца (име, ЕИК, ЗДДС №, адрес, обект), ДДС ставки по групи, конфигурация на ФУ и ПОС терминал, двойно обозначаване…

| Поле | Тип | Задължително | По подразбиране | Ключ / връзка | Описание |
|---|---|---|---|---|---|
| `key` | TEXT | да |  | първичен ключ |  |
| `value` | TEXT | да |  |  | JSON |
| `updatedAt` | DATETIME | да | часът на последната промяна |  |  |

### AuditLog

Одиторска следа в стил СУПТО: без изтриване, само добавяне

| Поле | Тип | Задължително | По подразбиране | Ключ / връзка | Описание |
|---|---|---|---|---|---|
| `id` | TEXT | да | генериран идентификатор | първичен ключ |  |
| `userId` | TEXT | не |  | → User.id |  |
| `action` | TEXT | да |  |  | напр. SALE_COMPLETED, STORNO, PRICE_CHANGE, LOGIN, SHIFT_OPEN… |
| `entity` | TEXT | не |  |  |  |
| `entityId` | TEXT | не |  |  |  |
| `detail` | TEXT | не |  |  | JSON с подробности |
| `unp` | TEXT | не |  |  | т. 15, б. „б“: УНП при сторниране и анулиране — отделно поле, не само в JSON-а |
| `prevHash` | TEXT | не |  |  | хеш верига: SHA-256(prevHash + записа) — подмяна или изтрит запис се откриват |
| `hash` | TEXT | не |  |  |  |
| `createdAt` | DATETIME | да | часът на записа |  |  |

**Връзки:**

- `user` → User (една или нито една) по `userId`

**Индекси:**

- индекс: `createdAt`
- индекс: `action`
- индекс: `unp`
- индекс: `userId`

## Открита продажба (Прил. № 29, т. 8, 9, 9.1, 12)

### SaleDraft

Продажбата съществува в базата от първия въведен артикул: има УНП, час на откриване и оператор. Редовете се записват при всяка промяна; всяко намаление/премахване оставя CancelledItem. Плащането я превежда OPEN → PAYING → COMPLETED (Sale) атомарно.

| Поле | Тип | Задължително | По подразбиране | Ключ / връзка | Описание |
|---|---|---|---|---|---|
| `id` | TEXT | да | генериран идентификатор | първичен ключ |  |
| `unp` | TEXT | да |  | уникален |  |
| `unpSeq` | INTEGER | да |  |  | 7-разрядният пореден № — отделен брояч за всеки ИН на ФУ |
| `fiscalSerial` | TEXT | да |  |  | ИН на ФУ, получен при последната успешна връзка (т. 8) |
| `userId` | TEXT | да |  | → User.id |  |
| `operatorCode` | INTEGER | да |  |  |  |
| `shiftId` | TEXT | да |  |  |  |
| `storeCode` | TEXT | да | `"1"` |  |  |
| `workplaceCode` | TEXT | да | `"1"` |  |  |
| `state` | TEXT | да | `"OPEN"` |  | OPEN \| HELD \| PAYING \| RECONCILE \| COMPLETED \| CANCELLED |
| `paymentJson` | TEXT | не |  |  | намерение за плащане и резултат от ФУ — пазят се, за да може прекъснато плащане да се свери |
| `payingAt` | DATETIME | не |  |  |  |
| `fiscalReceiptNo` | TEXT | не |  |  |  |
| `fiscalDeviceSn` | TEXT | не |  |  |  |
| `terminalRef` | TEXT | не |  |  |  |
| `customerCard` | TEXT | не |  |  |  |
| `heldAt` | DATETIME | не |  |  |  |
| `openedAt` | DATETIME | да |  |  |  |
| `closedAt` | DATETIME | не |  |  |  |
| `createdAt` | DATETIME | да | часът на записа |  |  |
| `updatedAt` | DATETIME | да | часът на последната промяна |  |  |

**Връзки:**

- `user` → User (една) по `userId`
- `lines` → SaleDraftLine (много)
- `cancelled` → CancelledItem (много)
- `sale` → Sale (една или нито една)

**Индекси:**

- уникален: `fiscalSerial`, `unpSeq`
- индекс: `userId`, `state`

### SaleDraftLine

Ред от открита продажба — изчислява се отново на сървъра при всяка промяна.

| Поле | Тип | Задължително | По подразбиране | Ключ / връзка | Описание |
|---|---|---|---|---|---|
| `id` | TEXT | да | генериран идентификатор | първичен ключ |  |
| `draftId` | TEXT | да |  | → SaleDraft.id |  |
| `uid` | TEXT | да |  |  | идентификатор на реда от екрана |
| `position` | INTEGER | да |  |  |  |
| `productId` | TEXT | да |  | → Product.id |  |
| `qtyMilli` | INTEGER | да |  |  |  |
| `discountPermille` | INTEGER | да | `0` |  |  |
| `priceLockedCents` | INTEGER | не |  |  | ценови баркод / свободна продажба |
| `lockBarcode` | TEXT | не |  |  | ценовият баркод, от който идва заключената цена (сървърът го проверява) |

**Връзки:**

- `draft` → SaleDraft (една) по `draftId`
- `product` → Product (една) по `productId`

**Индекси:**

- уникален: `draftId`, `uid`

### CancelledItem

Анулиран артикул от открита, неприключена продажба (т. 12, т. 18.5).

| Поле | Тип | Задължително | По подразбиране | Ключ / връзка | Описание |
|---|---|---|---|---|---|
| `id` | TEXT | да | генериран идентификатор | първичен ключ |  |
| `draftId` | TEXT | да |  | → SaleDraft.id |  |
| `unp` | TEXT | да |  |  |  |
| `productId` | TEXT | да |  | → Product.id |  |
| `plu` | INTEGER | да |  |  |  |
| `name` | TEXT | да |  |  |  |
| `qtyMilli` | INTEGER | да |  |  |  |
| `unitPriceCents` | INTEGER | да |  |  | единична цена с ДДС, без отстъпка |
| `discountCents` | INTEGER | да |  |  | отстъпка (с ДДС) |
| `vatGroup` | TEXT | да |  |  |  |
| `vatRatePermille` | INTEGER | да |  |  |  |
| `vatCents` | INTEGER | да |  |  |  |
| `totalCents` | INTEGER | да |  |  | с ДДС, след отстъпка |
| `kind` | TEXT | да |  |  | LINE (ред/количество) \| FULL (цялата продажба) |
| `userId` | TEXT | да |  | → User.id |  |
| `operatorCode` | INTEGER | да |  |  |  |
| `openedAt` | DATETIME | да |  |  |  |
| `cancelledAt` | DATETIME | да |  |  |  |

**Връзки:**

- `draft` → SaleDraft (една) по `draftId`
- `product` → Product (една) по `productId`
- `user` → User (една) по `userId`

**Индекси:**

- индекс: `draftId`
- индекс: `cancelledAt`
