// Само при стартиране от изходния код (tsx: `npm run dev`, тестовете): нишката НЕ наследява куките
// на tsx от главната — регистрират се тук, после се зарежда истинският вход (parse-thread.ts).
// Билдът (dist/) ползва директно parse-thread.js и този файл не стига до образа.
import { register } from 'tsx/esm/api';

register();
await import('./parse-thread.ts');
