import app from './app.js';
import { indexNowKey, submitAllPublic } from './indexnow.js';

const port = Number(process.env.PORT || 3100);
// Слушаме само на loopback — публичният вход е през nginx (reverse proxy).
// Изолация независимо от firewall (nginx/vizitka.conf и DEPLOY.md го обещават).
const host = process.env.HOST || '127.0.0.1';
app.listen(port, host, () => {
  console.log(`Vizitka слуша на http://${host}:${port}`);

  // Напълно автоматично подаване към Bing/IndexNow: целият публичен набор при старт
  // (малко след вдигане) + веднъж дневно. Само в продукция с ключ и публичен домейн,
  // за да не подаваме localhost. Per-edit подаването остава за мигновена свежест.
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'production' && indexNowKey() && /^https:\/\//.test(base)) {
    const run = () => submitAllPublic(base);
    setTimeout(run, 10_000).unref();
    setInterval(run, 24 * 60 * 60 * 1000).unref();
  }
});
