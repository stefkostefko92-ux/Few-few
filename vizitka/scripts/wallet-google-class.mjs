// Създава (или обновява) класа на Google Wallet картата — ЕДНОКРАТНО, от сървъра.
//
// Защо отделна стъпка: Google иска поне един съществуващ клас, преди да даде право за
// публикуване („Request publishing access“), а без него картите стоят с етикет
// „[TEST ONLY]“ и се запазват само от тестови акаунти. Приложението създава класа
// едва при първото запазване през JWT — тоест кокошката и яйцето.
//
// Идемпотентно: пускай колкото пъти искаш — при съществуващ клас само го обновява.
//
//   sudo node /opt/vizitka/scripts/wallet-google-class.mjs --env /etc/vizitka/vizitka.env
//
// Като root, защото env файлът и ключът на service account-а са с права 600. Скриптът
// чете САМО нужните променливи от env файла и не изписва нито една от тях.
import fs from 'node:fs';

const args = process.argv.slice(2);
const envAt = args.indexOf('--env');
const envFile = envAt !== -1 ? args[envAt + 1] : null;

// Минимален четец на systemd EnvironmentFile (KEY=VALUE, по избор в кавички).
// Не го подаваме на шела с `source`: стойност с интервал или `$` там се тълкува.
if (envFile) {
  const wanted = /^(GOOGLE_WALLET_[A-Z_]+|NODE_ENV)$/;
  for (const raw of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(raw);
    if (!m || !wanted.test(m[1]) || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const { ensureGoogleClass } = await import('../src/wallet/google.js');
const { googleClassId, googleEnabled } = await import('../src/wallet/shared.js');

if (!googleEnabled()) {
  console.error(
    '✘ Google Wallet не е конфигуриран: нужни са GOOGLE_WALLET_ISSUER_ID и GOOGLE_WALLET_SA_KEY ' +
      '(път до JSON ключа на service account-а). Подай env файла с --env.'
  );
  process.exit(1);
}

try {
  const outcome = await ensureGoogleClass();
  console.log(
    `✔ Класът ${googleClassId()} е ${outcome === 'created' ? 'създаден' : 'обновен'} (MULTIPLE_HOLDERS).`
  );
  console.log(
    '  Следва: Google Pay & Wallet Console → Google Wallet API → „Request publishing access“.'
  );
} catch (err) {
  console.error(`✘ ${err.message}`);
  process.exit(1);
}
