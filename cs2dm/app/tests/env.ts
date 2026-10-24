/**
 * Средата на тестовете — внася се ПЪРВА във всеки тестов файл (ESM изпълнява импортите по ред).
 * Unit тестовете не докосват база: адресите сочат затворен порт, само за да мине конфигът.
 * Истински DATABASE_URL (интеграционният тест) се пази — `??=` не го презаписва.
 */
process.env.NODE_ENV ??= 'test';
process.env.LOG_LEVEL ??= 'silent';
process.env.PUBLIC_BASE_URL = 'https://cs2.carbonstealth.eu';
process.env.SERVER_ADDRESS = 'dm.carbonstealth.eu:27015';
process.env.DATABASE_URL ??= 'postgresql://unit:unit@127.0.0.1:1/unit';
process.env.REDIS_URL ??= 'redis://127.0.0.1:1/0';

export {};
