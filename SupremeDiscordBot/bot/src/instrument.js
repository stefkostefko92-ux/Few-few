// bot/src/instrument.js
// Sentry.init ПРЕДИ всяка инструментирана библиотека (discord.js, express, …).
//
// ЗАЩО СЪЩЕСТВУВА (Наблюдателят, одит 07.08.2026): досега `Sentry.init` стоеше
// като top-level ИЗРАЗ в `index.js` — текстово преди `import { Client } from
// "discord.js"`, но това няма значение. В ES модулите ВСИЧКИ import декларации
// се оценяват преди тялото на модула, независимо от реда в текста. Тоест
// discord.js и express се зареждаха първи, а Sentry се вдигаше след тях и
// нямаше какво да закърпи.
//
// Отделният модул оправя реда (backend-ът вече го прави така), но за ESM това
// пак не е достатъчно: живите връзки на `import` не се пачват след факта,
// затова стартовата команда носи `--import ./src/instrument.js`
// (виж `bot/Dockerfile`). Залавянето на грешки (`captureException`) работи и
// без това; тук се печели авто-инструментацията и следите.
import "dotenv/config";
import * as Sentry from "@sentry/node";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
  });
  console.log("✅ Sentry error monitoring active (bot)");
}
