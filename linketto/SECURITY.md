# Сигурност — Linketto

- **Пароли:** bcrypt (12 rounds). **Сесии:** httpOnly/secure/lax cookie;
  в БД стои само sha256 на токена.
- **Вход:** всички server actions валидират със zod и проверяват собственост
  (`where: { userId }`); slug-овете минават през allowlist регекс + резервирани
  думи.
- **Плащания:** права се дават само през Stripe webhook с проверен подпис
  (`constructEvent`); ключовете са само в env на сървъра (mode 600).
- **GDPR:** аналитиката е без бисквитки и без лични данни (без IP, без user
  agent); пазим само имейл + хеширана парола + публикувано от потребителя
  съдържание. Данните са в ЕС.
- **Хедъри:** X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy,
  Permissions-Policy (next.config.mjs).
- Доклади за уязвимости: info@carbonstealth.eu.
