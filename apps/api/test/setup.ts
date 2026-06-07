/**
 * Изпълнява се преди тестовите модули (vitest setupFiles), за да е налична
 * валидна конфигурация на средата при import-а на `env.ts`. Тези тестове не
 * докосват PostgreSQL/Redis (Prisma и BullMQ се свързват лениво), затова
 * DATABASE_URL е само за да мине валидацията на схемата.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET ??= 'test_secret_at_least_16_chars_long';
process.env.CORS_ORIGINS ??= 'https://example.test';
process.env.MEDIA_DIR ??= './media-test';
