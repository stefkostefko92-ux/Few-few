-- CARSIGMA — D1 (SQLite) схема, v0000_init
-- ---------------------------------------------------------------------------
-- Платформа за прозрачност и интелигентност на пазара на автомобили.
-- Моделирана по патерна на СИГМА (midt-bg/sigma): отворени данни → нормализиран
-- граф → прекалкулирани rollups → FTS5 търсене → SSR explorer.
--
-- Граф на СИГМА:   институция → поръчка → договор → фирма
-- Граф на CARSIGMA: продавач  → обява    → автомобил → събитие/собственик
--
-- Конвенции (както в СИГМА):
--   * TEXT първични ключове (стабилни идентификатори от източника или surrogate).
--   * Канонична валута EUR (`*_eur`), изключва редове с value_flag = 'suspect'.
--   * Флагове за качество: 'ok' | 'review' | 'suspect'.
--   * Рисково индексиране: 'green' | 'yellow' | 'red'.
--   * Дати се пазят като ISO TEXT (YYYY-MM-DD / RFC3339), за съвместимост с D1.
--   * Rollup таблиците се пресъздават от ETL след всяко зареждане.
--
-- Структура: домейн таблици → rollups/search → reference данни → индекси.
-- ===========================================================================

PRAGMA foreign_keys = ON;

-- ===========================================================================
-- ДОМЕЙН ТАБЛИЦИ (това, което explorer-ът чете)
-- ===========================================================================

-- Продавачи: дилъри, вносители, частни лица, автокъщи, търгове.
-- Аналог на СИГМА `authorities`.
CREATE TABLE sellers (
  id              TEXT PRIMARY KEY,            -- стабилен идентификатор
  name            TEXT NOT NULL,
  kind            TEXT,                        -- dealer | importer | private | auction | service
  eik             TEXT,                        -- ЕИК/Булстат за фирми
  eik_normalized  TEXT,
  eik_valid       INTEGER DEFAULT 0,           -- 0/1
  -- местоположение
  nuts            TEXT,                        -- NUTS3 код (напр. BG411)
  region          TEXT,
  municipality    TEXT,
  settlement      TEXT,
  address         TEXT,
  -- контакт
  contact_email   TEXT,
  contact_phone   TEXT,
  website         TEXT,
  created_at      TEXT,
  updated_at      TEXT
);

-- Собственици (история на собствеността). Аналог на СИГМА `bidders`.
-- За физически лица `name` може да е заличено по съображения за лични данни.
CREATE TABLE owners (
  id              TEXT PRIMARY KEY,
  name            TEXT,                        -- може да е NULL/маскирано за лица
  kind            TEXT,                        -- person | company | institution
  eik             TEXT,                        -- ЕИК за фирми
  eik_normalized  TEXT,
  eik_valid       INTEGER DEFAULT 0,
  nuts            TEXT,
  region          TEXT,
  settlement      TEXT,
  created_at      TEXT
);

