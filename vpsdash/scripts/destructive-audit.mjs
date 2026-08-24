#!/usr/bin/env node
// Одит „необратимите действия": има ли всяко от тях предпазителите, които му се
// полагат — и ГЕЙТ срещу ново действие, промъкнало се без тях.
//
// Защо отделен одит: панелът е root на цял сървър. Едно действие без предпазител
// е достатъчно за загубени данни, а такова действие не се вижда — добавя се като
// поредния бутон и изглежда точно като останалите. Затова тук няма евристика:
// всеки мутиращ маршрут е ИЗБРОЕН поименно с класа си, и класът диктува какво
// се изисква. Нов маршрут без ред в списъка пада гейта — не се приема наум.
//
// Трите предпазителя и какво пази всеки:
//   · ОДИТ — следа кой какво е направил. Пази РАЗСЛЕДВАНЕТО след инцидента.
//   · SUDO — парола отново, точно преди необратимото. Пази от открадната сесия.
//   · ПОТВЪРЖДЕНИЕ — човекът вижда какво точно ще стане. Пази от грешен клик.
//
// Класовете. Не всеки предпазител пасва на всяко действие — модал пред всеки
// клавиш в терминала е абсурд, а питане на машина-към-машина няма кого да пита.
// Затова класът диктува КОИ три от трите, а не „винаги и трите":
//   A · унищожава данни или прави машината недостъпна → одит + sudo + потвърждение
//   T · изпълнение (терминал, наш скрипт) → одит + sudo; ПИСАНЕТО е потвърждението
//   S · настройка зад парола → одит + sudo; стойността се вижда и се пренаписва,
//       а модал върху всяка настройка учи човека да го щрака, без да чете
//   B · спира/рестартира нещо живо, обратимо → одит + потвърждение
//   P · машина-към-машина (чужд възел) → само одит; няма човек, когото да питаш,
//       вратата е peer токенът — затова следата е ЕДИНСТВЕНАТА защита след факта
//   C · настройка или обратима промяна → само одит
//   R · четене/план/проба — нищо не се променя → нищо не се изисква

import fs from 'node:fs';
import path from 'node:path';
import { SUDO_ALWAYS, SUDO_ON_WRITE } from '../src/sudo.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'src/routes.js'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');

