// Незадължителен графичен десктоп (Ubuntu + XFCE в контейнер), показан ВЪТРЕ в
// панела.
//
// Двете решения, които определят целия модул:
//
//  1. **Десктопът не е част от панела.** Клиентът на KasmVNC/noVNC е около мегабайт
//     чужд JavaScript. Вкараме ли го в `public/`, правилото „нула зависимости" —
//     върху което е построен целият продукт — престава да важи. Затова десктопът
//     живее в контейнер, който някой друг поддържа, а панелът само го ПОКАЗВА.
//
//  2. **Единственият път навътре минава през входа на панела.** Контейнерът слуша
//     само на 127.0.0.1, а браузърът стига до него през `/desktop/…` на самия
//     панел. Тоест десктопът наследява сесията, 2FA-та и списъка с разрешени
//     адреси, вместо да бъде втора врата със собствена парола. Ако това се
//     заобиколи (публикуван порт, отделен vhost), целият модел пада.
//
// Проксито е ръчно, защото `node:http` няма готово: обикновените заявки минават
// през `http.request`, а WebSocket-ът — през `upgrade` събитието и суров сокет.
// VNC е WebSocket по цялото си протежение; без втората част рамката се зарежда и
// остава черна.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './exec.js';

export const CONTAINER = 'csd-desktop';
export const PREFIX = '/desktop';
const DEFAULT_PORT = 3010;
// Съвпада с `CUSTOM_USER=${DESKTOP_USER:-csd}` в compose файла — двете места трябва
// да казват едно и също, иначе панелът показва име, с което входът не минава.
const DEFAULT_USER = 'csd';

// Образът и таванът на паметта минават през ЗАТВОРЕНА проверка, а не се подават
// сурови: стойността от конфига стига до команден ред на docker. Име на образ по
// правилата на OCI (регистър/път:таг), нищо друго — иначе полето е „изпълни
// каквото ти кажа" през приятен интерфейс, точно като редактора на `.env` с
// произволен път.
const DEFAULT_IMAGE = 'lscr.io/linuxserver/webtop:ubuntu-mate';
const IMAGE_RX = /^[a-z0-9][a-z0-9._-]*(?::\d+)?(?:\/[a-z0-9][a-z0-9._-]*)*(?::[\w][\w.-]{0,127})?$/;
export function desktopImage(cfg) {
  // Типът се проверява, не се коерцира. `String(42)` е `'42'`, а „42" Е валидно
  // име на образ по правилата на OCI — тоест число в конфига минава проверката и
  // машината тръгва да дърпа несъществуващ образ вместо да ползва работещото
  // подразбиране. Същият клас капан като `Number(null) === 0` при часа на бекъпа.
  const raw = cfg?.desktop?.image;
  if (typeof raw !== 'string') return DEFAULT_IMAGE;
  const v = raw.trim();
  return v && IMAGE_RX.test(v) ? v : DEFAULT_IMAGE;
}

// Форматът на Docker: число + един от b/k/m/g. Празно/невалидно → подразбиране.
const DEFAULT_MEM = '1500m';
export function desktopMem(cfg) {
  const raw = cfg?.desktop?.memLimit;
  if (typeof raw !== 'string') return DEFAULT_MEM;
  return /^\d+[bkmg]$/i.test(raw.trim()) ? raw.trim() : DEFAULT_MEM;
}

export function desktopPort(cfg) {
  const n = Number(cfg?.desktop?.port);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : DEFAULT_PORT;
}

// Compose файлът се търси там, където стои и ТАЙНАТА до него.
//
// Този ред беше обърнат и това направи десктопа неизползваем след всеки деплой.
// Логиката беше „каноничното е релийзът, както при autodeploy" — вярно за КОДА,
// но фатално за файл, до който живее тайна: `deploy/desktop/desktop.env` е
// изключен от rsync, за да ОЦЕЛЕЕ деплоя, но оцелява само в инсталационната
// папка (`/opt/vps-dashboard`). Релийзът е нова папка при всяко разгръщане и
// тайната по конструкция НЕ пътува с него. Значи панелът избираше compose файл,
// до който няма и не може да има парола — и всяко пускане падаше с „Липсва
// desktop.env", ден след като „поправихме" точно това изтриване.
//
// Затова редът е: първо кандидат, до който РЕАЛНО стои `desktop.env`; ако няма
// такъв — инсталираният (спрямо модула, тоест кодът, който в момента върви),
// после релийзът. Изборът се води от тайната, а не от подредба на константи.
export function composeFile(cfg) {
  const candidates = [
    cfg?.desktop?.composeFile,
    // Спрямо САМИЯ модул — това Е разгърнатият код (панелът върви от APP_DIR) и
    // точно до него autodeploy пази `desktop.env`.
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'deploy', 'desktop', 'docker-compose.yml'),
    // И ДВЕТЕ имена на папката в релийза. Тя се казваше `vps-dashboard`, сега е
    // `vpsdash` — а стари релийзи под `current` носят старото. Един закован низ
    // тук значи, че преименуване в репото тихо изключва десктопа: първият
    // кандидат просто не съществува и никой не казва защо.
    ...['vpsdash', 'vps-dashboard'].map((dir) =>
      path.join(cfg?.paths?.currentLink || '/opt/few-few/current', dir, 'deploy', 'desktop', 'docker-compose.yml')),
  ].filter(Boolean);
  const present = candidates.filter((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });
  const withSecret = present.find((p) => {
    try {
      return fs.statSync(path.join(path.dirname(p), 'desktop.env')).isFile();
    } catch {
      return false;
    }
  });
  return withSecret || present[0] || null;
}

