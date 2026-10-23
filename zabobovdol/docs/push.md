# Известия (web push)

## Включване
1. Генерирайте VAPID ключове (еднократно, на сървъра): `npx web-push generate-vapid-keys`
2. В `.env` на сървъра (mode 600): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:адрес@вашдомейн`.
   Частният ключ не влиза в репото. `docker-compose.yml` ги подава към `app`.
3. Рестарт на `app`. Без ключове известията са изключени (`/api/push/key` връща 503, изпращането връща `configured:false`).

## Дежурна аптека сутрин (cron в 08:00)
```
0 8 * * * curl -fsS -X POST -H "Authorization: Bearer $INGEST_TOKEN" https://zabobovdol.carbonstealth.eu/api/push/daily
```
Праща темата „pharmacy“ с дежурството за днес (Европа/София) от графика `DutyRoster`; няма запис — не праща.

## Поведение
- Абонаменти: само адрес на услугата, ключове и теми — без име, IP, UA.
- 404/410 от услугата → абонаментът се трие; други грешки → `failCount+1`, при 5 се трие; успех → `lastOkAt`.
- Товар ≤ 3000 байта, TTL 6 часа, 20 едновременни изпращания.
- Известието отваря само вътрешен път.
- iPhone: само след „Добави към начален екран“ (iOS 16.4+).
- Android приложение (TWA): `enableNotifications:true`, `appVersionCode:2` — нужен нов Bubblewrap билд.