// ── Списъкът. Редът „защо" е задължителен: клас без обосновка е клас наизуст. ──
const CLASS = new Map(Object.entries({
  // A — необратимо
  '/api/power': 'A · изключва/рестартира машината',
  '/api/backups/restore/apply': 'A · излива стар архив върху жива база',
  '/api/volumes/restore/apply': 'A · изпразва том и излива архив',
  '/api/deploy/rollback': 'A · връща продукцията на стара версия',
  '/api/updates/kernel-clean': 'A · трие пакети на ядра — сгрешено значи незагрузима машина',
  '/api/reclaim/run': 'A · трие файлове',
  '/api/disk/vacuum': 'A · трие логове (заличаване на следи)',
  '/api/files/write': 'A · запис като root = изпълнение на код с една стъпка забавяне',
  '/api/env/file': 'S · пише тайните на продукцията',
  '/api/cron/add': 'A · ред в crontab е код, който ще се пусне като root',
  '/api/cron/run': 'B · пуска планираната задача СЕГА (не чакаш до 3 сутринта)',
  '/api/cron/remove': 'A · маха планирана задача (напр. бекъпа) — тихо',
  '/api/firewall/rule': 'S · сървърът отказва правило, което би затворило SSH; интерфейсът пита повторно',
  '/api/firewall/rule/delete': 'A · маха защита',
  '/api/firewall/enabled': 'A · вдига/сваля цялата защитна стена',
  '/api/settings/access': 'S · списъкът с адреси е втора врата ПРЕД паролата',
  '/api/deploy/archive/delete': 'B · трие качен архив',
  '/api/backups/schedule': 'S · изключването маха последната предпазна мрежа, тихо',
  '/api/ports/change/apply': 'A · пипа .env, vhost-а и рестартира — три необратими в едно',
  '/api/backups/panel/key': 'S · разкрива ключа към архив с ВСИЧКИ тайни на панела',
  '/api/limits': 'S · грешен лимит убива услуга по OOM',
  '/api/limits/docker': 'S · същото за контейнер',
  '/api/agents/tools/run': 'T · пуска наш скрипт с правата на панела',
  '/api/terminal/run': 'T · произволна команда като root',
  '/api/pty/open': 'T · жив шел като root',
  '/api/pty/:id/input': 'T · всеки ред отива в жив root шел',
  '/api/pty/:id/kill': 'T · убива сесия',
  '/api/desktop/:action': 'S · вдига втора среда за изпълнение (браузър на машината)',
  '/api/backups/offsite/receive': 'P · ЧУЖД възел пише файлове тук и ротира старите',

  // B — обратимо, но боли
  '/api/services/action': 'B · спира/рестартира systemd услуга',
  '/api/docker/action': 'B · спира/рестартира контейнер',
  '/api/compose/action': 'B · вдига/сваля цял стек',
  '/api/processes/kill': 'B · убива процес',
  '/api/jobs/:id/kill': 'B · прекъсва задача (може да е деплой по средата)',
  '/api/deploy/run': 'B · деплой — обратим през rollback, но пипа продукцията',
  '/api/updates/upgrade': 'B · обновява пакети',
  '/api/updates/dpkg-repair': 'C · поправя прекъснат dpkg',
  '/api/webserver/reload': 'C · презарежда уеб сървъра',
  '/api/webserver/site': 'C · пише vhost, но `writeSite` ВАЛИДИРА и се ОТКАТВА сам — по-силен предпазител от модал',
  '/api/webserver/enabled': 'B · вкл./изкл. сайт',
  '/api/webserver/cert-renew': 'C · подновява сертификат; `--dry-run` е предпазителят',
  '/api/domains/issue': 'B · издава сертификат (rate limit на Let\'s Encrypt)',
  '/api/security/integrity/baseline': 'B · нов отпечатък — старият вече не пази',
  '/api/security/fail2ban': 'B · пипа блокировките',
  '/api/sessions/revoke-all': 'B · изхвърля всички устройства, включително това',
  '/api/redis/save': 'C · принудителен запис на Redis',
  '/api/disk/builder-prune': 'B · чисти кеша на Docker builder',

  // C — настройка/обратимо
  '/api/sessions/revoke': 'C · маха една сесия',
  '/api/sudo': 'C · сам по себе си е ДОКАЗВАНЕ на самоличност',
  '/api/sudo/revoke': 'C · маха си правата — по-строго от преди',
  '/api/totp/enable': 'C · включва втори фактор',
  '/api/totp/disable': 'C · маха втори фактор (има sudo)',
  '/api/totp/recovery/regenerate': 'C · нови резервни кодове',
  '/api/alerts/silence': 'C · срочно заглушаване, видимо в панела',
  '/api/alerts/settings': 'C · прагове — числа, видими и обратими',
  '/api/alerts/channels': 'C · канали за известия (има sudo — носят тайни)',
  '/api/alerts/maintenance': 'C · пауза на известията, с таван 8 часа',
  '/api/alerts/maintenance/end': 'C · край на паузата',
  '/api/alerts/digest/send': 'C · праща отчета сега',
  '/api/webserver/coverage/watch': 'C · добавя проверка за домейн',
  '/api/traffic/quota': 'C · записва квотата на хостера',
  '/api/ports/accept': 'C · приема текущата карта за базова',
  '/api/updates/refresh': 'C · apt update — само опреснява списъка',
  '/api/deploy/upload': 'C · качва архив (проверява се sha256)',
  '/api/backups/run': 'C · прави бекъп',
  '/api/backups/drill': 'C · проба за възстановяване, в пясъчник',
  '/api/backups/schedule/run': 'C · пуска бекъпа по график сега',
  '/api/backups/offsite/now': 'C · изнася копие към другия възел',
  '/api/databases/dump': 'C · прави дъмп',
  '/api/volumes/backup': 'C · архивира том',
  '/api/audit/ship/now': 'C · изнася одита',
  '/api/audit/mirror': 'C · приема огледало на чужд одит',
  '/api/alerts/test': 'C · праща пробно известие НАВЪН',
  '/api/pty/:id/resize': 'C · размер на терминала',

  // R — нищо не се променя
  '/api/login': 'R · вход',
  '/api/logout': 'R · изход',
  '/api/totp/setup': 'R · генерира тайна за показване, не я записва',
  '/api/alerts/check': 'R · преоценява алармите',
  '/api/ports/change/plan': 'R · само план',
  '/api/backups/restore/preview': 'R · само преглед',
  '/api/volumes/restore/preview': 'R · само преглед',
  '/api/disk/scan': 'R · сканира диска',
  '/api/webhook/github': 'R · външна кука със своя подпис',
}));

