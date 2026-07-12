import { createApp } from './app.js';
import { config, isDryRun } from './config.js';
import { startScheduler } from './scheduler.js';

const app = createApp();

app.listen(config.port, () => {
  console.log(
    `Supreme AdManager слуша на :${config.port} (${config.env})${isDryRun() ? ' · DRY-RUN режим (без реални креденшъли — нищо не се харчи)' : ''}`
  );
});

startScheduler();