-- Автомобили — централната същност. Аналог на СИГМА `tenders`/`contracts`.
CREATE TABLE vehicles (
  id                      TEXT PRIMARY KEY,    -- surrogate или нормализиран VIN
  vin                     TEXT,                -- може да липсва в обяви
  vin_normalized          TEXT,
  plate                   TEXT,                -- рег. номер (нормализиран)
  -- идентификация на модела
  make                    TEXT,                -- марка
  model                   TEXT,
  variant                 TEXT,                -- комплектация/модификация
  model_key               TEXT,               -- FK -> makes_models.model_key (make|model)
  model_year              INTEGER,
  first_registration_date TEXT,
  -- технически данни
  fuel_type               TEXT,                -- petrol | diesel | hybrid | ev | lpg | ...
  gearbox                 TEXT,                -- manual | automatic
  body_type               TEXT,                -- sedan | hatch | suv | combi | ...
  drivetrain              TEXT,                -- fwd | rwd | awd
  engine_cc               INTEGER,
  power_hp                INTEGER,
  color                   TEXT,
  origin_country          TEXT,                -- държава на внос
  -- текущо състояние (попълва се от ETL/rollup)
  current_owner_id        TEXT,               -- FK -> owners.id
  current_seller_id       TEXT,               -- FK -> sellers.id (активна обява)
  latest_mileage_km       INTEGER,
  latest_price_eur        REAL,
  status                  TEXT,                -- active | sold | archived | unknown
  -- качество и риск
  mileage_flag            TEXT DEFAULT 'ok',   -- ok | review | suspect (върнат пробег)
  price_flag              TEXT DEFAULT 'ok',   -- ok | review | suspect (аномална цена)
  vin_flag                TEXT DEFAULT 'ok',   -- ok | review | suspect (клониран/невалиден VIN)
  risk_level              TEXT DEFAULT 'green',-- green | yellow | red (агрегиран риск)
  risk_reasons            TEXT,                -- JSON масив с причините
  -- проследимост
  first_seen              TEXT,
  last_seen               TEXT,
  created_at              TEXT,
  updated_at              TEXT,
  FOREIGN KEY (current_owner_id)  REFERENCES owners(id),
  FOREIGN KEY (current_seller_id) REFERENCES sellers(id)
);

-- Обяви на пазара през времето. Аналог на СИГМА `tenders`/`lots`.
-- Една кола може да има множество обяви (различни продавачи/моменти/цени).
CREATE TABLE listings (
  id              TEXT PRIMARY KEY,
  source_id       TEXT UNIQUE,                 -- id от източника
  source          TEXT,                        -- mobile_bg | cars_bg | olx | ...
  vehicle_id      TEXT,                        -- FK -> vehicles.id
  seller_id       TEXT,                        -- FK -> sellers.id
  title           TEXT,
  url             TEXT,
  -- цена (с каноничен EUR както в СИГМА)
  price_amount    REAL,
  price_currency  TEXT,
  price_eur       REAL,                        -- каноничен EUR, изключва suspect редове
  fx_converted    INTEGER DEFAULT 0,
  fx_rate         REAL,
  -- състояние на колата в обявата
  mileage_km      INTEGER,
  condition       TEXT,                        -- new | used | damaged | for_parts
  -- време и място
  listed_at       TEXT,
  delisted_at     TEXT,
  published_at    TEXT,
  location_nuts   TEXT,
  settlement      TEXT,
  -- съдържание и качество
  description     TEXT,
  photo_count     INTEGER,
  price_flag      TEXT DEFAULT 'ok',           -- ok | review | suspect
  mileage_flag    TEXT DEFAULT 'ok',
  is_active       INTEGER DEFAULT 1,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
  FOREIGN KEY (seller_id)  REFERENCES sellers(id)
);

-- Времева линия на събитията по колата. Аналог на СИГМА `amendments`.
-- ГТП, катастрофа, отчетен пробег, сервиз, recall, смяна на собственик, внос.
CREATE TABLE events (
  id              TEXT PRIMARY KEY,
  natural_key     TEXT UNIQUE,                 -- дедупликация (vin|type|date|...)
  vehicle_id      TEXT,                        -- FK -> vehicles.id
  event_type      TEXT,                        -- inspection | accident | mileage_reading
                                               -- | service | recall | ownership_change
                                               -- | import | theft_report | listing
  event_date      TEXT,
  mileage_km      INTEGER,                     -- отчетен пробег към събитието
  -- проследяване на промяна (аналог на value_before/after/delta в СИГМА)
  value_before    REAL,
  value_after     REAL,
  value_delta     REAL,
  owner_id        TEXT,                        -- FK -> owners.id (при смяна на собственик)
  seller_id       TEXT,                        -- FK -> sellers.id (при сервиз/обява)
  description     TEXT,
  source          TEXT,                        -- kat | gtp | insurer | rapex | listing | ...
  document_number TEXT,
  published_at    TEXT,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
  FOREIGN KEY (owner_id)   REFERENCES owners(id),
  FOREIGN KEY (seller_id)  REFERENCES sellers(id)
);

