-- ============================================================================
--  Балкан — таблици за трите заробващи loop-а (bg_territory / bg_economy / bg_reputation)
--  Изпълни СЛЕД базовата схема на qbx_core/ox (01_base от техните ресурси).
--  Idempotent: CREATE TABLE IF NOT EXISTS.
-- ============================================================================

-- LOOP A — Динамична територия -------------------------------------------------

-- Текущ контрол на всяка зона (една зона => една контролираща фракция или NULL).
CREATE TABLE IF NOT EXISTS `bg_territory` (
    `zone_id`      VARCHAR(32)  NOT NULL,
    `owner`        VARCHAR(32)  NULL,               -- ключ на фракция или NULL (спорна/ничия)
    `updated_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`zone_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Точки на влияние на всяка фракция във всяка зона (нормализирано).
CREATE TABLE IF NOT EXISTS `bg_territory_influence` (
    `zone_id`   VARCHAR(32) NOT NULL,
    `faction`   VARCHAR(32) NOT NULL,
    `points`    INT         NOT NULL DEFAULT 0,
    PRIMARY KEY (`zone_id`, `faction`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- LOOP B — Жива икономика + офлайн бизнеси -------------------------------------

-- Цена/търсене на всяка стока (една глобална пазарна линия на стока).
CREATE TABLE IF NOT EXISTS `bg_market` (
    `good`       VARCHAR(32) NOT NULL,
    `price`      INT         NOT NULL,              -- текуща цена (в стотинки? не — в цели лв/долари)
    `demand`     INT         NOT NULL DEFAULT 100,  -- индекс на търсене (100 = база)
    `updated_at` TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`good`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Бизнеси, притежавани от играчи. Начисляват приход офлайн (cron).
CREATE TABLE IF NOT EXISTS `bg_businesses` (
    `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `owner`        VARCHAR(64)  NOT NULL,           -- citizenid на собственика
    `type`        VARCHAR(32)  NOT NULL,            -- businessType (convenience/bar/...)
    `zone_id`      VARCHAR(32)  NOT NULL,           -- в коя зона е (за control bonus)
    `balance`      INT          NOT NULL DEFAULT 0, -- натрупан, но неприбран приход
    `level`        INT          NOT NULL DEFAULT 1,
    `last_payout`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `created_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_owner` (`owner`),
    KEY `idx_zone`  (`zone_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- LOOP C — Репутация / наследство ---------------------------------------------

-- Репутация на играч спрямо всяка фракция. Светът (NPC цени/достъп) реагира на нея.
CREATE TABLE IF NOT EXISTS `bg_reputation` (
    `citizenid`   VARCHAR(64) NOT NULL,
    `faction`     VARCHAR(32) NOT NULL,
    `rep`         INT         NOT NULL DEFAULT 0,
    `updated_at`  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`citizenid`, `faction`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Онбординг: помним дали играчът е минал tutorial-а (bg_spawn).
CREATE TABLE IF NOT EXISTS `bg_onboarding` (
    `citizenid`     VARCHAR(64) NOT NULL,
    `tutorial_done` TINYINT(1)  NOT NULL DEFAULT 0,
    `first_join`    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`citizenid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
