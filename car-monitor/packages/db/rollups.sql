-- CAR MONITOR — пресъздаване на derived (rollup) таблиците от домейн данните.
-- Пуска се след всяко зареждане (CLI import или ETL refresh), аналог на
-- "rebuild derived tables" в СИГМА. Медианите се смятат точно през window функции.

DELETE FROM home_totals;
DELETE FROM model_totals;
DELETE FROM seller_totals;
DELETE FROM owner_totals;
DELETE FROM segment_totals;
DELETE FROM seller_model_flows;
DELETE FROM price_history;
DELETE FROM facet_counts;
DELETE FROM search_index;

-- model_totals (медиана по цена на ниво модел) -----------------------------
INSERT INTO model_totals (model_key, make, model, segment, listings, vehicles,
  median_price_eur, min_price_eur, max_price_eur, avg_mileage_km, suspect,
  first_date, last_date)
WITH ranked AS (
  SELECT model_key, latest_price_eur AS p,
         ROW_NUMBER() OVER (PARTITION BY model_key ORDER BY latest_price_eur) AS rn,
         COUNT(*)     OVER (PARTITION BY model_key) AS c
  FROM vehicles
  WHERE model_key IS NOT NULL AND latest_price_eur IS NOT NULL
),
median AS (
  SELECT model_key, AVG(p) AS median_price_eur
  FROM ranked WHERE rn IN ((c + 1) / 2, (c + 2) / 2)
  GROUP BY model_key
),
agg AS (
  SELECT v.model_key,
         MAX(mm.make) AS make, MAX(mm.model) AS model, MAX(mm.segment) AS segment,
         COUNT(*) AS vehicles,
         MIN(v.latest_price_eur) AS min_price_eur,
         MAX(v.latest_price_eur) AS max_price_eur,
         AVG(v.latest_mileage_km) AS avg_mileage_km,
         SUM(CASE WHEN v.risk_level <> 'green' THEN 1 ELSE 0 END) AS suspect,
         MIN(v.last_seen) AS first_date, MAX(v.last_seen) AS last_date
  FROM vehicles v LEFT JOIN makes_models mm ON mm.model_key = v.model_key
  WHERE v.model_key IS NOT NULL
  GROUP BY v.model_key
)
SELECT a.model_key, a.make, a.model, a.segment,
       (SELECT COUNT(*) FROM listings l JOIN vehicles v2 ON v2.id = l.vehicle_id
        WHERE v2.model_key = a.model_key) AS listings,
       a.vehicles, m.median_price_eur, a.min_price_eur, a.max_price_eur,
       a.avg_mileage_km, a.suspect, a.first_date, a.last_date
FROM agg a LEFT JOIN median m ON m.model_key = a.model_key;

-- seller_totals ------------------------------------------------------------
INSERT INTO seller_totals (seller_id, name, kind, settlement, region, listings,
  vehicles, active_listings, median_price_eur, red_listings, suspect_share,
  primary_segment, first_date, last_date)
WITH ranked AS (
  SELECT current_seller_id AS sid, latest_price_eur AS p,
         ROW_NUMBER() OVER (PARTITION BY current_seller_id ORDER BY latest_price_eur) AS rn,
         COUNT(*)     OVER (PARTITION BY current_seller_id) AS c
  FROM vehicles WHERE latest_price_eur IS NOT NULL AND current_seller_id IS NOT NULL
),
median AS (
  SELECT sid, AVG(p) AS median_price_eur FROM ranked
  WHERE rn IN ((c + 1) / 2, (c + 2) / 2) GROUP BY sid
)
SELECT s.id, s.name, s.kind, s.settlement, s.region,
       (SELECT COUNT(*) FROM listings l WHERE l.seller_id = s.id) AS listings,
       (SELECT COUNT(*) FROM vehicles v WHERE v.current_seller_id = s.id) AS vehicles,
       (SELECT COUNT(*) FROM listings l WHERE l.seller_id = s.id AND l.is_active = 1) AS active_listings,
       m.median_price_eur,
       (SELECT COUNT(*) FROM vehicles v WHERE v.current_seller_id = s.id AND v.risk_level = 'red') AS red_listings,
       COALESCE(
         (SELECT 1.0 * SUM(CASE WHEN v.risk_level <> 'green' THEN 1 ELSE 0 END) / COUNT(*)
          FROM vehicles v WHERE v.current_seller_id = s.id), 0) AS suspect_share,
       NULL AS primary_segment,
       (SELECT MIN(v.last_seen) FROM vehicles v WHERE v.current_seller_id = s.id) AS first_date,
       (SELECT MAX(v.last_seen) FROM vehicles v WHERE v.current_seller_id = s.id) AS last_date
FROM sellers s LEFT JOIN median m ON m.sid = s.id;