// Паролата на самия десктоп живее в отделен файл до compose-а (mode 600), не в
// config.json и никога в репото — същото правило като restic.env.
export function envFile(cfg) {
  const f = composeFile(cfg);
  return f ? path.join(path.dirname(f), 'desktop.env') : null;
}

// Потребителското ИМЕ за десктопа — и НИЩО друго от този файл.
// Паролата живее в същия файл и не напуска сървъра при никакви обстоятелства,
// затова тук се чете ЕДИН точно назован ключ, вместо да се връща разбор на
// файла: „вземи всичко и после махни тайното" е една забравена променлива
// разстояние от изтичане.
export function desktopUser(cfg) {
  const f = envFile(cfg);
  if (!f) return DEFAULT_USER;
  try {
    const m = fs.readFileSync(f, 'utf8').match(/^\s*(?:export\s+)?DESKTOP_USER\s*=\s*(.*)$/m);
    const v = (m?.[1] || '').trim().replace(/^['"]|['"]$/g, '');
    return v || DEFAULT_USER;
  } catch {
    return DEFAULT_USER;
  }
}

export async function status(cfg) {
  const file = composeFile(cfg);
  const env = envFile(cfg);
  const out = {
    available: Boolean(file),
    composeFile: file,
    envConfigured: Boolean(env && fs.existsSync(env)),
    // Десктопът иска СОБСТВЕНА парола (KasmVNC пази сесията с Basic-auth) и
    // диалогът показва домейна на ПАНЕЛА — тоест изглежда точно като фишинг
    // върху собствения ти адрес. Без името тук човек няма какво да въведе и
    // логично се усъмнява. Показваме КОЙ пита и с кое име; паролата — никога.
    user: desktopUser(cfg),
    port: desktopPort(cfg),
    running: false,
    state: null,
    health: null,
    error: null,
  };
  if (!file) {
    out.error = 'Няма deploy/desktop/docker-compose.yml в текущия release.';
    return out;
  }
  const r = await run('docker', ['inspect', '-f', '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}', CONTAINER], {
    timeout: 10000,
  });
  if (!r.ok) {
    // „Няма такъв контейнер" е НОРМАЛНО състояние (изключен е), не грешка.
    const msg = (r.stderr || '').toLowerCase();
    if (!msg.includes('no such object') && !msg.includes('no such container')) {
      out.error = (r.stderr || r.error || '').trim().slice(0, 200);
    }
    return out;
  }
  const [state, health] = r.stdout.trim().split('|');
  out.state = state || null;
  out.health = health || null;
  out.running = state === 'running';
  return out;
}

// Пускането/спирането минава през ЗАДАЧА с жив изход, защото първото дърпане на
// образа е ~2 GB и трае минути — тихо чакащ бутон е най-лошият вариант.
export function actionSpec(cfg, action) {
  if (!['up', 'down', 'pull'].includes(action)) {
    throw Object.assign(new Error('Невалидно действие'), { status: 400 });
  }
  const file = composeFile(cfg);
  if (!file) throw Object.assign(new Error('Няма compose файл за десктопа'), { status: 400 });
  const env = envFile(cfg);
  if (action !== 'down' && (!env || !fs.existsSync(env))) {
    throw Object.assign(
      new Error(`Липсва ${env || 'desktop.env'} — сложи там DESKTOP_PASSWORD (mode 600) и опитай пак.`),
      { status: 400 }
    );
  }
  const args = { up: 'up -d', down: 'down', pull: 'pull' }[action];
  return {
    title: `Десктоп: ${{ up: 'пускане', down: 'спиране', pull: 'обновяване на образа' }[action]}`,
    shell: `cd ${JSON.stringify(path.dirname(file))} && docker compose --env-file desktop.env -f ${JSON.stringify(file)} ${args}`,
    // `desktop.port` мени и КЪДЕ проксира панелът, и КЪДЕ публикува compose —
    // иначе настройката е вързана наполовина: сменяш порта, панелът чука на
    // новия, контейнерът слуша на стария и рамката остава празна БЕЗ грешка.
    // Средата на процеса бие `--env-file` при заместване в compose, значи
    // конфигът остава единственият източник на истина.
    env: {
      DESKTOP_PORT: String(desktopPort(cfg)),
      DESKTOP_IMAGE: desktopImage(cfg),
      DESKTOP_MEM: desktopMem(cfg),
    },
    exclusive: 'desktop',
    timeoutMs: 30 * 60 * 1000,
  };
}

// ── Прокси ───────────────────────────────────────────────────────────────────
// Обикновени заявки. Пътят се препраща КАКТО Е (`/desktop/...`), защото
// контейнерът е нагласен със `SUBFOLDER=/desktop/` — тоест той сам очаква
// префикса. Отрязването му тук би счупило вътрешните му връзки.
// Панелът и десктопът делят ЕДИН произход (`/desktop/` е път на самия панел),
// затова браузърът праща едни и същи бисквитки и на двамата. Сляпото триене
// обаче чупи десктопа, а сляпото препращане изнася сесията на панела в чужд
// контейнер. Затова: пуска се всичко ОСВЕН нашата сесийна бисквитка.
export const PANEL_COOKIE = 'csd_sess';
export function forwardCookies(raw) {
  if (!raw) return undefined;
  const keep = String(raw)
    .split(';')
    .filter((c) => {
      const name = c.trim().split('=')[0].toLowerCase();
      if (!name) return false;
      // И ДВЕТЕ имена на нашата сесия. Зад прокси тя се казва
      // `__Host-csd_sess`; филтър само по голото име би пропуснал точно
      // работещия вариант в производство и би изнесъл сесията на панела в чужд
      // контейнер — тоест защитата от префикса щеше да отвори друга дупка.
      return name !== PANEL_COOKIE.toLowerCase() && name !== `__host-${PANEL_COOKIE.toLowerCase()}`;
    });
  return keep.length ? keep.join(';').trim() : undefined;
}

// Заглавката с паролата се препраща САМО когато е `Basic` — тоест втория слой
// на самия десктоп (KasmVNC пази сесията с Basic-auth). `Bearer` е жетонът на
// ПАНЕЛА и няма работа в чужд контейнер.
//
// Дотук се триеше безусловно и това правеше десктопа НЕИЗПОЛЗВАЕМ: контейнерът
// връща 401, браузърът пита за парола, потребителят я въвежда, проксито я
// изхвърля, контейнерът пак връща 401 — безкраен цикъл, при който изглежда, че
// „паролата е грешна". Хванато на живо: нито едно име не минаваше, защото до
// контейнера изобщо не стигаха данни за вход.
export function forwardAuth(raw) {
  return /^basic\s/i.test(String(raw || '')) ? raw : undefined;
}

function upstreamHeaders(req, port) {
  const headers = { ...req.headers };
  const cookie = forwardCookies(req.headers.cookie);
  const auth = forwardAuth(req.headers.authorization);
  if (cookie) headers.cookie = cookie;
  else delete headers.cookie;
  if (auth) headers.authorization = auth;
  else delete headers.authorization;
  headers.host = `127.0.0.1:${port}`;
  return headers;
}

export function proxyHttp(cfg, req, res) {
  const port = desktopPort(cfg);
  const headers = upstreamHeaders(req, port);
  const up = http.request(
    { host: '127.0.0.1', port, path: req.url, method: req.method, headers, timeout: 30000 },
    (r) => {
      res.writeHead(r.statusCode || 502, stripHop(r.headers));
      r.pipe(res);
    }
  );
  up.on('timeout', () => up.destroy(new Error('timeout')));
  up.on('error', (err) => {
    if (res.headersSent) return res.destroy();
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: `Десктопът не отговаря: ${err.message}` }));
  });
  req.pipe(up);
  res.on('close', () => up.destroy());
}