-- ===========================================================================
-- ROLLUPS И ТЪРСЕНЕ (прекалкулирани от ETL — explorer-ът само ги чете)
-- ===========================================================================

-- Единичен ред (id=1) с KPI за началната страница. Аналог на `home_totals`.
CREATE TABLE home_totals (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  vehicles          INTEGER,
  listings          INTEGER,
  active_listings   INTEGER,
  sellers           INTEGER,
  owners            INTEGER,
  suspect           INTEGER,                   -- брой редове с риск/съмнение
  red_vehicles      INTEGER,                   -- risk_level = 'red'
  median_price_eur  REAL,
  first_date        TEXT,
  last_date         TEXT,
  as_of             TEXT,
  refreshed_at      TEXT
);

-- Агрегация по модел. Аналог на СИГМА `sector_totals` (CPV) и `company_totals`.
CREATE TABLE model_totals (
  model_key         TEXT PRIMARY KEY,          -- make|model
  make              TEXT,
  model             TEXT,
  segment           TEXT,
  listings          INTEGER,
  vehicles          INTEGER,
  median_price_eur  REAL,
  min_price_eur     REAL,
  max_price_eur     REAL,
  avg_mileage_km    REAL,
  suspect           INTEGER,
  first_date        TEXT,
  last_date         TEXT
);

-- Агрегация по продавач. Аналог на СИГМА `authority_totals`.
CREATE TABLE seller_totals (
  seller_id         TEXT PRIMARY KEY,
  name              TEXT,
  kind              TEXT,
  settlement        TEXT,
  region            TEXT,
  listings          INTEGER,
  vehicles          INTEGER,
  active_listings   INTEGER,
  median_price_eur  REAL,
  red_listings      INTEGER,                   -- брой обяви с риск 'red'
  suspect_share     REAL,                      -- дял съмнителни обяви (0..1)
  primary_segment   TEXT,
  first_date        TEXT,
  last_date         TEXT
);

-- Агрегация по собственик (за история/връзки).
CREATE TABLE owner_totals (
  owner_id          TEXT PRIMARY KEY,
  name              TEXT,
  kind              TEXT,
  settlement        TEXT,
  vehicles_owned    INTEGER,
  first_date        TEXT,
  last_date         TEXT
);

-- Агрегация по пазарен сегмент. Аналог на `sector_totals`.
CREATE TABLE segment_totals (
  segment           TEXT PRIMARY KEY,          -- city | compact | suv | luxury | ...
  listings          INTEGER,
  vehicles          INTEGER,
  median_price_eur  REAL
);

-- Граф продавач ↔ модел (кой продавач какви модели върти).
-- Аналог на СИГМА `flow_pairs` (институция ↔ доставчик).
CREATE TABLE seller_model_flows (
  seller_id         TEXT,
  model_key         TEXT,
  seller_name       TEXT,
  seller_kind       TEXT,
  make              TEXT,
  model             TEXT,
  listings          INTEGER,
  median_price_eur  REAL,
  PRIMARY KEY (seller_id, model_key)
);

-- История на цените по модел и период (за графики на трендове).
CREATE TABLE price_history (
  model_key         TEXT,
  period            TEXT,                       -- YYYY-MM
  median_price_eur  REAL,
  listings          INTEGER,
  avg_mileage_km    REAL,
  PRIMARY KEY (model_key, period)
);

-- Глобални броячи за филтри (фасети). Аналог на СИГМА `facet_counts`.
CREATE TABLE facet_counts (
  facet             TEXT,                       -- fuel | gearbox | body | year | region | risk
  key               TEXT,
  listings          INTEGER,
  value_eur         REAL,
  PRIMARY KEY (facet, key)
);

