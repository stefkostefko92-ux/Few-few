/**
 * Общото за всички схеми на средата (приложението, worker-ът, CLI-тата) — без зависимости към тях,
 * за да няма кръгови импорти между `config*.ts`.
 */

/**
 * Празен низ = „не е зададено“: docker-compose.yml подава `${X:-}` като празна стойност, а изборите
 * (EMBEDDING_MODEL) и числата (METRICS_PORT) иначе биха спрели процеса при старт. Всички текстови
 * настройки имат подразбиране '' — за тях смисълът не се мени.
 */
export function withoutEmpty(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ''));
}

/** 32 байта в base64 (`openssl rand -base64 32`) — MFA_ENC_KEY и FILES_KEK. */
export function isKey32(v: string): boolean {
  return /^[A-Za-z0-9+/]+={0,2}$/.test(v) && Buffer.from(v, 'base64').length === 32;
}

/** Грешките на zod като един ред за съобщението при старт (без стойностите — може да са тайни). */
export function describeIssues(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>) {
  return issues.map((i) => `${i.path.map(String).join('.')}: ${i.message}`).join('; ');
}
