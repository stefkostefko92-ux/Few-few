// The screenshots of the Italian user guide (scripts/guida-utente/pdf.py puts them in the PDF): a real browser against a
// running LiftPilot (local), loaded with a fictional demo company, one PNG per screenshot id the chapters ask for.
//   - the chapters' JSON files (CHAPTERS, a directory) list, per page, `shots: [{ id, what }]`; they are read at run time,
//     so the script follows whatever set the chapters have: an id no scene takes is reported, an id the server cannot
//     give (a billing band without Stripe…) is skipped with its reason;
//   - the demo is invented: «Ascensori Esempio S.r.l.», Bergamo, its Titolare and four colleagues, every e-mail on the
//     reserved domain ascensori-esempio.example, the built-in examples A/B/C wherever a calculation needs numbers, the
//     uploaded files drawn here (scatti/disegni.mjs);
//   - every password field and every temporary password or one-time link on a screen is masked in the DOM («••••••••»)
//     just before its shot and given back after it;
//   - it starts from an EMPTY database (only the platform administrator): the administrator makes the company, the
//     Titolare signs in with the temporary password, chooses his own and accepts the terms, invites the colleagues (their
//     e-mails read from scripts/mail-sink.mjs), and so on, scene by scene, in the order below.
// Usage: BASE_URL=http://localhost:3520 ADMIN_PASSWORD=… MAILBOX_PORT=2630 OUT=… CHAPTERS=docs/guida-utente node scripts/guida-utente/screenshot.mjs
//   (the server sends its mail to SMTP 127.0.0.1:MAILBOX_PORT; Playwright: local or global).
// Optional: DEMO_DATABASE_URL (a PostgreSQL URL of a database named lp_demo: the terms' states the pages cannot reach are
// set there and put back; without it those two shots are skipped); STATE_DIR with SCENES=a,b (the state and the sessions
// of the scenes already done kept in a directory, so that some scenes can run again alone).
import { join } from 'node:path';
import { step } from '../smoke-kit.mjs';
import { ONLY, STATE_DIR, browser, saveState, sessions, sink, skipped, taken, wanted } from './scatti/ambiente.mjs';
import { beta, company, publicPages } from './scatti/scene-accesso.mjs';
import { admin, azienda, termini } from './scatti/scene-azienda.mjs';
import { lista, p1docs, p1pages, rt } from './scatti/scene-documenti.mjs';
import { p1progetto, p2 } from './scatti/scene-progetto.mjs';
import { p1, p1calc, rilievi } from './scatti/scene-rilievi.mjs';

const SCENES = { public: publicPages, company, beta, rilievi, p1, p1calc, p1progetto, azienda, p1docs, rt, p1pages, p2, lista, admin, termini };

try {
  for (const [name, run] of Object.entries(SCENES)) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    step(`scene ${name}`);
    await run();
    saveState();
    if (STATE_DIR) for (const [who, s] of sessions) await s.ctx.storageState({ path: join(STATE_DIR, `session-${who}.json`) });
  }
  for (const id of wanted.keys()) if (!taken.has(id) && !skipped.has(id)) skipped.set(id, 'no scene took it');
  process.stdout.write(`\ntaken ${taken.size} of ${wanted.size}\n`);
  for (const [id, file] of taken) process.stdout.write(`  ${id} → ${wanted.get(id).page}  (${file})\n`);
  for (const [id, why] of skipped) process.stdout.write(`  SKIPPED ${id}: ${why}\n`);
} finally {
  await browser.close();
  await sink.close();
}