const NEEDS = {
  A: { audit: true, sudo: true, confirm: true },
  T: { audit: true, sudo: true, confirm: false },
  S: { audit: true, sudo: true, confirm: false },
  B: { audit: true, sudo: false, confirm: true },
  P: { audit: true, sudo: false, confirm: false },
  C: { audit: true, sudo: false, confirm: false },
  R: { audit: false, sudo: false, confirm: false },
};
// ── Кои маршрути изобщо мутират ──────────────────────────────────────────────
const found = [];
const starts = [...src.matchAll(/\n  r\.(post|put|delete)\(\s*\n?\s*'([^']+)'/g)];
for (let i = 0; i < starts.length; i++) {
  const from = starts[i].index;
  const nextIdx = src.indexOf('\n  r.', from + 5);
  const body = src.slice(from, nextIdx < 0 ? src.length : nextIdx);
  found.push({ path: starts[i][2], body });
}

// ── Одит: вграден, през модул, или през `jobs`/`pty` (те логват сами) ────────
const audited = (r) =>
  /audit\.log\(/.test(r.body) ||
  /\baudit\b/.test(r.body) ||
  /jobs\.start\(/.test(r.body) ||
  /jobs\.kill\(/.test(r.body) ||
  /ctx\.pty\./.test(r.body);

// ── Потвърждение: прозорецът СЛЕД всеки confirmDanger, който вика този маршрут ─
// Не стига да ИМА confirmDanger преди извикването — резултатът му трябва и да
// СЕ ПОЛЗВА. Сметнато и подминато потвърждение изглежда в кода точно като
// работещо (и мутационната проверка го доказа: махнатото `if (ok)` мина
// незабелязано). Затова между диалога и извикването се иска решаваща
// конструкция: `if (ok)`, `if (!ok) return`, `if (!(await …))` или `&&`.
// Признаците, че резултатът РЕАЛНО спира нещо: изход по `return` веднага след
// диалога, или явно `if (ok)`/`ok &&` преди извикването. Всичко останало —
// включително сметнато и подминато `ok` — не се брои за потвърждение.
const GATE_RX = /\)\)+\s*return|\bif\s*\(\s*!?\s*ok\b|\bok\s*&&|\)\s*&&\s*(runJob|api|streamJob)/;
const confirmed = new Set();
for (const m of app.matchAll(/confirmDanger\(/g)) {
  // Прозорецът започва МАЛКО ПРЕДИ диалога: при формата
  // `if (!(await confirmDanger({…}))) return;` решаващата конструкция стои от
  // ЛЯВАТА страна и иначе не се вижда.
  const before = app.slice(Math.max(0, m.index - 40), m.index);
  const win = app.slice(m.index, m.index + 2600);
  for (const c of win.matchAll(/(?:api|runJob|streamJob)\(\s*`?'?\/([\w/:${}.-]+)'?`?/g)) {
    const between = before + win.slice(0, c.index);
    if (!GATE_RX.test(between)) continue; // диалогът се показва, но нищо не спира
    confirmed.add('/api/' + c[1].replace(/\$\{[^}]+\}/g, ':id'));
  }
}
// `confirm(...)` на браузъра също е потвърждение — по-слабо, но е. Двете форми:
// `if (!confirm(…)) return;` и `confirm(…) && действие(…)`. Само първата се
// търсеше, значи одитът съобщаваше липсващо потвърждение за бутони, които го
// имат (ъпдейтите, чистенето на ядра) — фалшива тревога, а тя изтощава гейта
// точно толкова, колкото пропуснатата истинска.
for (const m of app.matchAll(/confirm\(/g)) {
  if (app.slice(Math.max(0, m.index - 8), m.index).includes('Danger')) continue; // confirmDanger се брои другаде
  const win = app.slice(m.index, m.index + 900);
  for (const c of win.matchAll(/(?:api|runJob|streamJob)\(\s*`?'?\/([\w/:${}.-]+)'?`?/g)) {
    confirmed.add('/api/' + c[1].replace(/\$\{[^}]+\}/g, ':id'));
  }
}

// Реалните пътища, които даден шаблон поражда — за да се мери правилото срещу
// това, което рутерът вижда в изпълнение.
const PARAM_SAMPLES = { ':action': ['up', 'down', 'pull'], ':id': ['abc123'] };
function SAMPLES(pattern) {
  let out = [pattern];
  for (const [param, values] of Object.entries(PARAM_SAMPLES)) {
    if (!out.some((p) => p.includes(param))) continue;
    out = out.flatMap((p) => (p.includes(param) ? values.map((v) => p.replace(param, v)) : [p]));
  }
  return out;
}

const problems = [];
const unlisted = [];
const table = [];
for (const r of found) {
  const cls = CLASS.get(r.path);
  if (!cls) { unlisted.push(r.path); continue; }
  const kind = cls[0];
  const need = NEEDS[kind];
  const has = {
    audit: audited(r),
    // Правилата за sudo се мерят срещу РЕАЛЕН път, не срещу шаблона: в
    // изпълнение рутерът вече е заменил `:action` с „up"/„down". Мерено срещу
    // буквалното „:action", `/^\/api\/desktop\/(up|down|pull)$/` не съвпада и
    // одитът съобщаваше липсващ предпазител, който в живия панел го има.
    sudo: [SUDO_ALWAYS, SUDO_ON_WRITE].some((list) => list.some((rx) => SAMPLES(r.path).some((s2) => rx.test(s2)))),
    confirm: confirmed.has(r.path),
  };
  const missing = Object.keys(need).filter((k) => need[k] && !has[k]);
  table.push({ path: r.path, kind, has, missing });
  if (missing.length) problems.push(`[${kind}] ${r.path} — липсва: ${missing.join(', ')}\n      ${cls}`);
}

const byKind = (k) => table.filter((t) => t.kind === k).length;
console.log(`мутиращи маршрути: ${found.length} · ` + ['A','T','S','B','P','C','R'].map((k) => `${k}:${byKind(k)}`).join(' '));

if (unlisted.length) {
  console.error('\n✘ Мутиращ маршрут БЕЗ клас — не се приема наум, впиши го в CLASS:');
  unlisted.forEach((p) => console.error('  ·', p));
}
if (problems.length) {
  console.error('\n✘ Липсващи предпазители:');
  problems.forEach((p) => console.error('  ·', p));
}
// Обратната посока: клас за маршрут, който вече го няма — мъртъв ред в списъка.
const dead = [...CLASS.keys()].filter((p) => !found.some((r) => r.path === p));
if (dead.length) {
  console.error('\n⚠ Клас за несъществуващ маршрут (изчистѝ списъка):');
  dead.forEach((p) => console.error('  ·', p));
}

if (unlisted.length || problems.length || dead.length) process.exit(1);
console.log('✔ Всяко действие носи предпазителите на класа си; нула некласифицирани, нула мъртви редове.');
