import { createApp } from './app.js';
import { config, isDryRun } from './config.js';
import { startScheduler } from './scheduler.js';

const app = createApp();

// Слуша само на localhost — навън гледа reverse proxy-то (nginx). HOST за override при нужда.
app.listen(config.port, process.env.HOST || '127.0.0.1', () => {
  console.log(
    `Supreme AdManager слуша на :${config.port} (${config.env})${isDryRun() ? ' · DRY-RUN режим (без реални креденшъли — нищо не се харчи)' : ''}`
  );
});

startScheduler();
