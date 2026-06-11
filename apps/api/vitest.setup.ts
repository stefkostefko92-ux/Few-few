// Provide a valid test environment before any module reads process.env.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://aso:aso@localhost:5437/aso?schema=public";
process.env.REDIS_URL ??= "redis://localhost:6383";
process.env.JWT_SECRET ??= "test-access-secret-that-is-long-enough-1234";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-that-is-long-enough-1234";
process.env.CORS_ORIGINS ??= "http://localhost:4502";