-- Full-text търсене (FTS5), unicode61 с премахната диакритика — както в СИГМА.
-- Едно търсене покрива VIN, рег. номер, марка/модел, продавач.
CREATE VIRTUAL TABLE search_index USING fts5(
  title,                                        -- индексирано
  ident,                                        -- индексирано (VIN/рег.№/ЕИК)
  kind        UNINDEXED,                        -- vehicle | seller | owner | listing
  ref         UNINDEXED,                        -- id за линк
  subtitle    UNINDEXED,
  amount      UNINDEXED,
  tokenize = "unicode61 remove_diacritics 2"
);

-- ===========================================================================
-- REFERENCE ДАННИ
-- ===========================================================================

-- Каталог марки/модели (аналог на CPV номенклатурата в СИГМА).
CREATE TABLE makes_models (
  model_key   TEXT PRIMARY KEY,                 -- make|model
  make        TEXT NOT NULL,
  model       TEXT NOT NULL,
  segment     TEXT,                             -- city | compact | suv | ...
  body_type   TEXT
);

-- Валутни курсове към EUR (както в СИГМА `fx_rates`).
CREATE TABLE fx_rates (
  base_currency TEXT,
  rate_date     TEXT,
  eur_per_unit  REAL,
  source        TEXT,
  fetched_at    TEXT,
  PRIMARY KEY (base_currency, rate_date)
);

-- NUTS региони (както в СИГМА `nuts_regions`).
CREATE TABLE nuts_regions (
  nuts3       TEXT PRIMARY KEY,                 -- напр. BG411
  nuts3_name  TEXT,
  nuts2       TEXT,
  nuts2_name  TEXT,
  nuts1       TEXT,
  nuts1_name  TEXT
);

-- Свежест на данните по източник (както в СИГМА `data_freshness`).
CREATE TABLE data_freshness (
  source        TEXT PRIMARY KEY,               -- listings | kat | gtp | insurer | rapex
  as_of         TEXT,
  rows          INTEGER,
  refreshed_at  TEXT
);

-- ===========================================================================
-- ИНДЕКСИ
-- ===========================================================================

-- Основни сортирания за листингите (низходящо по цена/дата).
CREATE INDEX idx_listings_price_eur   ON listings(price_eur DESC);
CREATE INDEX idx_listings_listed_at   ON listings(listed_at DESC);
CREATE INDEX idx_listings_price_flag  ON listings(price_flag);
CREATE INDEX idx_listings_vehicle     ON listings(vehicle_id);
CREATE INDEX idx_listings_seller      ON listings(seller_id);
CREATE INDEX idx_listings_active      ON listings(is_active);

-- Филтри/сортирания по автомобили.
CREATE INDEX idx_vehicles_model_key   ON vehicles(model_key);
CREATE INDEX idx_vehicles_make_model  ON vehicles(make, model);
CREATE INDEX idx_vehicles_year        ON vehicles(model_year DESC);
CREATE INDEX idx_vehicles_risk        ON vehicles(risk_level);
CREATE INDEX idx_vehicles_vin         ON vehicles(vin_normalized);
CREATE INDEX idx_vehicles_price_eur   ON vehicles(latest_price_eur DESC);

-- Времева линия по кола.
CREATE INDEX idx_events_vehicle       ON events(vehicle_id);
CREATE INDEX idx_events_date          ON events(event_date DESC);
CREATE INDEX idx_events_type          ON events(event_type);

-- Връзки/референции.
CREATE INDEX idx_sellers_eik          ON sellers(eik_normalized);
CREATE INDEX idx_owners_eik           ON owners(eik_normalized);

-- Сортирания за rollup листингите (както в СИГМА — won_eur/spent_eur DESC).
CREATE INDEX idx_model_totals_price   ON model_totals(median_price_eur DESC);
CREATE INDEX idx_seller_totals_list   ON seller_totals(listings DESC);
CREATE INDEX idx_flows_price          ON seller_model_flows(median_price_eur DESC);
