# Фактурист

Онлайн фактуриране за фирми и счетоводни кантори в България — с ядро върху EN 16931: всеки документ е и
структуриран XML (UBL 2.1 и CII), проверен срещу официалните правила на стандарта и на Peppol BIS 3.
Продукт на [Carbon Stealth VCC](https://carbonstealth.eu).

## Локално

```bash
npm ci
# PostgreSQL 16 локално; DATABASE_URL в средата (не в репото)
export DATABASE_URL=postgresql://fakturist:fakturist@127.0.0.1:5432/fakturist
export PUBLIC_BASE_URL=http://127.0.0.1:4340
export JWT_SECRET=$(openssl rand -hex 32) LEDGER_SEAL_KEY=$(openssl rand -hex 32)
export REGISTRATION_OPEN=true NODE_ENV=development
npx prisma migrate deploy
OWNER_EMAIL=you@example.test OWNER_NAME='Име Фамилия' OWNER_PASSWORD='…' npx tsx src/scripts/create-owner.ts
npm run dev    # http://127.0.0.1:4340
```

Мастър акаунтът сменя паролата и включва 2FA при първия вход, след това вижда `/admin`.

## Проверки

`npm run check` (формат, типове, unit тестове, билд) · `npm run test:integration` (PostgreSQL) ·
`npm run test:conformance` (официалните XSD + Schematron; java + xmllint). Подробно — `CLAUDE.md`.

## Продукция

Docker Compose (`docker-compose.yml`) зад nginx на хоста (`deploy/nginx/fakturist.conf`), порт 4340.
Преди пускане — блокерите в `SPEC.md`.
