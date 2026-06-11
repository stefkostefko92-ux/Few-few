// Provide a valid env before any worker module reads process.env at import.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://aso:aso@localhost:5437/aso?schema=public";
process.env.REDIS_URL ??= "redis://localhost:6383";
