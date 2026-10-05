// Значката не изчерпва квотата на getMatchedRules (20 / 10 мин): при много табове опресняването се
// отлага, вместо тихо да замръзне (Тайния агент + Хромаджията, 2026-09-24).
import { ok, done, loadBackground } from "./_harness.mjs";
import { makeChrome } from "./_chrome.mjs";

const mock = makeChrome({ storage: { enabled: true } });
let calls = 0;
mock.chrome.declarativeNetRequest.getMatchedRules = async () => { calls++; return { rulesMatchedInfo: [{}, {}] }; };
globalThis.chrome = mock.chrome;
const bg = loadBackground({ chrome: mock.chrome, exports: "takeMatchedToken, refreshBadge" });

// Чиста функция: 18 жетона в прозореца, после отказ, след 10 мин — пак.
const log = [];
let granted = 0;
for (let i = 0; i < 25; i++) if (bg.takeMatchedToken(1000 + i, log)) granted++;
ok("най-много 18 извиквания в 10-минутния прозорец", granted === 18);
ok("след изтичане на прозореца има нов жетон", bg.takeMatchedToken(1000 + 10 * 60 * 1000 + 1, log) === true);

// Реалният път: 40 бързи опреснявания не правят повече от 18 извиквания към API-то.
for (let t = 0; t < 40; t++) await bg.refreshBadge(t);
ok(`refreshBadge стои под квотата (извиквания: ${calls})`, calls <= 18 && calls > 0);
done();
