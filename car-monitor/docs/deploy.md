# Деплой

Два worker-а (`car-monitor` и `car-monitor-etl`) споделят една D1 база на среда.

## Първоначална настройка

```bash
pnpm bootstrap                 # wrangler d1 create car-monitor
# копирай database_id в apps/web/wrangler.toml и apps/etl/wrangler.toml
pnpm --filter @car-monitor/web run db:setup
```

## Деплой

```bash
pnpm --filter @car-monitor/web run deploy
pnpm --filter @car-monitor/etl run deploy
```

Продукционни деплои само през GitHub Actions (release таг или ръчно). Машините на
разработчиците не пазят дълготрайни продукционни креденшъли — както в СИГМА.

## Тайни

- Достъпите до национални регистри (КАТ, ГТП, застрахователи) са production
  secrets: `wrangler secret put <NAME>`.
- Курсовете (`fx_rates`) се обновяват от ETL; ключове към fx доставчик също са secrets.