// WebSocket. Тук няма помощник в стандартната библиотека: пращаме ръчно
// ръкостискането нагоре и, ако мине, слепваме двата сокета байт за байт.
export function proxyUpgrade(cfg, req, socket, head) {
  const port = desktopPort(cfg);
  // Същото правило и за сокета: VNC е WebSocket от първата до последната заявка,
  // а KasmVNC пази сесията си с бисквитка, дадена след Basic-auth. Изхвърлиш ли
  // я тук, ръкостискането се отказва и рамката остава черна, докато HTTP частта
  // изглежда наред.
  const headers = upstreamHeaders(req, port);
  const up = http.request({ host: '127.0.0.1', port, path: req.url, method: req.method, headers });
  up.on('upgrade', (upRes, upSocket, upHead) => {
    const lines = [`HTTP/1.1 ${upRes.statusCode} ${upRes.statusMessage}`];
    for (const [k, v] of Object.entries(upRes.headers)) {
      for (const one of Array.isArray(v) ? v : [v]) lines.push(`${k}: ${one}`);
    }
    socket.write(lines.join('\r\n') + '\r\n\r\n');
    if (upHead?.length) socket.unshift(upHead);
    upSocket.on('error', () => socket.destroy());
    socket.on('error', () => upSocket.destroy());
    upSocket.pipe(socket).pipe(upSocket);
  });
  up.on('response', (r) => {
    // Отказано надграждане — връщаме статуса, вместо да оставим сокета да виси.
    socket.write(`HTTP/1.1 ${r.statusCode} ${r.statusMessage}\r\n\r\n`);
    socket.destroy();
  });
  up.on('error', () => socket.destroy());
  if (head?.length) up.write(head);
  up.end();
}

const HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer']);
function stripHop(h) {
  const out = {};
  for (const [k, v] of Object.entries(h)) if (!HOP.has(k.toLowerCase())) out[k] = v;
  return out;
}