-- owner_totals -------------------------------------------------------------
INSERT INTO owner_totals (owner_id, name, kind, settlement, vehicles_owned, first_date, last_date)
SELECT o.id, o.name, o.kind, o.settlement,
       (SELECT COUNT(*) FROM vehicles v WHERE v.current_owner_id = o.id) AS vehicles_owned,
       NULL, NULL
FROM owners o;

-- segment_totals -----------------------------------------------------------
INSERT INTO segment_totals (segment, listings, vehicles, median_price_eur)
SELECT mm.segment,
       (SELECT COUNT(*) FROM listings l JOIN vehicles v2 ON v2.id = l.vehicle_id
        JOIN makes_models m2 ON m2.model_key = v2.model_key WHERE m2.segment = mm.segment),
       COUNT(*),
       AVG(v.latest_price_eur)
FROM vehicles v JOIN makes_models mm ON mm.model_key = v.model_key
WHERE mm.segment IS NOT NULL
GROUP BY mm.segment;

-- seller_model_flows (граф продавач ↔ модел) -------------------------------
INSERT INTO seller_model_flows (seller_id, model_key, seller_name, seller_kind, make, model, listings, median_price_eur)
SELECT v.current_seller_id, v.model_key, s.name, s.kind,
       MAX(mm.make), MAX(mm.model), COUNT(*), AVG(v.latest_price_eur)
FROM vehicles v
JOIN sellers s ON s.id = v.current_seller_id
LEFT JOIN makes_models mm ON mm.model_key = v.model_key
WHERE v.model_key IS NOT NULL
GROUP BY v.current_seller_id, v.model_key;

-- price_history (медиана по модел и месец) ---------------------------------
INSERT INTO price_history (model_key, period, median_price_eur, listings, avg_mileage_km)
SELECT v.model_key, substr(l.listed_at, 1, 7) AS period,
       AVG(l.price_eur), COUNT(*), AVG(l.mileage_km)
FROM listings l JOIN vehicles v ON v.id = l.vehicle_id
WHERE v.model_key IS NOT NULL AND l.listed_at IS NOT NULL AND l.price_eur IS NOT NULL
GROUP BY v.model_key, period;

-- facet_counts (глобални броячи за филтри) ---------------------------------
INSERT INTO facet_counts (facet, key, listings, value_eur)
SELECT 'fuel', COALESCE(fuel_type, 'неизвестно'), COUNT(*), SUM(latest_price_eur)
FROM vehicles GROUP BY fuel_type
UNION ALL
SELECT 'gearbox', COALESCE(gearbox, 'неизвестно'), COUNT(*), SUM(latest_price_eur)
FROM vehicles GROUP BY gearbox
UNION ALL
SELECT 'body', COALESCE(body_type, 'неизвестно'), COUNT(*), SUM(latest_price_eur)
FROM vehicles GROUP BY body_type
UNION ALL
SELECT 'risk', risk_level, COUNT(*), SUM(latest_price_eur)
FROM vehicles GROUP BY risk_level;

-- search_index (FTS5) ------------------------------------------------------
INSERT INTO search_index (title, ident, kind, ref, subtitle, amount)
SELECT COALESCE(make || ' ' || model, 'Автомобил') || ' ' || COALESCE(model_year, ''),
       COALESCE(vin_normalized, plate, id),
       'vehicle', id,
       COALESCE((SELECT settlement FROM sellers s WHERE s.id = v.current_seller_id), ''),
       CAST(CAST(latest_price_eur AS INT) AS TEXT)
FROM vehicles v;
INSERT INTO search_index (title, ident, kind, ref, subtitle, amount)
SELECT name, COALESCE(eik_normalized, id), 'seller', id,
       COALESCE(kind, '') || ' · ' || COALESCE(settlement, ''), NULL
FROM sellers;

-- home_totals (единичен KPI ред) -------------------------------------------
INSERT INTO home_totals (id, vehicles, listings, active_listings, sellers, owners,
  suspect, red_vehicles, median_price_eur, first_date, last_date, as_of, refreshed_at)
WITH ranked AS (
  SELECT latest_price_eur AS p,
         ROW_NUMBER() OVER (ORDER BY latest_price_eur) AS rn,
         COUNT(*) OVER () AS c
  FROM vehicles WHERE latest_price_eur IS NOT NULL
)
SELECT 1,
  (SELECT COUNT(*) FROM vehicles),
  (SELECT COUNT(*) FROM listings),
  (SELECT COUNT(*) FROM listings WHERE is_active = 1),
  (SELECT COUNT(*) FROM sellers),
  (SELECT COUNT(*) FROM owners),
  (SELECT COUNT(*) FROM vehicles WHERE risk_level <> 'green'),
  (SELECT COUNT(*) FROM vehicles WHERE risk_level = 'red'),
  (SELECT AVG(p) FROM ranked WHERE rn IN ((c + 1) / 2, (c + 2) / 2)),
  (SELECT MIN(last_seen) FROM vehicles),
  (SELECT MAX(last_seen) FROM vehicles),
  (SELECT MAX(last_seen) FROM vehicles),
  datetime('now');
