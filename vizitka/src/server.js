import app from './app.js';

const port = Number(process.env.PORT || 3100);
// Слушаме само на loopback — публичният вход е през nginx (reverse proxy).
// Изолация независимо от firewall (nginx/vizitka.conf и DEPLOY.md го обещават).
const host = process.env.HOST || '127.0.0.1';
app.listen(port, host, () => {
  console.log(`Vizitka слуша на http://${host}:${port}`);
});
