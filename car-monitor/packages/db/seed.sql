-- CAR MONITOR — примерни seed данни за локална разработка.
-- Минимален свързан граф: продавач → обява → автомобил → събитие/собственик.
-- Зарежда се след 0000_init.sql (аналог на `scripts/seed.sql` в СИГМА).

-- Reference: марки/модели и валутен курс.
INSERT INTO makes_models (model_key, make, model, segment, body_type) VALUES
  ('vw|golf',   'VW',   'Golf',   'compact', 'hatch'),
  ('bmw|320d',  'BMW',  '320d',   'compact', 'sedan'),
  ('toyota|rav4','Toyota','RAV4',  'suv',     'suv');

INSERT INTO fx_rates (base_currency, rate_date, eur_per_unit, source, fetched_at) VALUES
  ('BGN', '2026-06-01', 0.511292, 'bnb', '2026-06-01T06:00:00Z');

-- Продавачи.
INSERT INTO sellers (id, name, kind, eik, eik_valid, region, settlement, contact_phone) VALUES
  ('s_auto_sofia', 'Авто София ЕООД', 'dealer',  '203456789', 1, 'София-град', 'София', '+359888000111'),
  ('s_private_01', 'Частно лице',     'private', NULL,        0, 'Пловдив',    'Пловдив', NULL);

-- Собственици.
INSERT INTO owners (id, name, kind, settlement) VALUES
  ('o_first',  NULL, 'person', 'Варна'),
  ('o_dealer', 'Авто София ЕООД', 'company', 'София');

-- Автомобили.
INSERT INTO vehicles (id, vin, vin_normalized, make, model, variant, model_key, model_year,
  fuel_type, gearbox, body_type, power_hp, engine_cc, color, current_seller_id, latest_mileage_km,
  latest_price_eur, status, mileage_flag, risk_level, risk_reasons, first_seen, last_seen) VALUES
  ('v_golf_01', 'WVWZZZ1KZAW000001', 'WVWZZZ1KZAW000001', 'VW', 'Golf', '1.6 TDI', 'vw|golf', 2015,
   'diesel', 'manual', 'hatch', 105, 1598, 'Сив', 's_auto_sofia', 168000,
   9500, 'active', 'suspect', 'red', '["mileage_rollback"]', '2026-05-01', '2026-06-15'),
  ('v_rav4_01', 'JTMBFREVXJD000002', 'JTMBFREVXJD000002', 'Toyota', 'RAV4', 'Hybrid AWD', 'toyota|rav4', 2019,
   'hybrid', 'automatic', 'suv', 218, 2487, 'Бял', 's_private_01', 72000,
   28500, 'active', 'ok', 'green', NULL, '2026-06-10', '2026-06-18');

-- Обяви (с каноничен EUR).
INSERT INTO listings (id, source_id, source, vehicle_id, seller_id, title, url,
  price_amount, price_currency, price_eur, fx_converted, mileage_km, condition,
  listed_at, location_nuts, settlement, photo_count, price_flag, is_active) VALUES
  ('l_golf_01', 'mob-1001', 'mobile_bg', 'v_golf_01', 's_auto_sofia',
   'VW Golf 1.6 TDI 2015', 'https://example/1001',
   18583, 'BGN', 9500, 1, 168000, 'used', '2026-06-15', 'BG411', 'София', 12, 'ok', 1),
  ('l_rav4_01', 'cars-2002', 'cars_bg', 'v_rav4_01', 's_private_01',
   'Toyota RAV4 Hybrid 2019', 'https://example/2002',
   28500, 'EUR', 28500, 0, 72000, 'used', '2026-06-18', 'BG421', 'Пловдив', 20, 'ok', 1);

-- Събития (времева линия). Golf-ът показва върнат пробег.
INSERT INTO events (id, natural_key, vehicle_id, event_type, event_date, mileage_km,
  value_before, value_after, value_delta, source, description) VALUES
  ('e_golf_gtp1', 'golf01|inspection|2023-09-01', 'v_golf_01', 'inspection', '2023-09-01', 210000,
   NULL, NULL, NULL, 'gtp', 'ГТП — отчетен пробег 210 000 км'),
  ('e_golf_list', 'golf01|listing|2026-06-15', 'v_golf_01', 'mileage_reading', '2026-06-15', 168000,
   210000, 168000, -42000, 'listing', 'Обявен пробег по-нисък от ГТП — съмнение за връщане'),
  ('e_rav4_imp', 'rav4|import|2021-03-10', 'v_rav4_01', 'import', '2021-03-10', 41000,
   NULL, NULL, NULL, 'kat', 'Внос от Германия');

-- FTS индекс (попълва се от ETL; тук — ръчно за примера).
INSERT INTO search_index (title, ident, kind, ref, subtitle, amount) VALUES
  ('VW Golf 1.6 TDI 2015', 'WVWZZZ1KZAW000001', 'vehicle', 'v_golf_01', 'София · 168000 км', '9500'),
  ('Toyota RAV4 Hybrid 2019', 'JTMBFREVXJD000002', 'vehicle', 'v_rav4_01', 'Пловдив · 72000 км', '28500'),
  ('Авто София ЕООД', '203456789', 'seller', 's_auto_sofia', 'дилър · София', NULL);

-- Прекалкулиран KPI ред за началната страница.
INSERT INTO home_totals (id, vehicles, listings, active_listings, sellers, owners,
  suspect, red_vehicles, median_price_eur, first_date, last_date, as_of, refreshed_at) VALUES
  (1, 2, 2, 2, 2, 2, 1, 1, 19000, '2026-05-01', '2026-06-18', '2026-06-18', '2026-06-20T00:00:00Z');
