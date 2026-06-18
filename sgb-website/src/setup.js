// Първоначална настройка: създава базата, схемата, началните данни и админ акаунта.
import './db.js';
import { ensureSeed } from './seed.js';

console.log('  → Подготовка на базата данни и началните данни…');
ensureSeed().then(() => {
  console.log('  ✅ Готово. Стартирайте сайта с: npm start');
  process.exit(0);
}).catch((e) => {
  console.error('  ❌ Грешка при настройката:', e);
  process.exit(1);
});
